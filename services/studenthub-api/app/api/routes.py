import os
import uuid

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.core.auth import create_token, hash_password, require_user, verify_password
from app.core.config import load_config
from app.core.database import get_db
from app.models.entities import BookingRequest, Expense, Feedback, Hostel, MessPlan, OwnerListing, Payment, RoommateGroup, RoommateProfile, SupportRequest, User
from app.schemas.contracts import AIChatRequest, BookingRequestCreate, BookingStatusUpdate, ExpenseRequest, FeedbackRequest, HostelCreateRequest, LoginRequest, MarketplaceListingCreateRequest, MessPlanCreateRequest, PaymentRequest, RegisterRequest, ReportRequest, RoommateGroupRequest, RoommateProfileRequest, SupportRequestCreate, UploadRequest
from app.services.providers import OpenAIProvider, BlobStorageProvider

router = APIRouter(prefix="/api")

ROOMMATES = [
    {"id": "r1", "name": "Aarav Singh", "course": "Computer Science", "budget": "7000-9000", "match": 94, "preferences": ["Clean", "Early riser", "Quiet study"], "sleep": "Early riser", "study": "Quiet study", "diet": "Vegetarian", "hobbies": ["Reading", "Chess"], "avatar": ""},
    {"id": "r2", "name": "Meera Patel", "course": "Business Analytics", "budget": "6000-8500", "match": 88, "preferences": ["Vegetarian", "Night owl", "Gym"], "sleep": "Night owl", "study": "Group study", "diet": "Vegetarian", "hobbies": ["Gym", "Music"], "avatar": ""},
    {"id": "r3", "name": "Kabir Khan", "course": "Mechanical Engineering", "budget": "8000-10000", "match": 82, "preferences": ["Shared kitchen", "Clean", "Sports"], "sleep": "Flexible", "study": "Quiet study", "diet": "Vegetarian", "hobbies": ["Cricket", "Gaming"], "avatar": ""},
]


@router.get("/health")
def health(db: Session = Depends(get_db)):
    try:
        db.execute(__import__("sqlalchemy").text("SELECT 1"))
        return {"status": "healthy", "database": "connected", "storage": "configured"}
    except Exception as exc:
        raise HTTPException(status_code=503, detail="Database unavailable") from exc


@router.post("/auth/register", status_code=201)
def register(body: RegisterRequest, db: Session = Depends(get_db)):
    if body.role not in {"student", "hostel_owner", "mess_owner", "seller"}:
        raise HTTPException(status_code=403, detail="Admin accounts must be provisioned separately")
    email = body.email.strip().lower()
    if db.query(User).filter(User.email == email).first():
        raise HTTPException(status_code=409, detail="An account already exists for this email")
    email = body.email.strip().lower()
    user = User(name=body.name.strip(), email=email, password_hash=hash_password(body.password), role=body.role)
    db.add(user)
    db.commit()
    db.refresh(user)
    token = create_token(str(user.id), user.role)
    return {"user": {"id": str(user.id), "name": user.name, "email": user.email, "role": user.role}, "session": {"token": token}}


@router.post("/auth/login")
def login(body: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == body.email.strip().lower()).first()
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = create_token(str(user.id), user.role)
    return {"user": {"id": str(user.id), "name": user.name, "email": user.email, "role": user.role}, "session": {"token": token}}


@router.get("/auth/me")
def current_user(_user: dict = Depends(require_user), db: Session = Depends(get_db)):
    user = db.get(User, int(_user["sub"]))
    if not user:
        raise HTTPException(status_code=401, detail="Account not found")
    return {"user": {"id": str(user.id), "name": user.name, "email": user.email, "role": user.role}}


@router.get("/hostels")
def hostels(area: str | None = None, max_rent: float | None = None, amenities: str | None = None, db: Session = Depends(get_db)):
    query = db.query(Hostel)
    if area:
        query = query.filter(Hostel.area.ilike(f"%{area}%"))
    if max_rent:
        query = query.filter(Hostel.rent <= max_rent)
    rows = query.order_by(Hostel.rating.desc()).all()
    wanted = [item.strip().lower() for item in (amenities or "").split(",") if item.strip()]
    result = []
    for row in rows:
        row_amenities = [item.strip() for item in (row.amenities or "").split("|") if item.strip()]
        if wanted and not all(any(w in available.lower() for available in row_amenities) for w in wanted):
            continue
        result.append({"id": str(row.id), "name": row.name, "area": row.area, "rent": row.rent, "rating": row.rating, "verified": row.verified, "amenities": row_amenities, "image": row.image_url})
    return {"hostels": result, "pagination": {"page": 1, "pageSize": 20, "total": len(result)}}


