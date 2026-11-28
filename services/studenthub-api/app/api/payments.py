import json
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from sqlalchemy.orm import Session

from app.core.auth import require_roles, require_user
from app.core.config import load_config
from app.core.database import get_db
from app.models.entities import Hostel, MessPlan, Payment, Product, ProductOrder, Room, RoomBooking
from app.schemas.contracts import PaymentFailRequest, PaymentOrderCreateRequest, PaymentVerifyRequest
from app.services.payment_gateway import (
    create_razorpay_order,
    is_razorpay_configured,
    verify_razorpay_signature,
    verify_razorpay_webhook_signature,
)
from app.services.seed import create_notification

payments_router = APIRouter(prefix="/api/payments", tags=["payments"])


def _serialize_payment(payment: Payment) -> dict:
    return {
        "id": str(payment.id),
        "userId": str(payment.user_id),
        "purpose": payment.purpose,
        "amount": payment.amount,
        "currency": payment.currency,
        "method": payment.method,
        "status": payment.status,
        "paymentType": payment.payment_type,
        "referenceId": str(payment.reference_id) if payment.reference_id is not None else None,
        "gateway": payment.gateway,
        "gatewayOrderId": payment.gateway_order_id,
        "gatewayPaymentId": payment.gateway_payment_id,
        "failureReason": payment.failure_reason,
        "createdAt": payment.created_at.isoformat() if payment.created_at else "",
    }


def _sync_hostel_counts(db: Session, hostel: Hostel) -> None:
    rooms = db.query(Room).filter(Room.hostel_id == hostel.id).all()
    if rooms:
        hostel.total_rooms = len(rooms)
        hostel.available_rooms = sum(1 for r in rooms if r.is_available and r.occupied < r.capacity)
        hostel.occupied = sum(r.occupied for r in rooms)
        hostel.capacity = sum(r.capacity for r in rooms)
        hostel.is_available = hostel.available_rooms > 0


def _finalize_paid_payment(db: Session, payment: Payment, gateway_payment_id: str | None, gateway_signature: str | None) -> None:
    if payment.status == "paid":
        return

    if payment.payment_type == "order" and payment.reference_id:
        order = db.get(ProductOrder, payment.reference_id)
        if not order:
            raise HTTPException(status_code=404, detail="Associated order not found")
        if order.status == "cancelled":
            raise HTTPException(status_code=409, detail="Cannot complete payment for a cancelled order")
        # Atomic stock validation and deduction
        for item in order.items:
            product = db.get(Product, item.product_id)
            if not product or not product.is_active or product.stock < item.quantity:
                payment.status = "failed"
                payment.failure_reason = f"Insufficient stock for {item.product_title}"
                order.payment_status = "failed"
                order.status = "payment_failed"
                db.commit()
                raise HTTPException(status_code=409, detail=f"Insufficient stock for {item.product_title}")
        for item in order.items:
            product = db.get(Product, item.product_id)
            if product:
                product.stock -= item.quantity
        order.payment_status = "paid"
        order.status = "paid"
        order.updated_at = datetime.now(timezone.utc)
        create_notification(
            db,
            order.student_id,
            f"Payment verified for {order.order_number}",
            f"₹{order.total_amount:,.2f} paid successfully. Your order is confirmed.",
            category="payment",
            link="/marketplace",
        )
        notified_sellers: set[int] = set()
        for item in order.items:
            if item.seller_id not in notified_sellers:
                create_notification(
                    db,
                    item.seller_id,
                    f"Paid order {order.order_number}",
                    f"Payment confirmed for {item.product_title}. Ready to pack and ship.",
                    category="order",
                    link="/owner",
                )
                notified_sellers.add(item.seller_id)

    elif payment.payment_type == "booking" and payment.reference_id:
        booking = db.get(RoomBooking, payment.reference_id)
        if not booking:
            raise HTTPException(status_code=404, detail="Associated booking not found")
        if booking.status in {"Cancelled", "Rejected"}:
            raise HTTPException(status_code=409, detail=f"Cannot pay for a {booking.status.lower()} booking")
        if booking.room_id:
            room = db.get(Room, booking.room_id)
            if room:
                if room.occupied >= room.capacity:
                    payment.status = "failed"
                    payment.failure_reason = "Selected room is now full"
                    db.commit()
                    raise HTTPException(status_code=409, detail="Selected room is no longer available")
                room.occupied += 1
                room.is_available = room.occupied < room.capacity
        hostel = db.get(Hostel, booking.hostel_id)
        if hostel:
            _sync_hostel_counts(db, hostel)
        booking.status = "Paid"
        booking.updated_at = datetime.now(timezone.utc)
        create_notification(
            db,
            booking.student_id,
            f"Booking {booking.booking_code} paid",
            f"₹{booking.total_amount:,.2f} verified for {hostel.name if hostel else 'your room'}.",
            category="payment",
            link="/bookings",
        )
        if booking.owner_id:
            create_notification(
                db,
                booking.owner_id,
                f"Payment received for {booking.booking_code}",
                f"Student completed payment of ₹{booking.total_amount:,.2f}.",
                category="payment",
                link="/owner",
            )

    payment.status = "paid"
    payment.gateway_payment_id = gateway_payment_id
    payment.gateway_signature = gateway_signature
    payment.failure_reason = None
    payment.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(payment)


