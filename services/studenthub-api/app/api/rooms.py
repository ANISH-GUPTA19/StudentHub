import uuid
from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.auth import require_roles, require_user
from app.core.database import get_db
from app.models.entities import Hostel, Payment, Room, RoomBooking, RoomImage
from app.schemas.contracts import (
    HostelCreateRequest,
    HostelUpdateRequest,
    RoomBookingCancelRequest,
    RoomBookingCreateRequest,
    RoomBookingStatusUpdateRequest,
    RoomCreateRequest,
    RoomUpdateRequest,
)
from app.services.seed import create_notification

rooms_router = APIRouter(prefix="/api", tags=["rooms"])

ACTIVE_BOOKING_STATUSES = {"Pending", "Confirmed", "Payment Pending", "Paid"}
OCCUPYING_BOOKING_STATUSES = {"Confirmed", "Payment Pending", "Paid"}


def _add_months(start: date, months: int) -> date:
    month = start.month - 1 + months
    year = start.year + month // 12
    month = month % 12 + 1
    # Clamp day to end of target month
    days_in_month = [31, 29 if year % 4 == 0 and (year % 100 != 0 or year % 400 == 0) else 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1]
    return date(year, month, min(start.day, days_in_month))


def _dates_overlap(a_start: str, a_end: str, b_start: str, b_end: str) -> bool:
    return a_start < b_end and b_start < a_end


def _sync_hostel_counts(db: Session, hostel: Hostel) -> None:
    rooms = db.query(Room).filter(Room.hostel_id == hostel.id).all()
    if rooms:
        hostel.total_rooms = len(rooms)
        hostel.available_rooms = sum(1 for r in rooms if r.is_available and r.occupied < r.capacity)
        hostel.occupied = sum(r.occupied for r in rooms)
        hostel.capacity = sum(r.capacity for r in rooms)
        hostel.is_available = hostel.available_rooms > 0


def _serialize_room(room: Room) -> dict:
    return {
        "id": str(room.id),
        "hostelId": str(room.hostel_id),
        "roomNumber": room.room_number,
        "roomType": room.room_type,
        "capacity": room.capacity,
        "occupied": room.occupied,
        "spotsLeft": max(0, room.capacity - room.occupied),
        "monthlyRent": room.monthly_rent,
        "securityDeposit": room.security_deposit,
        "isAvailable": room.is_available and room.occupied < room.capacity,
    }


def _serialize_hostel(hostel: Hostel, include_details: bool = True) -> dict:
    amenities = [item.strip() for item in (hostel.amenities or "").split("|") if item.strip()]
    rules = [item.strip() for item in (hostel.rules or "").split("|") if item.strip()]
    gallery = [img.image_url for img in sorted(hostel.images, key=lambda x: x.sort_order)]
    if hostel.image_url and hostel.image_url not in gallery:
        gallery.insert(0, hostel.image_url)
    primary_image = hostel.image_url or (gallery[0] if gallery else None)

    data = {
        "id": str(hostel.id),
        "ownerId": str(hostel.owner_id) if hostel.owner_id else None,
        "name": hostel.name,
        "area": hostel.area,
        "location": hostel.location or hostel.area,
        "address": hostel.address or f"{hostel.name}, {hostel.area}",
        "contactName": hostel.contact_name,
        "contactPhone": hostel.contact_phone,
        "rent": hostel.rent,
        "securityDeposit": hostel.security_deposit,
        "otherCharges": hostel.other_charges,
        "rating": hostel.rating,
        "verified": hostel.verified,
        "amenities": amenities,
        "rules": rules,
        "roomType": hostel.room_type,
        "genderPreference": hostel.gender_preference,
        "capacity": hostel.capacity,
        "occupied": hostel.occupied,
        "totalRooms": hostel.total_rooms,
        "availableRooms": hostel.available_rooms,
        "isAvailable": hostel.is_available and hostel.available_rooms > 0,
        "description": hostel.description,
        "image": primary_image,
        "images": gallery,
    }
    if include_details:
        data["rooms"] = [_serialize_room(r) for r in sorted(hostel.rooms, key=lambda x: x.id)]
    return data


