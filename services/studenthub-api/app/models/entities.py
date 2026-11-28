from datetime import datetime, timezone

from sqlalchemy import Boolean, CheckConstraint, DateTime, Float, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class RoommateProfile(Base):
    __tablename__ = "roommate_profiles"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(Integer, unique=True, index=True)
    course: Mapped[str] = mapped_column(String(160), default="")
    budget: Mapped[int] = mapped_column(Integer, default=0)
    sleep: Mapped[str] = mapped_column(String(64), default="")
    study: Mapped[str] = mapped_column(String(64), default="")
    diet: Mapped[str] = mapped_column(String(64), default="")
    hobbies: Mapped[str] = mapped_column(String(500), default="")


class RoommateGroup(Base):
    __tablename__ = "roommate_groups"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    owner_user_id: Mapped[int] = mapped_column(Integer)
    name: Mapped[str] = mapped_column(String(160))
    area: Mapped[str] = mapped_column(String(160), default="")
    budget: Mapped[int] = mapped_column(Integer, default=0)
    member_ids: Mapped[str] = mapped_column(String(500), default="")


class Feedback(Base):
    __tablename__ = "feedback"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(Integer)
    category: Mapped[str] = mapped_column(String(32))
    rating: Mapped[int] = mapped_column(Integer)
    comment: Mapped[str] = mapped_column(String(500))


class Expense(Base):
    __tablename__ = "expenses"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(Integer)
    title: Mapped[str] = mapped_column(String(120))
    amount: Mapped[float] = mapped_column(Float)
    category: Mapped[str] = mapped_column(String(32))


class SupportRequest(Base):
    __tablename__ = "support_requests"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(Integer)
    subject: Mapped[str] = mapped_column(String(160))
    description: Mapped[str] = mapped_column(String(1000))
    status: Mapped[str] = mapped_column(String(32), default="open")


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(32), default="student")
    phone: Mapped[str] = mapped_column(String(32), default="")
    course: Mapped[str] = mapped_column(String(160), default="")
    created_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, default=utcnow)


class Payment(Base):
    __tablename__ = "payments"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(Integer, index=True)
    purpose: Mapped[str] = mapped_column(String(120))
    amount: Mapped[float] = mapped_column(Float)
    method: Mapped[str] = mapped_column(String(32))
    status: Mapped[str] = mapped_column(String(32), default="pending")
    payment_type: Mapped[str] = mapped_column(String(32), default="general")
    reference_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    gateway: Mapped[str] = mapped_column(String(32), default="razorpay")
    gateway_order_id: Mapped[str | None] = mapped_column(String(120), nullable=True, unique=True, index=True)
    gateway_payment_id: Mapped[str | None] = mapped_column(String(120), nullable=True, index=True)
    gateway_signature: Mapped[str | None] = mapped_column(String(255), nullable=True)
    currency: Mapped[str] = mapped_column(String(8), default="INR")
    failure_reason: Mapped[str | None] = mapped_column(String(500), nullable=True)
    idempotency_key: Mapped[str | None] = mapped_column(String(120), nullable=True, unique=True)
    created_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, default=utcnow)
    updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, default=utcnow, onupdate=utcnow)


class OwnerListing(Base):
    __tablename__ = "owner_listings"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    owner_id: Mapped[int] = mapped_column(Integer)
    owner_role: Mapped[str] = mapped_column(String(32))
    title: Mapped[str] = mapped_column(String(160))
    category: Mapped[str] = mapped_column(String(64))
    price: Mapped[float] = mapped_column(Float)
    details: Mapped[str] = mapped_column(String(1000), default="")
    contact_name: Mapped[str] = mapped_column(String(120), default="")
    contact_phone: Mapped[str] = mapped_column(String(32), default="")
    image_url: Mapped[str | None] = mapped_column(String(500), nullable=True)


class MessPlan(Base):
    __tablename__ = "mess_plans"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    owner_id: Mapped[int] = mapped_column(Integer)
    name: Mapped[str] = mapped_column(String(160))
    meal: Mapped[str] = mapped_column(String(64))
    menu: Mapped[str] = mapped_column(String(500))
    time: Mapped[str] = mapped_column(String(64))
    price: Mapped[float] = mapped_column(Float)
    image_url: Mapped[str | None] = mapped_column(String(500), nullable=True)


class BookingRequest(Base):
    __tablename__ = "booking_requests"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    student_id: Mapped[int] = mapped_column(Integer)
    owner_id: Mapped[int] = mapped_column(Integer)
    target_type: Mapped[str] = mapped_column(String(32))
    target_id: Mapped[str] = mapped_column(String(120))
    target_name: Mapped[str] = mapped_column(String(160))
    move_in: Mapped[str] = mapped_column(String(32), default="")
    duration: Mapped[str] = mapped_column(String(64), default="")
    message: Mapped[str] = mapped_column(String(1000), default="")
    status: Mapped[str] = mapped_column(String(32), default="pending")