@router.get("/hostels/compare")
def compare_hostels(ids: str, db: Session = Depends(get_db)):
    selected_ids = [int(value) for value in ids.split(",") if value.isdigit()]
    rows = db.query(Hostel).filter(Hostel.id.in_(selected_ids)).all()
    comparisons = []
    for row in rows:
        amenities = [item.strip() for item in (row.amenities or "").split("|") if item.strip()]
        safety_score = min(100, round(row.rating * 18 + (12 if "Security" in amenities else 0)))
        value_score = min(100, round((len(amenities) * 12) + max(0, 100 - (row.rent / 100))))
        comparisons.append({"id": str(row.id), "name": row.name, "area": row.area, "rent": row.rent, "rating": row.rating, "amenities": amenities, "safetyScore": safety_score, "valueScore": value_score, "image": row.image_url})
    cheapest = min(comparisons, key=lambda item: item["rent"])["id"] if comparisons else None
    safest = max(comparisons, key=lambda item: item["safetyScore"])["id"] if comparisons else None
    return {"rooms": comparisons, "recommendation": {"cheapest": cheapest, "safest": safest}}


@router.post("/hostels", status_code=201)
def create_hostel(body: HostelCreateRequest, _user: dict = Depends(require_user), db: Session = Depends(get_db)):
    if _user["role"] not in {"hostel_owner", "admin"}:
        raise HTTPException(status_code=403, detail="Only hostel owners can add rooms")
    row = Hostel(owner_id=int(_user["sub"]), name=body.name, area=body.area, rent=body.rent, rating=body.rating, verified=False, amenities="|".join(body.amenities), image_url=body.imageUrl)
    db.add(row)
    db.commit()
    db.refresh(row)
    return {"hostel": {"id": str(row.id), "name": row.name, "area": row.area, "rent": row.rent, "rating": row.rating, "verified": row.verified, "amenities": body.amenities, "image": row.image_url}}


@router.post("/uploads/image")
async def upload_image(file: UploadFile = File(...), _user: dict = Depends(require_user)):
    if _user["role"] not in {"hostel_owner", "mess_owner", "seller", "admin"}:
        raise HTTPException(status_code=403, detail="Only service owners can upload listing images")
    allowed_types = {"image/jpeg", "image/png", "image/webp", "image/gif"}
    if file.content_type not in allowed_types:
        raise HTTPException(status_code=400, detail="Only JPEG, PNG, WebP, and GIF images are allowed")
    content = await file.read()
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Image size exceeds the 5 MB limit")
    upload_dir = os.path.join(os.getcwd(), "uploads")
    os.makedirs(upload_dir, exist_ok=True)
    extension = os.path.splitext(file.filename or "image")[1].lower()
    allowed_extensions = {".jpg", ".jpeg", ".png", ".webp", ".gif"}
    if extension not in allowed_extensions:
        raise HTTPException(status_code=400, detail="Image file extension is not allowed")
    filename = f"{uuid.uuid4().hex}{extension}"
    destination = os.path.join(upload_dir, filename)
    with open(destination, "wb") as output:
        output.write(content)
    return {"objectUrl": f"/uploads/{filename}"}


