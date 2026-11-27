from sqlalchemy import Boolean, Float, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


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


class Payment(Base):
    __tablename__ = "payments"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(Integer)
    purpose: Mapped[str] = mapped_column(String(120))
    amount: Mapped[float] = mapped_column(Float)
    method: Mapped[str] = mapped_column(String(32))
    status: Mapped[str] = mapped_column(String(32), default="completed")


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


class Hostel(Base):
    __tablename__ = "hostels"
    owner_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(160))
    area: Mapped[str] = mapped_column(String(160))
    rent: Mapped[float] = mapped_column(Float)
    rating: Mapped[float] = mapped_column(Float)
    verified: Mapped[bool] = mapped_column(Boolean, default=True)
    amenities: Mapped[str] = mapped_column(String(500), default="")
    image_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