@payments_router.get("/config")
def payment_config():
    config = load_config()
    configured = is_razorpay_configured(config)
    return {
        "gateway": "razorpay",
        "configured": configured,
        "keyId": config.razorpay_key_id if configured else None,
        "currency": "INR",
        "mode": "test" if (config.razorpay_key_id or "").startswith("rzp_test_") else ("live" if configured else "unconfigured"),
        "requiredEnv": ["RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET"],
        "instructions": "Set RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, and RAZORPAY_WEBHOOK_SECRET in .env to enable Razorpay checkout and signature verification.",
    }


@payments_router.get("")
def list_payments(user: dict = Depends(require_user), db: Session = Depends(get_db)):
    query = db.query(Payment)
    if user["role"] != "admin":
        query = query.filter(Payment.user_id == int(user["sub"]))
    rows = query.order_by(Payment.id.desc()).all()
    return {"payments": [_serialize_payment(row) for row in rows]}


@payments_router.post("/create-order", status_code=201)
def create_payment_order(
    body: PaymentOrderCreateRequest,
    user: dict = Depends(require_roles("student")),
    db: Session = Depends(get_db),
):
    student_id = int(user["sub"])
    config = load_config()

    if body.idempotencyKey:
        existing_idem = (
            db.query(Payment)
            .filter(Payment.user_id == student_id, Payment.idempotency_key == body.idempotencyKey)
            .first()
        )
        if existing_idem:
            return {
                "payment": _serialize_payment(existing_idem),
                "gatewayConfigured": is_razorpay_configured(config),
                "keyId": config.razorpay_key_id if is_razorpay_configured(config) else None,
                "amountPaise": int(round(existing_idem.amount * 100)),
                "currency": existing_idem.currency,
            }

    # Prevent duplicate payment for already paid reference
    already_paid = (
        db.query(Payment)
        .filter(
            Payment.payment_type == body.paymentType,
            Payment.reference_id == body.referenceId,
            Payment.status.in_(["paid", "completed"]),
        )
        .first()
    )
    if already_paid:
        raise HTTPException(status_code=409, detail="Payment has already been completed for this item")

    # Compute authoritative amount on the backend
    if body.paymentType == "order":
        order = db.get(ProductOrder, body.referenceId)
        if not order or order.student_id != student_id:
            raise HTTPException(status_code=404, detail="Order not found")
        if order.status in {"cancelled", "rejected"} or order.payment_status == "paid":
            raise HTTPException(status_code=409, detail=f"Order cannot be paid in status '{order.status}'")
        for item in order.items:
            product = db.get(Product, item.product_id)
            if not product or not product.is_active or product.stock < item.quantity:
                raise HTTPException(status_code=409, detail=f"Insufficient stock for {item.product_title}")
        amount = order.total_amount
        purpose = f"Order {order.order_number}"
        receipt = order.order_number
    elif body.paymentType == "booking":
        booking = db.get(RoomBooking, body.referenceId)
        if not booking or booking.student_id != student_id:
            raise HTTPException(status_code=404, detail="Room booking not found")
        if booking.status not in {"Confirmed", "Payment Pending"}:
            raise HTTPException(
                status_code=409,
                detail=f"Booking must be confirmed before payment (current status: {booking.status})",
            )
        if booking.status == "Confirmed":
            booking.status = "Payment Pending"
        amount = booking.total_amount
        purpose = f"Room Booking {booking.booking_code}"
        receipt = booking.booking_code
    else:
        plan = db.get(MessPlan, body.referenceId)
        amount = plan.price if plan else 2800.0
        purpose = f"Mess Plan: {plan.name}" if plan else "Monthly Mess Plan"
        receipt = f"MESS-{body.referenceId}"

    # Reuse existing pending gateway order if already created for this reference
    existing_pending = (
        db.query(Payment)
        .filter(
            Payment.user_id == student_id,
            Payment.payment_type == body.paymentType,
            Payment.reference_id == body.referenceId,
            Payment.status == "pending",
        )
        .order_by(Payment.id.desc())
        .first()
    )
    if existing_pending and existing_pending.gateway_order_id and abs(existing_pending.amount - amount) < 0.01:
        return {
            "payment": _serialize_payment(existing_pending),
            "gatewayConfigured": is_razorpay_configured(config),
            "keyId": config.razorpay_key_id if is_razorpay_configured(config) else None,
            "amountPaise": int(round(existing_pending.amount * 100)),
            "currency": existing_pending.currency,
        }

    configured = is_razorpay_configured(config)
    gateway_order_id = None
    failure_reason = None
    if configured:
        try:
            rzp_order = create_razorpay_order(
                config,
                amount_rupees=amount,
                currency="INR",
                receipt=receipt,
                notes={"paymentType": body.paymentType, "referenceId": str(body.referenceId), "studentId": str(student_id)},
            )
            gateway_order_id = rzp_order.get("id")
        except RuntimeError as exc:
            raise HTTPException(status_code=502, detail=str(exc)) from exc
    else:
        failure_reason = "Razorpay credentials (RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET) are not configured"

    payment = existing_pending if (existing_pending and not existing_pending.gateway_order_id) else Payment(
        user_id=student_id,
        purpose=purpose[:120],
        amount=round(amount, 2),
        method="razorpay",
        status="pending",
        payment_type=body.paymentType,
        reference_id=body.referenceId,
        gateway="razorpay",
        gateway_order_id=gateway_order_id,
        currency="INR",
        failure_reason=failure_reason,
        idempotency_key=body.idempotencyKey or f"{body.paymentType}-{body.referenceId}-{uuid.uuid4().hex[:8]}",
    )
    if payment.id is None:
        db.add(payment)
    else:
        payment.amount = round(amount, 2)
        payment.gateway_order_id = gateway_order_id
        payment.failure_reason = failure_reason
    db.commit()
    db.refresh(payment)

    return {
        "payment": _serialize_payment(payment),
        "gatewayConfigured": configured,
        "keyId": config.razorpay_key_id if configured else None,
        "amountPaise": int(round(payment.amount * 100)),
        "currency": payment.currency,
        "requiredEnv": [] if configured else ["RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET"],
        "message": (
            "Razorpay order created. Complete payment in the checkout modal."
            if configured
            else "Payment gateway credentials are unavailable. Order/booking saved as Payment Pending; configure RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET to accept real payments."
        ),
    }