@router.get("/decision/combinations")
def combination_recommendations(max_monthly_cost: float | None = None, db: Session = Depends(get_db)):
    rooms = db.query(Hostel).filter(Hostel.verified == True).order_by(Hostel.rating.desc()).all()
    mess_monthly = 2800
    transport_monthly = 1800
    essentials_monthly = 2200
    combinations = []
    for room in rooms:
        monthly_total = room.rent + mess_monthly + transport_monthly + essentials_monthly
        if max_monthly_cost and monthly_total > max_monthly_cost:
            continue
        amenities = [item.strip() for item in (room.amenities or "").split("|") if item.strip()]
        safety_score = min(100, round(room.rating * 18 + (12 if "Security" in amenities else 0)))
        roommate = max(ROOMMATES, key=lambda item: item["match"])
        score = round((room.rating / 5 * 35) + (safety_score * 0.35) + (roommate["match"] * 0.30))
        combinations.append({
            "id": f"combo-{room.id}", "room": {"id": str(room.id), "name": room.name, "area": room.area, "rent": room.rent, "amenities": amenities, "verified": room.verified, "image": room.image_url},
            "roommate": {"id": roommate["id"], "name": roommate["name"], "match": roommate["match"], "course": roommate["course"]},
            "mess": {"name": "North Campus Mess", "monthlyCost": mess_monthly, "status": "Approved"},
            "monthlyCost": {"room": room.rent, "mess": mess_monthly, "transport": transport_monthly, "essentials": essentials_monthly, "total": monthly_total},
            "safetyScore": safety_score, "freshness": "Updated today", "availability": "Available", "decisionScore": score,
        })
    combinations.sort(key=lambda item: item["decisionScore"], reverse=True)
    return {"combinations": combinations, "status": {"collegeVerification": "Live in MVP", "payments": "Demo records", "ai": "Rule-based MVP"}}


@router.get("/roommates/matches")
async def roommates(course: str | None = None, budget_max: int | None = None, preference: str | None = None, sleep: str | None = None, study: str | None = None, diet: str | None = None, hobby: str | None = None, _user: dict = Depends(require_user)):
    ai = OpenAIProvider(load_config().azure_openai_endpoint)
    matches = ROOMMATES.copy()
    if course:
        matches = [item for item in matches if course.lower() in item["course"].lower()]
    if budget_max:
        matches = [item for item in matches if budget_max >= int(item["budget"].split("-")[1])]
    if preference:
        matches = [item for item in matches if preference.lower() in " ".join(item["preferences"]).lower()]
    if sleep:
        matches = [item for item in matches if sleep.lower() in item["sleep"].lower() or item["sleep"].lower() == "flexible"]
    if study:
        matches = [item for item in matches if study.lower() in item["study"].lower() or item["study"].lower() == "quiet study"]
    if diet:
        matches = [item for item in matches if diet.lower() in item["diet"].lower()]
    if hobby:
        matches = [item for item in matches if any(hobby.lower() in value.lower() for value in item["hobbies"])]
    result = []
    requested_sleep = sleep or ""
    requested_study = study or ""
    requested_diet = diet or ""
    requested_hobby = hobby or ""
    for item in matches:
        score = item["match"]
        if requested_sleep and requested_sleep.lower() in item["sleep"].lower(): score += 2
        if requested_study and requested_study.lower() in item["study"].lower(): score += 2
        if requested_diet and requested_diet.lower() in item["diet"].lower(): score += 2
        if requested_hobby and any(requested_hobby.lower() in value.lower() for value in item["hobbies"]): score += 2
        result.append({**item, "budget": "₹" + item["budget"].replace("-", "–₹"), "match": min(score, 100), "explanation": await ai.explain_match(item["name"])})
    return {"matches": result}


@router.put("/roommate-profile")
def save_roommate_profile(body: RoommateProfileRequest, _user: dict = Depends(require_user), db: Session = Depends(get_db)):
    user_id = int(_user["sub"])
    profile = db.query(RoommateProfile).filter(RoommateProfile.user_id == user_id).first()
    if not profile:
        profile = RoommateProfile(user_id=user_id)
        db.add(profile)
    profile.course = body.course
    profile.budget = body.budget
    profile.sleep = body.sleep
    profile.study = body.study
    profile.diet = body.diet
    profile.hobbies = body.hobbies
    db.commit()
    db.refresh(profile)
    return {"profile": {"course": profile.course, "budget": profile.budget, "sleep": profile.sleep, "study": profile.study, "diet": profile.diet, "hobbies": profile.hobbies}}