def _serialize_booking(booking: RoomBooking, db: Session | None = None) -> dict:
    payment = None
    if db is not None:
        payment = (
            db.query(Payment)
            .filter(Payment.payment_type == "booking", Payment.reference_id == booking.id)
            .order_by(Payment.id.desc())
            .first()
        )
    return {
        "id": str(booking.id),
        "bookingCode": booking.booking_code,
        "studentId": str(booking.student_id),
        "studentName": booking.student.name if booking.student else f"Student #{booking.student_id}",
        "hostelId": str(booking.hostel_id),
        "hostelName": booking.hostel.name if booking.hostel else "Hostel",
        "hostelArea": booking.hostel.area if booking.hostel else "",
        "roomId": str(booking.room_id) if booking.room_id else None,
        "roomNumber": booking.room.room_number if booking.room else "Standard Room",
        "roomType": booking.room.room_type if booking.room else (booking.hostel.room_type if booking.hostel else "Shared"),
        "ownerId": str(booking.owner_id) if booking.owner_id else None,
        "checkInDate": booking.check_in_date,
        "checkOutDate": booking.check_out_date,
        "durationMonths": booking.duration_months,
        "monthlyRent": booking.monthly_rent,
        "securityDeposit": booking.security_deposit,
        "otherCharges": booking.other_charges,
        "totalAmount": booking.total_amount,
        "status": booking.status,
        "notes": booking.notes,
        "cancellationReason": booking.cancellation_reason,
        "createdAt": booking.created_at.isoformat() if booking.created_at else "",
        "payment": {
            "id": str(payment.id),
            "status": payment.status,
            "gateway": payment.gateway,
            "gatewayOrderId": payment.gateway_order_id,
            "gatewayPaymentId": payment.gateway_payment_id,
        }
        if payment
        else None,
    }


@rooms_router.get("/hostels")
def list_hostels(
    search: str | None = None,
    area: str | None = None,
    location: str | None = None,
    max_rent: float | None = None,
    min_rent: float | None = None,
    amenities: str | None = None,
    gender: str | None = None,
    room_type: str | None = None,
    available_only: bool = False,
    db: Session = Depends(get_db),
):
    query = db.query(Hostel)
    if search:
        term = f"%{search.strip()}%"
        query = query.filter(Hostel.name.ilike(term) | Hostel.area.ilike(term) | Hostel.location.ilike(term) | Hostel.address.ilike(term))
    if area:
        query = query.filter(Hostel.area.ilike(f"%{area.strip()}%"))
    if location:
        query = query.filter(Hostel.location.ilike(f"%{location.strip()}%") | Hostel.area.ilike(f"%{location.strip()}%"))
    if min_rent is not None:
        query = query.filter(Hostel.rent >= min_rent)
    if max_rent is not None:
        query = query.filter(Hostel.rent <= max_rent)
    if gender and gender.lower() not in {"all", "any"}:
        query = query.filter((Hostel.gender_preference.ilike(gender.strip())) | (Hostel.gender_preference == "Any"))
    if room_type and room_type.lower() != "all":
        query = query.filter(Hostel.room_type.ilike(f"%{room_type.strip()}%"))
    if available_only:
        query = query.filter(Hostel.is_available == True, Hostel.available_rooms > 0)

    rows = query.order_by(Hostel.rating.desc(), Hostel.id.desc()).all()
    wanted = [item.strip().lower() for item in (amenities or "").split(",") if item.strip()]
    result = []
    for row in rows:
        row_amenities = [item.strip() for item in (row.amenities or "").split("|") if item.strip()]
        if wanted and not all(any(w in available.lower() for available in row_amenities) for w in wanted):
            continue
        result.append(_serialize_hostel(row, include_details=True))
    return {"hostels": result, "pagination": {"page": 1, "pageSize": 50, "total": len(result)}}


@rooms_router.get("/hostels/{hostel_id}")
def get_hostel_detail(hostel_id: int, db: Session = Depends(get_db)):
    hostel = db.get(Hostel, hostel_id)
    if not hostel:
        raise HTTPException(status_code=404, detail="Hostel or PG listing not found")
    return {"hostel": _serialize_hostel(hostel, include_details=True)}