@payments_router.post("/verify")
def verify_payment(
    body: PaymentVerifyRequest,
    user: dict = Depends(require_roles("student")),
    db: Session = Depends(get_db),
):
    payment = db.get(Payment, body.paymentId)
    if not payment or payment.user_id != int(user["sub"]):
        raise HTTPException(status_code=404, detail="Payment record not found")

    if payment.status == "paid":
        return {"verified": True, "alreadyVerified": True, "payment": _serialize_payment(payment)}

    config = load_config()
    if not config.razorpay_key_secret:
        raise HTTPException(
            status_code=503,
            detail="Payment verification unavailable: RAZORPAY_KEY_SECRET is not configured on the server",
        )

    if not payment.gateway_order_id or payment.gateway_order_id != body.gatewayOrderId:
        raise HTTPException(status_code=400, detail="Gateway order ID mismatch")

    if not verify_razorpay_signature(
        config.razorpay_key_secret,
        body.gatewayOrderId,
        body.gatewayPaymentId,
        body.gatewaySignature,
    ):
        payment.status = "failed"
        payment.failure_reason = "Invalid payment signature"
        payment.updated_at = datetime.now(timezone.utc)
        db.commit()
        raise HTTPException(status_code=400, detail="Payment signature verification failed")

    _finalize_paid_payment(db, payment, body.gatewayPaymentId, body.gatewaySignature)
    return {"verified": True, "alreadyVerified": False, "payment": _serialize_payment(payment)}