@router.get("/roommate-profile")
def get_roommate_profile(_user: dict = Depends(require_user), db: Session = Depends(get_db)):
    profile = db.query(RoommateProfile).filter(RoommateProfile.user_id == int(_user["sub"])).first()
    if not profile:
        return {"profile": {"course": "", "budget": 0, "sleep": "", "study": "", "diet": "", "hobbies": ""}}
    return {"profile": {"course": profile.course, "budget": profile.budget, "sleep": profile.sleep, "study": profile.study, "diet": profile.diet, "hobbies": profile.hobbies}}


@router.get("/roommate-candidates")
def roommate_candidates(_user: dict = Depends(require_user), db: Session = Depends(get_db)):
    current_id = int(_user["sub"])
    current = db.query(RoommateProfile).filter(RoommateProfile.user_id == current_id).first()
    users = db.query(User).filter(User.id != current_id).all()
    candidates = []
    for user in users:
        profile = db.query(RoommateProfile).filter(RoommateProfile.user_id == user.id).first()
        if not profile:
            profile = RoommateProfile(user_id=user.id)
        matches = 0
        disagreements = []
        if current:
            if current.sleep and profile.sleep:
                matches += 25 if current.sleep.lower() == profile.sleep.lower() or "flexible" in (current.sleep.lower(), profile.sleep.lower()) else 0
                if current.sleep.lower() != profile.sleep.lower() and "flexible" not in (current.sleep.lower(), profile.sleep.lower()): disagreements.append("Sleep schedule")
            if current.study and profile.study:
                matches += 25 if current.study.lower() == profile.study.lower() else 0
                if current.study.lower() != profile.study.lower(): disagreements.append("Study style")
            if current.diet and profile.diet:
                matches += 25 if current.diet.lower() == profile.diet.lower() else 0
                if current.diet.lower() != profile.diet.lower(): disagreements.append("Diet")
            shared_hobbies = set(value.strip().lower() for value in current.hobbies.split(",") if value.strip()) & set(value.strip().lower() for value in profile.hobbies.split(",") if value.strip())
            matches += 25 if shared_hobbies else 0
            if not shared_hobbies and current.hobbies and profile.hobbies: disagreements.append("Hobbies")
            if current.budget and profile.budget:
                matches += 15 if abs(current.budget - profile.budget) <= 2000 else 0
        candidates.append({"id": str(user.id), "name": user.name, "email": user.email, "course": profile.course or "Not set", "budget": profile.budget, "sleep": profile.sleep or "Not set", "study": profile.study or "Not set", "diet": profile.diet or "Not set", "hobbies": [value.strip() for value in profile.hobbies.split(",") if value.strip()], "compatibility": min(matches, 100), "disagreements": disagreements})
    candidates.sort(key=lambda item: item["compatibility"], reverse=True)
    return {"candidates": candidates}


@router.post("/roommate-groups", status_code=201)
def create_roommate_group(body: RoommateGroupRequest, _user: dict = Depends(require_user), db: Session = Depends(get_db)):
    owner_id = int(_user["sub"])
    member_ids = sorted(set([owner_id, *body.memberIds]))
    group = RoommateGroup(owner_user_id=owner_id, name=body.name, area=body.area, budget=body.budget, member_ids=",".join(str(value) for value in member_ids))
    db.add(group)
    db.commit()
    db.refresh(group)
    return roommate_group_result(group, db)


@router.get("/roommate-groups")
def list_roommate_groups(_user: dict = Depends(require_user), db: Session = Depends(get_db)):
    user_id = int(_user["sub"])
    groups = db.query(RoommateGroup).all()
    visible = [group for group in groups if str(user_id) in group.member_ids.split(",")]
    return {"groups": [roommate_group_result(group, db) for group in visible]}


def roommate_group_result(group: RoommateGroup, db: Session) -> dict:
    ids = [int(value) for value in group.member_ids.split(",") if value]
    members = db.query(User).filter(User.id.in_(ids)).all()
    members_by_id = {user.id: user for user in members}
    result_members = [{"id": str(user_id), "name": members_by_id[user_id].name if user_id in members_by_id else "Unknown student"} for user_id in ids]
    return {"id": str(group.id), "name": group.name, "area": group.area, "budget": group.budget, "members": result_members}


