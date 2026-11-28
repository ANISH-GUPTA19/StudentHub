from sqlalchemy.orm import Session

from app.core.auth import hash_password
from app.models.entities import Hostel, Notification, Product, ProductCategory, ProductImage, Room, RoomImage, User


DEFAULT_CATEGORIES = [
    ("books", "Books & Notes"),
    ("electronics", "Electronics"),
    ("furniture", "Furniture"),
    ("cycles", "Cycles"),
    ("essentials", "Student Essentials"),
]


def create_notification(db: Session, user_id: int, title: str, message: str, category: str = "system", link: str = "") -> None:
    db.add(Notification(user_id=user_id, title=title[:160], message=message[:500], category=category, link=link))


def ensure_seed_data(db: Session) -> None:
    # 1. Seed hostels if empty
    if db.query(Hostel).count() == 0:
        db.add_all(
            [
                Hostel(
                    name="The Scholar House",
                    area="North Campus",
                    rent=8500,
                    rating=4.8,
                    verified=True,
                    amenities="Wi-Fi|Meals|Study room|Security",
                    image_url="https://images.unsplash.com/photo-1566073771259-6a8506099945?w=900",
                    address="14 Academic Lane, North Campus",
                    location="North Campus",
                    contact_name="Scholar House Warden",
                    contact_phone="+91 98765 41001",
                    security_deposit=8500,
                    other_charges=500,
                    room_type="Double",
                    gender_preference="Any",
                    rules="Quiet hours after 10:30 PM|Visitor sign-in at reception|No smoking inside rooms",
                    capacity=2,
                    occupied=0,
                    total_rooms=6,
                    available_rooms=4,
                    is_available=True,
                    description="Well-lit student residency within walking distance of lecture halls with high-speed Wi-Fi and study lounge.",
                ),
                Hostel(
                    name="Lakeview Residency",
                    area="University Lake",
                    rent=7200,
                    rating=4.6,
                    verified=True,
                    amenities="Wi-Fi|Laundry|Parking|Security",
                    image_url="https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=900",
                    address="22 Lakefront Road, University Lake",
                    location="University Lake",
                    contact_name="Lakeview Caretaker",
                    contact_phone="+91 98765 41002",
                    security_deposit=7000,
                    other_charges=300,
                    room_type="Shared",
                    gender_preference="Boys",
                    rules="Main gate closes at 11:00 PM|Laundry slot booking via desk|Keep corridors clean",
                    capacity=2,
                    occupied=0,
                    total_rooms=5,
                    available_rooms=3,
                    is_available=True,
                    description="Peaceful lake-facing PG accommodation with covered cycle parking, laundry facilities, and 24/7 CCTV.",
                ),
                Hostel(
                    name="Apex Student Homes",
                    area="Metro Gate",
                    rent=9100,
                    rating=4.7,
                    verified=True,
                    amenities="Meals|Gym|Study room|Wi-Fi|Security",
                    image_url="https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?w=900",
                    address="8 Station Enclave, Metro Gate",
                    location="Metro Gate",
                    contact_name="Apex Desk",
                    contact_phone="+91 98765 41003",
                    security_deposit=9000,
                    other_charges=600,
                    room_type="Single",
                    gender_preference="Girls",
                    rules="Biometric entry required|Mess timings must be followed|Guests allowed in common lounge only",
                    capacity=1,
                    occupied=0,
                    total_rooms=8,
                    available_rooms=5,
                    is_available=True,
                    description="Modern single-occupancy rooms right beside Metro Gate with gym access, meals, and quiet study zones.",
                ),
            ]
        )
        db.commit()

    # Backfill metadata & rooms for any existing hostels
    hostels = db.query(Hostel).all()
    for hostel in hostels:
        if not hostel.location:
            hostel.location = hostel.area
        if not hostel.address:
            hostel.address = f"{hostel.name}, {hostel.area}"
        if not hostel.contact_name:
            hostel.contact_name = f"{hostel.name} Desk"
        if not hostel.contact_phone:
            hostel.contact_phone = "+91 98765 40000"
        if hostel.security_deposit == 0:
            hostel.security_deposit = hostel.rent
        if not hostel.rules:
            hostel.rules = "Valid student ID required|Quiet hours 10:30 PM - 6:00 AM|No smoking"
        if not hostel.description:
            hostel.description = f"Verified student accommodation in {hostel.area} with essential facilities."
        if db.query(Room).filter(Room.hostel_id == hostel.id).count() == 0:
            db.add_all(
                [
                    Room(
                        hostel_id=hostel.id,
                        room_number="101",
                        room_type=hostel.room_type or "Double",
                        capacity=max(1, hostel.capacity or 2),
                        occupied=0,
                        monthly_rent=hostel.rent,
                        security_deposit=hostel.security_deposit,
                        is_available=True,
                    ),
                    Room(
                        hostel_id=hostel.id,
                        room_number="102",
                        room_type="Single",
                        capacity=1,
                        occupied=0,
                        monthly_rent=hostel.rent + 1200,
                        security_deposit=hostel.security_deposit,
                        is_available=True,
                    ),
                ]
            )
        if hostel.image_url and db.query(RoomImage).filter(RoomImage.hostel_id == hostel.id).count() == 0:
            db.add(RoomImage(hostel_id=hostel.id, image_url=hostel.image_url, caption="Main view", sort_order=0))
    db.commit()

    # 2. Seed product categories
    categories_by_slug: dict[str, ProductCategory] = {}
    for slug, name in DEFAULT_CATEGORIES:
        cat = db.query(ProductCategory).filter(ProductCategory.slug == slug).first()
        if not cat:
            cat = ProductCategory(slug=slug, name=name)
            db.add(cat)
            db.commit()
            db.refresh(cat)
        categories_by_slug[slug] = cat

    # 3. Seed default seller & products if products table is empty
    if db.query(Product).count() == 0:
        seller = db.query(User).filter(User.role == "seller").first()
        if not seller:
            seller = User(
                name="Campus Essentials Store",
                email="seller@studenthub.local",
                password_hash=hash_password("SellerPass123!"),
                role="seller",
                phone="+91 98765 42000",
            )
            db.add(seller)
            db.commit()
            db.refresh(seller)

        seed_products = [
            {
                "title": "Dell Inspiron 15",
                "description": "15.6-inch student laptop (16GB RAM, 512GB SSD), lightly used for coursework and coding projects.",
                "price": 38500,
                "stock": 2,
                "condition": "Excellent",
                "category": "electronics",
                "listing_type": "used_senior",
                "location": "North Campus",
                "contact_name": "Riya M.",
                "contact_phone": "+91 98765 42001",
                "image_url": "https://images.unsplash.com/photo-1496181133206-80ce9b88a853?w=900",
                "rating": 4.8,
            },
            {
                "title": "Engineering drawing set",
                "description": "Complete drafter, compass box, scale set, and drawing sheet tube for first-year engineering.",
                "price": 1200,
                "stock": 5,
                "condition": "Like new",
                "category": "books",
                "listing_type": "used_senior",
                "location": "AITD Kanpur",
                "contact_name": "Arjun P.",
                "contact_phone": "+91 98765 42002",
                "image_url": "https://images.unsplash.com/photo-1456324504439-367cee3b3c32?w=900",
                "rating": 4.7,
            },
            {
                "title": "Single bed with mattress",
                "description": "Sturdy wooden single cot with 4-inch orthopedic foam mattress, ideal for hostel or PG rooms.",
                "price": 6800,
                "stock": 3,
                "condition": "Good",
                "category": "furniture",
                "listing_type": "used_senior",
                "location": "University Lake",
                "contact_name": "Sana K.",
                "contact_phone": "+91 98765 42003",
                "image_url": "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?w=900",
                "rating": 4.6,
            },
            {
                "title": "Engineering Mathematics - Latest Edition",
                "description": "Brand new semester reference textbook covering linear algebra, calculus, and differential equations.",
                "price": 950,
                "stock": 14,
                "condition": "Brand new",
                "category": "books",
                "listing_type": "new_seller",
                "location": "Campus Book Store",
                "contact_name": "Campus Book Store",
                "contact_phone": "+91 98765 42004",
                "image_url": "https://images.unsplash.com/photo-1495446815901-a7297e633e8d?w=900",
                "rating": 4.9,
            },
            {
                "title": "Study Desk Lamp",
                "description": "Adjustable LED study lamp with 3 brightness modes and USB charging support for late-night study.",
                "price": 699,
                "stock": 20,
                "condition": "Brand new",
                "category": "essentials",
                "listing_type": "new_seller",
                "location": "Campus Store",
                "contact_name": "Campus Essentials Co.",
                "contact_phone": "+91 98765 42005",
                "image_url": "https://images.unsplash.com/photo-1507473885765-e6ed057f782c?w=900",
                "rating": 4.8,
            },
        ]
        for item in seed_products:
            cat = categories_by_slug.get(item["category"])
            prod = Product(
                seller_id=seller.id,
                category_id=cat.id if cat else None,
                category=item["category"],
                title=item["title"],
                description=item["description"],
                price=item["price"],
                stock=item["stock"],
                condition=item["condition"],
                listing_type=item["listing_type"],
                location=item["location"],
                contact_name=item["contact_name"],
                contact_phone=item["contact_phone"],
                image_url=item["image_url"],
                is_active=True,
                rating=item["rating"],
            )
            db.add(prod)
            db.commit()
            db.refresh(prod)
            if prod.image_url:
                db.add(ProductImage(product_id=prod.id, image_url=prod.image_url, sort_order=0))
                db.commit()