@rooms_router.post("/hostels", status_code=201)
def create_hostel(
    body: HostelCreateRequest,
    user: dict = Depends(require_roles("hostel_owner", "admin")),
    db: Session = Depends(get_db),
):
    images = [u.strip() for u in body.imageUrls if u.strip()]
    primary_img = body.imageUrl or (images[0] if images else None)
    if primary_img and primary_img not in images:
        images.insert(0, primary_img)

    row = Hostel(
        owner_id=int(user["sub"]),
        name=body.name.strip(),
        area=body.area.strip(),
        location=(body.location or body.area).strip(),
        address=(body.address or f"{body.name.strip()}, {body.area.strip()}").strip(),
        contact_name=body.contactName.strip() or user["name"],
        contact_phone=body.contactPhone.strip(),
        rent=round(body.rent, 2),
        security_deposit=round(body.securityDeposit, 2),
        other_charges=round(body.otherCharges, 2),
        rating=body.rating,
        verified=user["role"] == "admin",
        amenities="|".join(a.strip() for a in body.amenities if a.strip()),
        rules="|".join(r.strip() for r in body.rules if r.strip()),
        room_type=body.roomType.strip(),
        gender_preference=body.genderPreference,
        capacity=body.capacity,
        occupied=0,
        total_rooms=body.totalRooms,
        available_rooms=body.availableRooms,
        is_available=body.availableRooms > 0,
        description=body.description.strip(),
        image_url=primary_img,
    )
    db.add(row)
    db.commit()
    db.refresh(row)

    for idx, url in enumerate(images):
        db.add(RoomImage(hostel_id=row.id, image_url=url, caption=f"{row.name} photo {idx + 1}", sort_order=idx))

    db.add(
        Room(
            hostel_id=row.id,
            room_number="101",
            room_type=row.room_type,
            capacity=row.capacity,
            occupied=0,
            monthly_rent=row.rent,
            security_deposit=row.security_deposit,
            is_available=row.is_available,
        )
    )
    db.commit()
    db.refresh(row)
    _sync_hostel_counts(db, row)
    db.commit()
    db.refresh(row)
    return {"hostel": _serialize_hostel(row, include_details=True)}


@rooms_router.put("/hostels/{hostel_id}")
def update_hostel(
    hostel_id: int,
    body: HostelUpdateRequest,
    user: dict = Depends(require_roles("hostel_owner", "admin")),
    db: Session = Depends(get_db),
):
    hostel = db.get(Hostel, hostel_id)
    if not hostel:
        raise HTTPException(status_code=404, detail="Hostel not found")
    if hostel.owner_id != int(user["sub"]) and user["role"] != "admin":
        raise HTTPException(status_code=403, detail="You can only edit your own listings")

    if body.name is not None:
        hostel.name = body.name.strip()
    if body.area is not None:
        hostel.area = body.area.strip()
    if body.location is not None:
        hostel.location = body.location.strip()
    if body.address is not None:
        hostel.address = body.address.strip()
    if body.contactName is not None:
        hostel.contact_name = body.contactName.strip()
    if body.contactPhone is not None:
        hostel.contact_phone = body.contactPhone.strip()
    if body.rent is not None:
        hostel.rent = round(body.rent, 2)
    if body.securityDeposit is not None:
        hostel.security_deposit = round(body.securityDeposit, 2)
    if body.otherCharges is not None:
        hostel.other_charges = round(body.otherCharges, 2)
    if body.amenities is not None:
        hostel.amenities = "|".join(a.strip() for a in body.amenities if a.strip())
    if body.rules is not None:
        hostel.rules = "|".join(r.strip() for r in body.rules if r.strip())
    if body.roomType is not None:
        hostel.room_type = body.roomType.strip()
    if body.genderPreference is not None:
        hostel.gender_preference = body.genderPreference
    if body.availableRooms is not None:
        hostel.available_rooms = body.availableRooms
    if body.isAvailable is not None:
        hostel.is_available = body.isAvailable
    if body.description is not None:
        hostel.description = body.description.strip()
    if body.imageUrls is not None:
        db.query(RoomImage).filter(RoomImage.hostel_id == hostel.id).delete()
        cleaned = [u.strip() for u in body.imageUrls if u.strip()]
        if cleaned:
            hostel.image_url = cleaned[0]
        for idx, url in enumerate(cleaned):
            db.add(RoomImage(hostel_id=hostel.id, image_url=url, caption=f"{hostel.name} photo {idx + 1}", sort_order=idx))

    db.commit()
    db.refresh(hostel)
    return {"hostel": _serialize_hostel(hostel, include_details=True)}