@router.get("/mess/menu")
def mess_menu(db: Session = Depends(get_db)):
    menu = [
        {"meal": "Breakfast", "menu": "Masala dosa, idli, fruit", "time": "7:30–9:30 AM", "state": "Available", "price": 90, "rating": 4.6, "image": "https://images.unsplash.com/photo-1630383249896-424e482df921?w=900"},
        {"meal": "Lunch", "menu": "Rajma, jeera rice, roti, salad", "time": "12:30–2:30 PM", "state": "Serving", "price": 120, "rating": 4.8, "image": "https://images.unsplash.com/photo-1547592180-85f173990554?w=900"},
        {"meal": "Dinner", "menu": "Paneer masala, dal, rice, roti", "time": "7:30–9:30 PM", "state": "Upcoming", "price": 140, "rating": 4.7, "image": "https://images.unsplash.com/photo-1547592180-85f173990554?w=900"}
    ]
    owner_plans = db.query(MessPlan).order_by(MessPlan.id.desc()).all()
    menu.extend({"meal": plan.meal, "menu": plan.menu, "time": plan.time, "state": "Available", "price": plan.price, "rating": 0, "image": plan.image_url} for plan in owner_plans)
    return {"menu": menu, "subscriptions": [{"mess": "North Campus Mess", "plan": "November", "state": "Approved"}]}


@router.post("/mess/plans", status_code=201)
def create_mess_plan(body: MessPlanCreateRequest, _user: dict = Depends(require_user), db: Session = Depends(get_db)):
    if _user["role"] not in {"mess_owner", "admin"}:
        raise HTTPException(status_code=403, detail="Only mess owners can publish meal plans")
    plan = MessPlan(owner_id=int(_user["sub"]), name=body.name, meal=body.meal, menu=body.menu, time=body.time, price=body.price, image_url=body.imageUrl)
    db.add(plan)
    db.commit()
    db.refresh(plan)
    return {"plan": {"id": str(plan.id), "name": plan.name, "meal": plan.meal, "menu": plan.menu, "time": plan.time, "price": plan.price, "image": plan.image_url}}


@router.post("/marketplace/listings", status_code=201)
def create_marketplace_listing(body: MarketplaceListingCreateRequest, _user: dict = Depends(require_user), db: Session = Depends(get_db)):
    if _user["role"] not in {"seller", "admin"}:
        raise HTTPException(status_code=403, detail="Only sellers can publish marketplace listings")
    listing = OwnerListing(owner_id=int(_user["sub"]), owner_role="seller", title=body.title, category=body.category, price=body.price, details=body.condition, contact_name=body.contactName, contact_phone=body.contactPhone, image_url=body.imageUrl)
    db.add(listing)
    db.commit()
    db.refresh(listing)
    return {"listing": {"id": str(listing.id), "title": listing.title, "seller": listing.contact_name, "contactName": listing.contact_name, "contactPhone": listing.contact_phone, "price": listing.price, "condition": listing.details, "rating": 0, "listingType": "seller", "category": listing.category, "image": listing.image_url}}


@router.get("/marketplace/listings")
def marketplace_listings(db: Session = Depends(get_db)):
    listings = [
        {"id": "l1", "title": "Dell Inspiron 15", "seller": "Riya M.", "contactName": "Riya M.", "contactPhone": "", "price": 38500, "condition": "Excellent", "rating": 4.8, "listingType": "used_senior", "category": "electronics", "image": "https://images.unsplash.com/photo-1496181133206-80ce9b88a853?w=900"},
        {"id": "l2", "title": "Engineering drawing set", "seller": "Arjun P.", "contactName": "Arjun P.", "contactPhone": "", "price": 1200, "condition": "Like new", "rating": 4.7, "listingType": "used_senior", "category": "books", "image": "https://images.unsplash.com/photo-1456324504439-367cee3b3c32?w=900"},
        {"id": "l3", "title": "Single bed with mattress", "seller": "Sana K.", "contactName": "Sana K.", "contactPhone": "", "price": 6800, "condition": "Good", "rating": 4.6, "listingType": "used_senior", "category": "essentials", "image": "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?w=900"},
        {"id": "l4", "title": "Engineering Mathematics - Latest Edition", "seller": "Campus Book Store", "contactName": "Campus Book Store", "contactPhone": "", "price": 950, "condition": "Brand new", "rating": 4.9, "listingType": "new_seller", "category": "books", "image": "https://images.unsplash.com/photo-1495446815901-a7297e633e8d?w=900"},
        {"id": "l5", "title": "Study Desk Lamp", "seller": "Campus Essentials Co.", "contactName": "Campus Essentials Co.", "contactPhone": "", "price": 699, "condition": "Brand new", "rating": 4.8, "listingType": "new_seller", "category": "essentials", "image": "https://images.unsplash.com/photo-1507473885765-e6ed057f782c?w=900"}
    ]
    owner_rows = db.query(OwnerListing).order_by(OwnerListing.id.desc()).all()
    listings.extend({"id": str(row.id), "title": row.title, "seller": row.contact_name, "contactName": row.contact_name, "contactPhone": row.contact_phone, "price": row.price, "condition": row.details, "rating": 0, "listingType": "seller", "category": row.category, "image": row.image_url} for row in owner_rows)
    return {"listings": listings, "pagination": {"page": 1, "pageSize": 20, "total": len(listings)}}