class ProductCategory(Base):
    __tablename__ = "product_categories"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    slug: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(120))


class Product(Base):
    __tablename__ = "products"
    __table_args__ = (
        CheckConstraint("price >= 0", name="ck_products_price"),
        CheckConstraint("stock >= 0", name="ck_products_stock"),
    )
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    seller_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), index=True)
    category_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("product_categories.id"), nullable=True)
    category: Mapped[str] = mapped_column(String(64), index=True, default="essentials")
    title: Mapped[str] = mapped_column(String(160), index=True)
    description: Mapped[str] = mapped_column(String(2000), default="")
    price: Mapped[float] = mapped_column(Float)
    stock: Mapped[int] = mapped_column(Integer, default=1)
    condition: Mapped[str] = mapped_column(String(64), default="New")
    listing_type: Mapped[str] = mapped_column(String(32), default="new_seller")
    location: Mapped[str] = mapped_column(String(160), default="Campus Store", index=True)
    contact_name: Mapped[str] = mapped_column(String(120), default="")
    contact_phone: Mapped[str] = mapped_column(String(32), default="")
    image_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    rating: Mapped[float] = mapped_column(Float, default=4.5)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    seller: Mapped[User] = relationship("User")
    images: Mapped[list["ProductImage"]] = relationship("ProductImage", back_populates="product", cascade="all, delete-orphan")


class ProductImage(Base):
    __tablename__ = "product_images"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    product_id: Mapped[int] = mapped_column(Integer, ForeignKey("products.id", ondelete="CASCADE"), index=True)
    image_url: Mapped[str] = mapped_column(String(500))
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    product: Mapped[Product] = relationship("Product", back_populates="images")


class Cart(Base):
    __tablename__ = "carts"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), unique=True, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    items: Mapped[list["CartItem"]] = relationship("CartItem", back_populates="cart", cascade="all, delete-orphan")


class CartItem(Base):
    __tablename__ = "cart_items"
    __table_args__ = (
        UniqueConstraint("cart_id", "product_id", name="uq_cart_product"),
        CheckConstraint("quantity > 0", name="ck_cart_items_quantity"),
    )
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    cart_id: Mapped[int] = mapped_column(Integer, ForeignKey("carts.id", ondelete="CASCADE"), index=True)
    product_id: Mapped[int] = mapped_column(Integer, ForeignKey("products.id", ondelete="CASCADE"), index=True)
    quantity: Mapped[int] = mapped_column(Integer, default=1)

    cart: Mapped[Cart] = relationship("Cart", back_populates="items")
    product: Mapped[Product] = relationship("Product")


class ProductOrder(Base):
    __tablename__ = "product_orders"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    order_number: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    student_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), index=True)
    status: Mapped[str] = mapped_column(String(32), default="pending_payment", index=True)
    payment_status: Mapped[str] = mapped_column(String(32), default="pending", index=True)
    subtotal: Mapped[float] = mapped_column(Float)
    delivery_fee: Mapped[float] = mapped_column(Float, default=0.0)
    total_amount: Mapped[float] = mapped_column(Float)
    delivery_name: Mapped[str] = mapped_column(String(120))
    delivery_phone: Mapped[str] = mapped_column(String(32))
    delivery_address: Mapped[str] = mapped_column(String(500))
    notes: Mapped[str] = mapped_column(String(500), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    student: Mapped[User] = relationship("User")
    items: Mapped[list["OrderItem"]] = relationship("OrderItem", back_populates="order", cascade="all, delete-orphan")


class OrderItem(Base):
    __tablename__ = "order_items"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    order_id: Mapped[int] = mapped_column(Integer, ForeignKey("product_orders.id", ondelete="CASCADE"), index=True)
    product_id: Mapped[int] = mapped_column(Integer, ForeignKey("products.id"), index=True)
    seller_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), index=True)
    product_title: Mapped[str] = mapped_column(String(160))
    unit_price: Mapped[float] = mapped_column(Float)
    quantity: Mapped[int] = mapped_column(Integer)
    line_total: Mapped[float] = mapped_column(Float)
    seller_status: Mapped[str] = mapped_column(String(32), default="pending")

    order: Mapped[ProductOrder] = relationship("ProductOrder", back_populates="items")
    product: Mapped[Product] = relationship("Product")