@rooms_router.post("/hostels/{hostel_id}/rooms", status_code=201)
def add_room_to_hostel(
    hostel_id: int,
    body: RoomCreateRequest,
    user: dict = Depends(require_roles("hostel_owner", "admin")),
    db: Session = Depends(get_db),
):
    hostel = db.get(Hostel, hostel_id)
    if not hostel:
        raise HTTPException(status_code=404, detail="Hostel not found")
    if hostel.owner_id != int(user["sub"]) and user["role"] != "admin":
        raise HTTPException(status_code=403, detail="You can only manage rooms for your own listings")
    if body.occupied > body.capacity:
        raise HTTPException(status_code=400, detail="Occupied beds cannot exceed room capacity")

    room = Room(
        hostel_id=hostel.id,
        room_number=body.roomNumber.strip(),
        room_type=body.roomType.strip(),
        capacity=body.capacity,
        occupied=body.occupied,
        monthly_rent=round(body.monthlyRent, 2),
        security_deposit=round(body.securityDeposit, 2),
        is_available=body.isAvailable and body.occupied < body.capacity,
    )
    db.add(room)
    db.commit()
    db.refresh(room)
    _sync_hostel_counts(db, hostel)
    db.commit()
    return {"room": _serialize_room(room)}


@rooms_router.patch("/rooms/{room_id}")
def update_room(
    room_id: int,
    body: RoomUpdateRequest,
    user: dict = Depends(require_roles("hostel_owner", "admin")),
    db: Session = Depends(get_db),
):
    room = db.get(Room, room_id)
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    hostel = db.get(Hostel, room.hostel_id)
    if not hostel or (hostel.owner_id != int(user["sub"]) and user["role"] != "admin"):
        raise HTTPException(status_code=403, detail="You can only manage rooms for your own listings")

    new_cap = body.capacity if body.capacity is not None else room.capacity
    new_occ = body.occupied if body.occupied is not None else room.occupied
    if new_occ > new_cap:
        raise HTTPException(status_code=400, detail="Occupied count cannot exceed room capacity")

    if body.roomType is not None:
        room.room_type = body.roomType.strip()
    room.capacity = new_cap
    room.occupied = new_occ
    if body.monthlyRent is not None:
        room.monthly_rent = round(body.monthlyRent, 2)
    if body.securityDeposit is not None:
        room.security_deposit = round(body.securityDeposit, 2)
    if body.isAvailable is not None:
        room.is_available = body.isAvailable and room.occupied < room.capacity
    else:
        room.is_available = room.occupied < room.capacity

    db.commit()
    _sync_hostel_counts(db, hostel)
    db.commit()
    db.refresh(room)
    return {"room": _serialize_room(room)}


@rooms_router.get("/hostels/{hostel_id}/availability")
def check_room_availability(
    hostel_id: int,
    check_in_date: str,
    duration_months: int = 1,
    room_id: int | None = None,
    db: Session = Depends(get_db),
):
    hostel = db.get(Hostel, hostel_id)
    if not hostel:
        raise HTTPException(status_code=404, detail="Hostel not found")
    try:
        start = date.fromisoformat(check_in_date)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail="Invalid check-in date format (expected YYYY-MM-DD)") from exc
    if duration_months < 1 or duration_months > 36:
        raise HTTPException(status_code=422, detail="Duration must be between 1 and 36 months")
    end_str = _add_months(start, duration_months).isoformat()

    rooms = [db.get(Room, room_id)] if room_id else db.query(Room).filter(Room.hostel_id == hostel.id).all()
    available_rooms = []
    for room in rooms:
        if not room or room.hostel_id != hostel.id:
            continue
        if not room.is_available or room.occupied >= room.capacity:
            continue
        overlapping = (
            db.query(RoomBooking)
            .filter(RoomBooking.room_id == room.id, RoomBooking.status.in_(OCCUPYING_BOOKING_STATUSES))
            .all()
        )
        overlap_count = sum(1 for b in overlapping if _dates_overlap(check_in_date, end_str, b.check_in_date, b.check_out_date))
        if room.occupied + overlap_count < room.capacity:
            monthly_rent = room.monthly_rent
            security_deposit = room.security_deposit or hostel.security_deposit
            other_charges = hostel.other_charges
            total = round(monthly_rent * duration_months + security_deposit + other_charges, 2)
            available_rooms.append(
                {
                    **_serialize_room(room),
                    "checkInDate": check_in_date,
                    "checkOutDate": end_str,
                    "durationMonths": duration_months,
                    "otherCharges": other_charges,
                    "totalAmount": total,
                }
            )
    return {"available": len(available_rooms) > 0, "checkOutDate": end_str, "rooms": available_rooms}