@payments_router.post("/{payment_id}/fail")
def mark_payment_failed(
    payment_id: int,
    body: PaymentFailRequest,
    user: dict = Depends(require_roles("student")),
    db: Session = Depends(get_db),
):
    payment = db.get(Payment, payment_id)
    if not payment or payment.user_id != int(user["sub"]):
        raise HTTPException(status_code=404, detail="Payment record not found")
    if payment.status == "paid":
        raise HTTPException(status_code=409, detail="Paid transactions cannot be marked failed")

    reason_lower = body.reason.lower()
    payment.status = "cancelled" if "cancel" in reason_lower else "failed"
    payment.failure_reason = body.reason.strip()
    payment.updated_at = datetime.now(timezone.utc)

    if payment.payment_type == "order" and payment.reference_id:
        order = db.get(ProductOrder, payment.reference_id)
        if order and order.payment_status != "paid" and order.status != "cancelled":
            order.payment_status = "failed"
            order.status = "payment_failed" if payment.status == "failed" else "pending_payment"

    create_notification(
        db,
        payment.user_id,
        f"Payment {payment.status}",
        f"{payment.purpose}: {payment.failure_reason}",
        category="payment",
        link="/payments",
    )
    db.commit()
    db.refresh(payment)
    return {"payment": _serialize_payment(payment)}


@payments_router.post("/webhook/razorpay")
async def razorpay_webhook(
    request: Request,
    x_razorpay_signature: str | None = Header(default=None),
    db: Session = Depends(get_db),
):
    config = load_config()
    if not config.razorpay_webhook_secret:
        raise HTTPException(status_code=503, detail="RAZORPAY_WEBHOOK_SECRET is not configured")
    if not x_razorpay_signature:
        raise HTTPException(status_code=401, detail="Missing Razorpay webhook signature")

    raw_body = await request.body()
    if not verify_razorpay_webhook_signature(config.razorpay_webhook_secret, raw_body, x_razorpay_signature):
        raise HTTPException(status_code=401, detail="Invalid Razorpay webhook signature")

    event = json.loads(raw_body.decode("utf-8"))
    event_type = event.get("event", "")
    payment_entity = event.get("payload", {}).get("payment", {}).get("entity", {})
    order_id = payment_entity.get("order_id")
    payment_id_ext = payment_entity.get("id")

    if not order_id:
        return {"received": True, "ignored": True}

    payment = db.query(Payment).filter(Payment.gateway_order_id == order_id).first()
    if not payment:
        return {"received": True, "matched": False}

    if event_type in {"payment.captured", "order.paid"}:
        _finalize_paid_payment(db, payment, payment_id_ext, x_razorpay_signature)
    elif event_type == "payment.failed":
        if payment.status != "paid":
            payment.status = "failed"
            payment.gateway_payment_id = payment_id_ext
            payment.failure_reason = payment_entity.get("error_description") or "Payment failed at gateway"
            payment.updated_at = datetime.now(timezone.utc)
            db.commit()

    return {"received": True, "matched": True, "paymentId": str(payment.id), "status": payment.status}