class Hostel(Base):
    __tablename__ = "hostels"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    owner_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    name: Mapped[str] = mapped_column(String(160))
    area: Mapped[str] = mapped_column(String(160), index=True)
    rent: Mapped[float] = mapped_column(Float)
    rating: Mapped[float] = mapped_column(Float, default=4.5)
    verified: Mapped[bool] = mapped_column(Boolean, default=True)
    amenities: Mapped[str] = mapped_column(String(500), default="")
    image_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    address: Mapped[str] = mapped_column(String(300), default="")
    location: Mapped[str] = mapped_column(String(160), default="")
    contact_name: Mapped[str] = mapped_column(String(120), default="")
    contact_phone: Mapped[str] = mapped_column(String(32), default="")
    security_deposit: Mapped[float] = mapped_column(Float, default=0.0)
    other_charges: Mapped[float] = mapped_column(Float, default=0.0)
    room_type: Mapped[str] = mapped_column(String(64), default="Shared")
    gender_preference: Mapped[str] = mapped_column(String(32), default="Any")
    rules: Mapped[str] = mapped_column(String(1000), default="")
    capacity: Mapped[int] = mapped_column(Integer, default=2)
    occupied: Mapped[int] = mapped_column(Integer, default=0)
    total_rooms: Mapped[int] = mapped_column(Integer, default=4)
    available_rooms: Mapped[int] = mapped_column(Integer, default=2)
    is_available: Mapped[bool] = mapped_column(Boolean, default=True)
    description: Mapped[str] = mapped_column(String(2000), default="")

    rooms: Mapped[list["Room"]] = relationship("Room", back_populates="hostel", cascade="all, delete-orphan")
    images: Mapped[list["RoomImage"]] = relationship("RoomImage", back_populates="hostel", cascade="all, delete-orphan")


class Room(Base):
    __tablename__ = "rooms"
    __table_args__ = (
        CheckConstraint("capacity > 0", name="ck_rooms_capacity"),
        CheckConstraint("occupied >= 0", name="ck_rooms_occupied"),
        CheckConstraint("monthly_rent >= 0", name="ck_rooms_rent"),
    )
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    hostel_id: Mapped[int] = mapped_column(Integer, ForeignKey("hostels.id", ondelete="CASCADE"), index=True)
    room_number: Mapped[str] = mapped_column(String(64))
    room_type: Mapped[str] = mapped_column(String(64), default="Shared")
    capacity: Mapped[int] = mapped_column(Integer, default=2)
    occupied: Mapped[int] = mapped_column(Integer, default=0)
    monthly_rent: Mapped[float] = mapped_column(Float)
    security_deposit: Mapped[float] = mapped_column(Float, default=0.0)
    is_available: Mapped[bool] = mapped_column(Boolean, default=True)

    hostel: Mapped[Hostel] = relationship("Hostel", back_populates="rooms")


class RoomImage(Base):
    __tablename__ = "room_images"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    hostel_id: Mapped[int] = mapped_column(Integer, ForeignKey("hostels.id", ondelete="CASCADE"), index=True)
    image_url: Mapped[str] = mapped_column(String(500))
    caption: Mapped[str] = mapped_column(String(160), default="")
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    hostel: Mapped[Hostel] = relationship("Hostel", back_populates="images")


class RoomBooking(Base):
    __tablename__ = "room_bookings"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    booking_code: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    student_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), index=True)
    hostel_id: Mapped[int] = mapped_column(Integer, ForeignKey("hostels.id"), index=True)
    room_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("rooms.id"), nullable=True, index=True)
    owner_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    check_in_date: Mapped[str] = mapped_column(String(32))
    duration_months: Mapped[int] = mapped_column(Integer, default=1)
    check_out_date: Mapped[str] = mapped_column(String(32))
    monthly_rent: Mapped[float] = mapped_column(Float)
    security_deposit: Mapped[float] = mapped_column(Float, default=0.0)
    other_charges: Mapped[float] = mapped_column(Float, default=0.0)
    total_amount: Mapped[float] = mapped_column(Float)
    status: Mapped[str] = mapped_column(String(32), default="Pending", index=True)
    notes: Mapped[str] = mapped_column(String(1000), default="")
    cancellation_reason: Mapped[str] = mapped_column(String(500), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    student: Mapped[User] = relationship("User", foreign_keys=[student_id])
    hostel: Mapped[Hostel] = relationship("Hostel")
    room: Mapped[Room | None] = relationship("Room")


class Notification(Base):
    __tablename__ = "notifications"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(160))
    message: Mapped[str] = mapped_column(String(500))
    category: Mapped[str] = mapped_column(String(32), default="system")
    is_read: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    link: Mapped[str] = mapped_column(String(160), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
