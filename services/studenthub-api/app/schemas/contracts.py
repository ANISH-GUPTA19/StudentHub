from enum import Enum
from pydantic import BaseModel, Field


class ErrorCode(str, Enum):
    VALIDATION_ERROR = "VALIDATION_ERROR"
    BAD_REQUEST = "BAD_REQUEST"
    NOT_FOUND = "NOT_FOUND"
    CONFLICT = "CONFLICT"
    UNAUTHORIZED = "UNAUTHORIZED"
    FORBIDDEN = "FORBIDDEN"
    INTERNAL_ERROR = "INTERNAL_ERROR"


class ErrorDetail(BaseModel):
    code: ErrorCode
    message: str
    details: dict | None = None


class ErrorResponse(BaseModel):
    error: ErrorDetail


class RegisterRequest(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    email: str = Field(pattern=r"^[^\s@]+@[^\s@]+\.[^\s@]+$", max_length=255)
    password: str = Field(min_length=6, max_length=128)
    role: str = Field(pattern="^(student|hostel_owner|mess_owner|seller)$")


class LoginRequest(BaseModel):
    email: str = Field(pattern=r"^[^\s@]+@[^\s@]+\.[^\s@]+$", max_length=255)
    password: str


class UploadRequest(BaseModel):
    type: str
    filename: str
    contentType: str


class ReportRequest(BaseModel):
    targetType: str
    targetId: str
    reason: str = Field(min_length=3, max_length=500)


class HostelCreateRequest(BaseModel):
    name: str = Field(min_length=2, max_length=160)
    area: str = Field(min_length=2, max_length=160)
    rent: float = Field(gt=0)
    rating: float = Field(default=4.5, ge=0, le=5)
    amenities: list[str] = Field(default_factory=list)
    imageUrl: str | None = None


class MessPlanCreateRequest(BaseModel):
    name: str = Field(min_length=2, max_length=160)
    meal: str = Field(min_length=2, max_length=64)
    menu: str = Field(min_length=2, max_length=500)
    time: str = Field(min_length=2, max_length=64)
    price: float = Field(gt=0)
    imageUrl: str | None = None


class MarketplaceListingCreateRequest(BaseModel):
    title: str = Field(min_length=2, max_length=160)
    price: float = Field(gt=0)
    condition: str = Field(min_length=2, max_length=64)
    category: str = Field(min_length=2, max_length=64)
    contactName: str = Field(min_length=2, max_length=120)
    contactPhone: str = Field(default="", max_length=32)
    imageUrl: str | None = None


class BookingRequestCreate(BaseModel):
    targetType: str = Field(pattern="^(room|mess|listing)$")
    targetId: str = Field(min_length=1, max_length=120)
    targetName: str = Field(min_length=2, max_length=160)
    moveIn: str = Field(default="", max_length=32)
    duration: str = Field(default="", max_length=64)
    message: str = Field(default="", max_length=1000)


class BookingStatusUpdate(BaseModel):
    status: str = Field(pattern="^(pending|approved|declined)$")


class PaymentRequest(BaseModel):
    purpose: str = Field(min_length=2, max_length=120)
    amount: float = Field(gt=0)
    method: str = Field(pattern="^(upi|card|cash)$")
    recipientVpa: str | None = None
    recipientName: str | None = None


class AIChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=1000)


class FeedbackRequest(BaseModel):
    category: str = Field(min_length=2, max_length=32)
    rating: int = Field(ge=1, le=5)
    comment: str = Field(default="", max_length=500)


class ExpenseRequest(BaseModel):
    title: str = Field(min_length=2, max_length=120)
    amount: float = Field(gt=0)
    category: str = Field(min_length=2, max_length=32)


class RoommateProfileRequest(BaseModel):
    course: str = ""
    budget: int = Field(default=0, ge=0)
    sleep: str = ""
    study: str = ""
    diet: str = ""
    hobbies: str = ""


class RoommateGroupRequest(BaseModel):
    name: str = Field(min_length=2, max_length=160)
    area: str = ""
    budget: int = Field(default=0, ge=0)
    memberIds: list[int] = Field(default_factory=list)


class SupportRequestCreate(BaseModel):
    subject: str = Field(min_length=2, max_length=160)
    description: str = Field(min_length=3, max_length=1000)
