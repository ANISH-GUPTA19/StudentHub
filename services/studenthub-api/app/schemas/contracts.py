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


class ProfileUpdateRequest(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    phone: str = Field(default="", max_length=32)
    course: str = Field(default="", max_length=160)


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
    imageUrls: list[str] = Field(default_factory=list)
    address: str = Field(default="", max_length=300)
    location: str = Field(default="", max_length=160)
    contactName: str = Field(default="", max_length=120)
    contactPhone: str = Field(default="", max_length=32)
    securityDeposit: float = Field(default=0, ge=0)
    otherCharges: float = Field(default=0, ge=0)
    roomType: str = Field(default="Shared", max_length=64)
    genderPreference: str = Field(default="Any", pattern="^(Any|Boys|Girls)$")
    rules: list[str] = Field(default_factory=list)
    capacity: int = Field(default=2, ge=1, le=20)
    totalRooms: int = Field(default=4, ge=1, le=200)
    availableRooms: int = Field(default=2, ge=0, le=200)
    description: str = Field(default="", max_length=2000)


class HostelUpdateRequest(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=160)
    area: str | None = Field(default=None, min_length=2, max_length=160)
    rent: float | None = Field(default=None, gt=0)
    amenities: list[str] | None = None
    address: str | None = Field(default=None, max_length=300)
    location: str | None = Field(default=None, max_length=160)
    contactName: str | None = Field(default=None, max_length=120)
    contactPhone: str | None = Field(default=None, max_length=32)
    securityDeposit: float | None = Field(default=None, ge=0)
    otherCharges: float | None = Field(default=None, ge=0)
    roomType: str | None = Field(default=None, max_length=64)
    genderPreference: str | None = Field(default=None, pattern="^(Any|Boys|Girls)$")
    rules: list[str] | None = None
    availableRooms: int | None = Field(default=None, ge=0, le=200)
    isAvailable: bool | None = None
    description: str | None = Field(default=None, max_length=2000)
    imageUrls: list[str] | None = None


class RoomCreateRequest(BaseModel):
    roomNumber: str = Field(min_length=1, max_length=64)
    roomType: str = Field(default="Shared", max_length=64)
    capacity: int = Field(default=2, ge=1, le=12)
    occupied: int = Field(default=0, ge=0, le=12)
    monthlyRent: float = Field(gt=0)
    securityDeposit: float = Field(default=0, ge=0)
    isAvailable: bool = True


class RoomUpdateRequest(BaseModel):
    roomType: str | None = Field(default=None, max_length=64)
    capacity: int | None = Field(default=None, ge=1, le=12)
    occupied: int | None = Field(default=None, ge=0, le=12)
    monthlyRent: float | None = Field(default=None, gt=0)
    securityDeposit: float | None = Field(default=None, ge=0)
    isAvailable: bool | None = None


class RoomBookingCreateRequest(BaseModel):
    hostelId: int = Field(gt=0)
    roomId: int | None = Field(default=None, gt=0)
    checkInDate: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    durationMonths: int = Field(ge=1, le=36)
    notes: str = Field(default="", max_length=1000)


class RoomBookingStatusUpdateRequest(BaseModel):
    status: str = Field(pattern="^(Pending|Confirmed|Payment Pending|Rejected|Cancelled)$")
    reason: str = Field(default="", max_length=500)


class RoomBookingCancelRequest(BaseModel):
    reason: str = Field(default="Cancelled by student", max_length=500)


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


class ProductCreateRequest(BaseModel):
    title: str = Field(min_length=2, max_length=160)
    description: str = Field(default="", max_length=2000)
    price: float = Field(gt=0)
    stock: int = Field(ge=0, le=100000)
    category: str = Field(min_length=2, max_length=64)
    condition: str = Field(default="New", min_length=2, max_length=64)
    listingType: str = Field(default="new_seller", pattern="^(new_seller|used_senior|seller)$")
    location: str = Field(default="Campus Store", max_length=160)
    contactName: str = Field(min_length=2, max_length=120)
    contactPhone: str = Field(default="", max_length=32)
    imageUrl: str | None = None
    imageUrls: list[str] = Field(default_factory=list)


class ProductUpdateRequest(BaseModel):
    title: str | None = Field(default=None, min_length=2, max_length=160)
    description: str | None = Field(default=None, max_length=2000)
    price: float | None = Field(default=None, gt=0)
    stock: int | None = Field(default=None, ge=0, le=100000)
    category: str | None = Field(default=None, min_length=2, max_length=64)
    condition: str | None = Field(default=None, min_length=2, max_length=64)
    location: str | None = Field(default=None, max_length=160)
    contactName: str | None = Field(default=None, min_length=2, max_length=120)
    contactPhone: str | None = Field(default=None, max_length=32)
    imageUrl: str | None = None
    imageUrls: list[str] | None = None
    isActive: bool | None = None


class ProductStockUpdateRequest(BaseModel):
    stock: int = Field(ge=0, le=100000)


class ProductStatusUpdateRequest(BaseModel):
    isActive: bool


class CartItemAddRequest(BaseModel):
    productId: int = Field(gt=0)
    quantity: int = Field(default=1, ge=1, le=50)


class CartItemUpdateRequest(BaseModel):
    quantity: int = Field(ge=1, le=50)


class OrderCreateRequest(BaseModel):
    deliveryName: str = Field(min_length=2, max_length=120)
    deliveryPhone: str = Field(min_length=7, max_length=32)
    deliveryAddress: str = Field(min_length=5, max_length=500)
    notes: str = Field(default="", max_length=500)
    idempotencyKey: str | None = Field(default=None, max_length=120)


class OrderItemStatusUpdateRequest(BaseModel):
    sellerStatus: str = Field(pattern="^(pending|accepted|rejected|packed|shipped|delivered)$")


class OrderCancelRequest(BaseModel):
    reason: str = Field(default="Cancelled by student", max_length=500)


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


class PaymentOrderCreateRequest(BaseModel):
    paymentType: str = Field(pattern="^(order|booking|mess)$")
    referenceId: int = Field(gt=0)
    idempotencyKey: str | None = Field(default=None, max_length=120)


class PaymentVerifyRequest(BaseModel):
    paymentId: int = Field(gt=0)
    gatewayOrderId: str = Field(min_length=3, max_length=120)
    gatewayPaymentId: str = Field(min_length=3, max_length=120)
    gatewaySignature: str = Field(min_length=10, max_length=255)


class PaymentFailRequest(BaseModel):
    reason: str = Field(default="Payment cancelled or failed", max_length=500)


class AdminUserRoleUpdateRequest(BaseModel):
    role: str = Field(pattern="^(student|hostel_owner|mess_owner|seller|admin)$")


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