@rooms_router.post("/room-bookings", status_code=201)
def create_room_booking(
    body: RoomBookingCreateRequest,
    user: dict = Depends(require_roles("student")),
    db: Session = Depends(get_db),
):
    student_id = int(user["sub"])
    hostel = db.get(Hostel, body.hostelId)
    if not hostel:
        raise HTTPException(status_code=404, detail="Hostel listing not found")

    try:
        start = date.fromisoformat(body.checkInDate)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail="Invalid check-in date") from exc
    if start < date.today():
        raise HTTPException(status_code=422, detail="Check-in date cannot be in the past")
    check_out_str = _add_months(start, body.durationMonths).isoformat()

    # Prevent duplicate booking by the same student for overlapping dates on this hostel
    student_existing = (
        db.query(RoomBooking)
        .filter(
            RoomBooking.student_id == student_id,
            RoomBooking.hostel_id == hostel.id,
            RoomBooking.status.in_(ACTIVE_BOOKING_STATUSES),
        )
        .all()
    )
    for existing in student_existing:
        if _dates_overlap(body.checkInDate, check_out_str, existing.check_in_date, existing.check_out_date):
            raise HTTPException(
                status_code=409,
                detail=f"You already have an active booking ({existing.booking_code}) for this property on overlapping dates",
            )

    # Pick requested room or first available room
    if body.roomId:
        room = db.get(Room, body.roomId)
        if not room or room.hostel_id != hostel.id:
            raise HTTPException(status_code=404, detail="Selected room does not belong to this hostel")
    else:
        room = db.query(Room).filter(Room.hostel_id == hostel.id, Room.is_available == True).order_by(Room.id.asc()).first()
        if not room:
            raise HTTPException(status_code=409, detail="No rooms are currently available in this property")

    if not room.is_available or room.occupied >= room.capacity:
        raise HTTPException(status_code=409, detail="Selected room is full or unavailable")

    overlapping = (
        db.query(RoomBooking)
        .filter(RoomBooking.room_id == room.id, RoomBooking.status.in_(OCCUPYING_BOOKING_STATUSES))
        .all()
    )
    overlap_count = sum(1 for b in overlapping if _dates_overlap(body.checkInDate, check_out_str, b.check_in_date, b.check_out_date))
    if room.occupied + overlap_count >= room.capacity:
        raise HTTPException(status_code=409, detail="Selected room is already booked for these dates")

    monthly_rent = room.monthly_rent or hostel.rent
    security_deposit = room.security_deposit or hostel.security_deposit
    other_charges = hostel.other_charges
    total_amount = round(monthly_rent * body.durationMonths + security_deposit + other_charges, 2)

    initial_status = "Payment Pending" if hostel.owner_id is None else "Pending"
    booking = RoomBooking(
        booking_code=f"BK-{uuid.uuid4().hex[:8].upper()}",
        student_id=student_id,
        hostel_id=hostel.id,
        room_id=room.id,
        owner_id=hostel.owner_id,
        check_in_date=body.checkInDate,
        duration_months=body.durationMonths,
        check_out_date=check_out_str,
        monthly_rent=monthly_rent,
        security_deposit=security_deposit,
        other_charges=other_charges,
        total_amount=total_amount,
        status=initial_status,
        notes=body.notes.strip(),
    )
    db.add(booking)
    db.commit()
    db.refresh(booking)

    create_notification(
        db,
        student_id,
        f"Booking {booking.booking_code} submitted",
        (
            f"Room {room.room_number} at {hostel.name} is reserved for checkout. Complete payment to confirm."
            if initial_status == "Payment Pending"
            else f"Your room booking request for {hostel.name} (Room {room.room_number}) is pending owner confirmation."
        ),
        category="booking",
        link="/bookings",
    )
    if hostel.owner_id:
        create_notification(
            db,
            hostel.owner_id,
            f"New room booking {booking.booking_code}",
            f"{user['name']} requested Room {room.room_number} at {hostel.name} starting {body.checkInDate}.",
            category="booking",
            link="/owner",
        )
    db.commit()
    db.refresh(booking)
    return {"booking": _serialize_booking(booking, db)}


@rooms_router.get("/room-bookings")
def list_my_room_bookings(user: dict = Depends(require_user), db: Session = Depends(get_db)):
    query = db.query(RoomBooking)
    if user["role"] != "admin":
        query = query.filter(RoomBooking.student_id == int(user["sub"]))
    bookings = query.order_by(RoomBooking.id.desc()).all()
    return {"bookings": [_serialize_booking(b, db) for b in bookings]}


@rooms_router.get("/owner/room-bookings")
def list_owner_room_bookings(
    user: dict = Depends(require_roles("hostel_owner", "admin")),
    db: Session = Depends(get_db),
):
    query = db.query(RoomBooking)
    if user["role"] != "admin":
        query = query.filter(RoomBooking.owner_id == int(user["sub"]))
    bookings = query.order_by(RoomBooking.id.desc()).all()
    return {"bookings": [_serialize_booking(b, db) for b in bookings]}