@router.post("/booking-requests", status_code=201)
def create_booking_request(body: BookingRequestCreate, _user: dict = Depends(require_user), db: Session = Depends(get_db)):
    if _user["role"] != "student":
        raise HTTPException(status_code=403, detail="Only students can submit purchase or booking requests")
    owner_id = 0
    if body.targetType == "room":
        row = db.get(Hostel, int(body.targetId)) if body.targetId.isdigit() else None
        owner_id = row.owner_id if row and row.owner_id else int(_user["sub"])
    elif body.targetType == "listing":
        row = db.get(OwnerListing, int(body.targetId)) if body.targetId.isdigit() else None
        owner_id = row.owner_id if row else int(_user["sub"])
    elif body.targetType == "mess":
        row = db.get(MessPlan, int(body.targetId)) if body.targetId.isdigit() else None
        owner_id = row.owner_id if row else int(_user["sub"])
    request = BookingRequest(student_id=int(_user["sub"]), owner_id=owner_id, target_type=body.targetType, target_id=body.targetId, target_name=body.targetName, move_in=body.moveIn, duration=body.duration, message=body.message, status="pending")
    db.add(request)
    db.commit()
    db.refresh(request)
    return {"request": {"id": str(request.id), "targetName": request.target_name, "status": request.status}}


@router.get("/owner/dashboard")
def owner_dashboard(_user: dict = Depends(require_user), db: Session = Depends(get_db)):
    role = _user["role"]
    owner_id = int(_user["sub"])
    if role not in {"hostel_owner", "mess_owner", "seller", "admin"}:
        raise HTTPException(status_code=403, detail="Owner dashboard access is required")
    requests = db.query(BookingRequest).filter(BookingRequest.owner_id == owner_id).order_by(BookingRequest.id.desc()).all()
    room_listings = db.query(Hostel).filter(Hostel.owner_id == owner_id).all() if role in {"hostel_owner", "admin"} else []
    mess_listings = db.query(MessPlan).filter(MessPlan.owner_id == owner_id).all() if role in {"mess_owner", "admin"} else []
    market_listings = db.query(OwnerListing).filter(OwnerListing.owner_id == owner_id).all() if role in {"seller", "admin"} else []

    payments = []
    for request in requests:
        amount = 0
        if request.target_type == "room":
            listing = db.get(Hostel, int(request.target_id)) if request.target_id.isdigit() else None
            amount = listing.rent if listing else 0
        elif request.target_type == "mess":
            listing = db.get(MessPlan, int(request.target_id)) if request.target_id.isdigit() else None
            amount = listing.price if listing else 2800
        elif request.target_type == "listing":
            listing = db.get(OwnerListing, int(request.target_id)) if request.target_id.isdigit() else None
            amount = listing.price if listing else 0
        if amount:
            payments.append({"purpose": request.target_name, "amount": amount, "status": "completed" if request.status == "approved" else "pending"})

    return {"role": role, "requests": [{"id": str(row.id), "studentId": str(row.student_id), "targetType": row.target_type, "targetName": row.target_name, "moveIn": row.move_in, "duration": row.duration, "message": row.message, "status": row.status.title()} for row in requests], "payments": payments, "roomListings": [{"id": str(row.id), "title": row.name, "area": row.area, "price": row.rent} for row in room_listings], "messListings": [{"id": str(row.id), "title": row.name, "meal": row.meal, "price": row.price} for row in mess_listings], "marketListings": [{"id": str(row.id), "title": row.title, "price": row.price} for row in market_listings]}