@rooms_router.patch("/owner/room-bookings/{booking_id}")
def update_owner_room_booking(
    booking_id: int,
    body: RoomBookingStatusUpdateRequest,
    user: dict = Depends(require_roles("hostel_owner", "admin")),
    db: Session = Depends(get_db),
):
    booking = db.get(RoomBooking, booking_id)
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    hostel = db.get(Hostel, booking.hostel_id)
    owner_id = booking.owner_id or (hostel.owner_id if hostel else None)
    if user["role"] != "admin" and owner_id != int(user["sub"]):
        raise HTTPException(status_code=403, detail="You can only manage bookings for your own properties")
    if booking.status == "Paid" and body.status != "Cancelled":
        raise HTTPException(status_code=409, detail="Paid bookings cannot be reverted")
    if booking.status == "Cancelled":
        raise HTTPException(status_code=409, detail="Cancelled bookings cannot be updated")

    room = db.get(Room, booking.room_id) if booking.room_id else None
    if body.status in {"Confirmed", "Payment Pending"} and booking.status == "Pending" and room:
        overlapping = (
            db.query(RoomBooking)
            .filter(
                RoomBooking.room_id == room.id,
                RoomBooking.id != booking.id,
                RoomBooking.status.in_(OCCUPYING_BOOKING_STATUSES),
            )
            .all()
        )
        overlap_count = sum(
            1 for b in overlapping if _dates_overlap(booking.check_in_date, booking.check_out_date, b.check_in_date, b.check_out_date)
        )
        if room.occupied + overlap_count >= room.capacity:
            raise HTTPException(status_code=409, detail="Room capacity is already full for these dates")

    if body.status in {"Rejected", "Cancelled"} and booking.status == "Paid" and room and room.occupied > 0:
        room.occupied -= 1
        room.is_available = room.occupied < room.capacity
        if hostel:
            _sync_hostel_counts(db, hostel)

    booking.status = body.status
    if body.reason:
        booking.cancellation_reason = body.reason.strip()
    booking.updated_at = datetime.now(timezone.utc)

    create_notification(
        db,
        booking.student_id,
        f"Booking {booking.booking_code}: {body.status}",
        f"Your booking for {hostel.name if hostel else 'room'} is now {body.status}.",
        category="booking",
        link="/bookings",
    )
    db.commit()
    db.refresh(booking)
    return {"booking": _serialize_booking(booking, db)}


@rooms_router.post("/room-bookings/{booking_id}/cancel")
def cancel_room_booking(
    booking_id: int,
    body: RoomBookingCancelRequest,
    user: dict = Depends(require_roles("student", "admin")),
    db: Session = Depends(get_db),
):
    booking = db.get(RoomBooking, booking_id)
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    if user["role"] != "admin" and booking.student_id != int(user["sub"]):
        raise HTTPException(status_code=403, detail="You can only cancel your own bookings")
    if booking.status in {"Cancelled", "Rejected"}:
        raise HTTPException(status_code=409, detail=f"Booking is already {booking.status}")

    # Cancellation rule: Paid bookings can only be cancelled before the check-in date
    if booking.status == "Paid":
        if date.today().isoformat() >= booking.check_in_date:
            raise HTTPException(status_code=409, detail="Paid bookings cannot be cancelled on or after the check-in date")
        if booking.room_id:
            room = db.get(Room, booking.room_id)
            if room and room.occupied > 0:
                room.occupied -= 1
                room.is_available = room.occupied < room.capacity
        hostel = db.get(Hostel, booking.hostel_id)
        if hostel:
            _sync_hostel_counts(db, hostel)

    booking.status = "Cancelled"
    booking.cancellation_reason = body.reason.strip()
    booking.updated_at = datetime.now(timezone.utc)
    create_notification(
        db,
        booking.student_id,
        f"Booking {booking.booking_code} cancelled",
        body.reason.strip(),
        category="booking",
        link="/bookings",
    )
    if booking.owner_id:
        create_notification(
            db,
            booking.owner_id,
            f"Booking {booking.booking_code} cancelled",
            f"Student cancelled booking {booking.booking_code}.",
            category="booking",
            link="/owner",
        )
    db.commit()
    db.refresh(booking)
    return {"booking": _serialize_booking(booking, db)}