@router.patch("/owner/requests/{request_id}")
def update_owner_request(request_id: int, body: BookingStatusUpdate, _user: dict = Depends(require_user), db: Session = Depends(get_db)):
    if _user["role"] not in {"hostel_owner", "mess_owner", "seller", "admin"}:
        raise HTTPException(status_code=403, detail="Owner access is required")
    request = db.get(BookingRequest, request_id)
    if not request or (request.owner_id != int(_user["sub"]) and _user["role"] != "admin"):
        raise HTTPException(status_code=404, detail="Request not found")
    request.status = body.status
    db.add(request)
    db.commit()
    return {"request": {"id": str(request.id), "status": request.status.title()}}


@router.post("/uploads/presign")
async def presign(body: UploadRequest, _user: dict = Depends(require_user)):
    if _user["role"] not in {"hostel_owner", "mess_owner", "seller", "admin"}:
        raise HTTPException(status_code=403, detail="Only service owners can request listing uploads")
    if _user["role"] not in {"hostel_owner", "mess_owner", "seller", "admin"}:
        raise HTTPException(status_code=403, detail="Only service owners can request listing uploads")
    config = load_config()
    return await BlobStorageProvider(config.storage_connection_string).create_presigned_upload(body.type, body.filename, body.contentType)


@router.get("/conversations")
def conversations(_user: dict = Depends(require_user)):
    return {"conversations": [
        {"id": "c1", "contact": "Scholar House", "subject": "Room inspection", "lastMessage": "The 4 PM slot is confirmed.", "state": "Unread"},
        {"id": "c2", "contact": "North Campus Mess", "subject": "November plan", "lastMessage": "Your renewal is approved.", "state": "Read"},
        {"id": "c3", "contact": "Student Support", "subject": "Document review", "lastMessage": "Please upload the revised ID proof.", "state": "Open"}
    ]}


@router.get("/payments")
def payment_history(_user: dict = Depends(require_user), db: Session = Depends(get_db)):
    rows = db.query(Payment).filter(Payment.user_id == int(_user["sub"])).order_by(Payment.id.desc()).all()
    return {"payments": [{"id": str(row.id), "purpose": row.purpose, "amount": row.amount, "method": row.method, "status": row.status} for row in rows]}


@router.post("/feedback", status_code=201)
def submit_feedback(body: FeedbackRequest, _user: dict = Depends(require_user), db: Session = Depends(get_db)):
    if _user["role"] != "student":
        raise HTTPException(status_code=403, detail="Only students can submit reviews")
    item = Feedback(user_id=int(_user["sub"]), category=body.category, rating=body.rating, comment=body.comment)
    db.add(item)
    db.commit()
    db.refresh(item)
    return {"feedback": {"id": str(item.id), "rating": item.rating, "category": item.category}}


@router.get("/feedback")
def feedback_history(category: str | None = None, db: Session = Depends(get_db)):
    query = db.query(Feedback)
    if category:
        query = query.filter(Feedback.category == category)
    rows = query.order_by(Feedback.id.desc()).all()
    return {"feedback": [{"id": str(row.id), "rating": row.rating, "category": row.category, "comment": row.comment} for row in rows]}


@router.get("/expenses")
def expense_history(_user: dict = Depends(require_user), db: Session = Depends(get_db)):
    rows = db.query(Expense).filter(Expense.user_id == int(_user["sub"])).order_by(Expense.id.desc()).all()
    return {"expenses": [{"id": str(row.id), "title": row.title, "amount": row.amount, "category": row.category} for row in rows]}


@router.post("/expenses", status_code=201)
def add_expense(body: ExpenseRequest, _user: dict = Depends(require_user), db: Session = Depends(get_db)):
    item = Expense(user_id=int(_user["sub"]), title=body.title, amount=body.amount, category=body.category)
    db.add(item)
    db.commit()
    db.refresh(item)
    return {"expense": {"id": str(item.id), "title": item.title, "amount": item.amount, "category": item.category}}


@router.get("/support")
def support_history(_user: dict = Depends(require_user), db: Session = Depends(get_db)):
    rows = db.query(SupportRequest).filter(SupportRequest.user_id == int(_user["sub"])).order_by(SupportRequest.id.desc()).all()
    return {"requests": [{"id": str(row.id), "subject": row.subject, "description": row.description, "status": row.status} for row in rows]}


@router.post("/support", status_code=201)
def add_support_request(body: SupportRequestCreate, _user: dict = Depends(require_user), db: Session = Depends(get_db)):
    item = SupportRequest(user_id=int(_user["sub"]), subject=body.subject, description=body.description, status="open")
    db.add(item)
    db.commit()
    db.refresh(item)
    return {"request": {"id": str(item.id), "subject": item.subject, "status": item.status}}


@router.post("/payments/checkout", status_code=201)
def checkout(body: PaymentRequest, _user: dict = Depends(require_user), db: Session = Depends(get_db)):
    if _user["role"] != "student":
        raise HTTPException(status_code=403, detail="Only students can make purchases")
    status = "pending" if body.method == "upi" else "completed"
    payment = Payment(user_id=int(_user["sub"]), purpose=body.purpose, amount=body.amount, method=body.method, status=status)
    db.add(payment)
    db.commit()
    db.refresh(payment)
    response = {"id": str(payment.id), "purpose": payment.purpose, "amount": payment.amount, "method": payment.method, "status": payment.status}
    if body.method == "upi":
        config = load_config()
        merchant_vpa = body.recipientVpa or config.upi_merchant_vpa
        if not merchant_vpa:
            response["upiError"] = "UPI merchant VPA is not configured"
        else:
            import urllib.parse
            merchant_name = body.recipientName or config.upi_merchant_name
            params = urllib.parse.urlencode({"pa": merchant_vpa, "pn": merchant_name, "am": f"{body.amount:.2f}", "cu": "INR", "tn": f"{body.purpose}-{payment.id}"})
            response["upiIntent"] = f"upi://pay?{params}"
            response["upiQrData"] = response["upiIntent"]
    return {"payment": response}


@router.post("/ai/chat")
async def ai_chat(body: AIChatRequest, _user: dict = Depends(require_user), db: Session = Depends(get_db)):
    message = body.message.lower()
    if any(word in message for word in ("room", "hostel", "lowest", "cheapest", "budget")):
        rooms = db.query(Hostel).filter(Hostel.verified == True).order_by(Hostel.rent.asc(), Hostel.rating.desc()).all()
        if rooms:
            lowest = rooms[0]
            amenities = lowest.amenities or "basic amenities"
            reply = f"Lowest-price match: {lowest.name} in {lowest.area} is ₹{int(lowest.rent):,}/month with {amenities.replace('|', ', ')}. I included its rating of {lowest.rating:.1f}/5; open Room Search to compare it with safer or higher-value options."
        else:
            reply = "No rooms are available yet. Add a room or ask me to search again after listings are published."
    elif any(word in message for word in ("roommate", "match")):
        reply = "Search roommates by course, maximum budget, and preference. Your strongest compatibility signals are schedule, cleanliness, and lifestyle."
    elif any(word in message for word in ("mess", "meal", "dinner")):
        reply = "Tonight's dinner is in the mess menu. Choose Renew plan to subscribe for the month."
    elif any(word in message for word in ("payment", "pay", "checkout")):
        reply = "Payments are recorded securely in demo mode. Choose UPI, card, or cash and confirm the checkout."
    else:
        reply = "I can help with rooms, roommates, mess plans, essentials, and payments. Tell me what you are looking for."
    return {"reply": reply}


@router.post("/reports", status_code=201)
def reports(body: ReportRequest, _user: dict = Depends(require_user)):
    return {"report": {"id": "rpt-1", "targetType": body.targetType, "targetId": body.targetId, "reason": body.reason, "state": "Open"}}
