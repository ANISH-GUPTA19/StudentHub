export type Role = 'student' | 'hostel_owner' | 'mess_owner' | 'seller' | 'admin'

export interface User {
  id: string
  name: string
  email: string
  role: Role
  phone?: string
  course?: string
}

export interface Room {
  id: string
  hostelId: string
  roomNumber: string
  roomType: string
  capacity: number
  occupied: number
  spotsLeft: number
  monthlyRent: number
  securityDeposit: number
  isAvailable: boolean
}

export interface Hostel {
  id: string
  ownerId?: string | null
  name: string
  area: string
  location?: string
  address?: string
  contactName?: string
  contactPhone?: string
  rent: number
  securityDeposit?: number
  otherCharges?: number
  rating: number
  verified: boolean
  image?: string
  images?: string[]
  amenities?: string[]
  rules?: string[]
  roomType?: string
  genderPreference?: 'Any' | 'Boys' | 'Girls' | string
  capacity?: number
  occupied?: number
  totalRooms?: number
  availableRooms?: number
  isAvailable?: boolean
  description?: string
  rooms?: Room[]
  distanceKm?: number
}

export interface RoomAvailabilityRoom extends Room {
  checkInDate: string
  checkOutDate: string
  durationMonths: number
  otherCharges: number
  totalAmount: number
}

export interface RoomBooking {
  id: string
  bookingCode: string
  studentId: string
  studentName: string
  hostelId: string
  hostelName: string
  hostelArea: string
  roomId?: string | null
  roomNumber: string
  roomType: string
  ownerId?: string | null
  checkInDate: string
  checkOutDate: string
  durationMonths: number
  monthlyRent: number
  securityDeposit: number
  otherCharges: number
  totalAmount: number
  status: 'Pending' | 'Confirmed' | 'Payment Pending' | 'Paid' | 'Cancelled' | 'Rejected' | string
  notes: string
  cancellationReason: string
  createdAt: string
  payment?: {
    id: string
    status: string
    gateway: string
    gatewayOrderId?: string | null
    gatewayPaymentId?: string | null
  } | null
}

export interface RoommateCandidate {
  id: string
  name: string
  email: string
  course: string
  budget: number
  sleep: string
  study: string
  diet: string
  hobbies: string[]
  compatibility: number
  disagreements: string[]
}

export interface Roommate {
  id: string
  name: string
  course: string
  budget: string
  match: number
  preferences?: string[]
  avatar?: string
  sleep?: string
  study?: string
  diet?: string
  hobbies?: string[]
}

export interface RoomComparison {
  id: string
  name: string
  area: string
  rent: number
  rating: number
  amenities: string[]
  safetyScore: number
  valueScore: number
  image?: string
}

export interface Meal {
  id: string
  name?: string
  meal?: string
  menu: string
  time: string
  state: 'Available' | 'Serving' | 'Upcoming'
  price?: number
  rating?: number
  image?: string
}

export interface Product {
  id: string
  sellerId?: string
  title: string
  description?: string
  seller: string
  contactName?: string
  contactPhone?: string
  price: number
  stock: number
  inStock: boolean
  isActive: boolean
  condition: string
  rating?: number
  category: string
  listingType?: 'used_senior' | 'new_seller' | 'seller' | string
  location?: string
  image?: string
  images?: string[]
}

export type Listing = Product

export interface CartItem {
  id: string
  productId: string
  title: string
  price: number
  quantity: number
  lineTotal: number
  stock: number
  isActive: boolean
  available: boolean
  image?: string
  seller: string
  location: string
}

export interface Cart {
  id: string
  items: CartItem[]
  itemCount: number
  subtotal: number
  deliveryFee: number
  totalAmount: number
}

export interface OrderItem {
  id: string
  productId: string
  sellerId: string
  productTitle: string
  unitPrice: number
  quantity: number
  lineTotal: number
  sellerStatus: string
  image?: string | null
}

export interface ProductOrder {
  id: string
  orderNumber: string
  studentId: string
  status: string
  paymentStatus: string
  subtotal: number
  deliveryFee: number
  totalAmount: number
  deliveryName: string
  deliveryPhone: string
  deliveryAddress: string
  notes: string
  createdAt: string
  payment?: {
    id: string
    status: string
    gateway: string
    gatewayOrderId?: string | null
    gatewayPaymentId?: string | null
  } | null
  items: OrderItem[]
}

export interface SellerOrderItem {
  id: string
  orderId: string
  orderNumber: string
  productId: string
  productTitle: string
  unitPrice: number
  quantity: number
  lineTotal: number
  sellerStatus: string
  orderStatus: string
  paymentStatus: string
  deliveryName: string
  deliveryPhone: string
  deliveryAddress: string
  createdAt: string
}

export interface PaymentRecord {
  id: string
  userId?: string
  purpose: string
  amount: number
  currency?: string
  method: string
  status: string
  paymentType?: string
  referenceId?: string | null
  gateway?: string
  gatewayOrderId?: string | null
  gatewayPaymentId?: string | null
  failureReason?: string | null
  createdAt?: string
}

export interface PaymentConfig {
  gateway: string
  configured: boolean
  keyId: string | null
  currency: string
  mode: string
  requiredEnv: string[]
  instructions: string
}

export interface PaymentOrderResult {
  payment: PaymentRecord
  gatewayConfigured: boolean
  keyId: string | null
  amountPaise: number
  currency: string
  requiredEnv?: string[]
  message?: string
}

export interface NotificationItem {
  id: string
  title: string
  message: string
  category: string
  isRead: boolean
  link: string
  createdAt: string
}

export interface AdminStats {
  users: number
  products: number
  orders: number
  hostels: number
  bookings: number
  payments: number
  paidRevenue: number
}

export interface LivingCombination {
  id: string
  room: { id: string; name: string; area: string; rent: number; amenities: string[]; verified: boolean; image?: string }
  roommate: { id: string; name: string; match: number; course: string }
  mess: { name: string; monthlyCost: number; status: string }
  monthlyCost: { room: number; mess: number; transport: number; essentials: number; total: number }
  safetyScore: number
  freshness: string
  availability: string
  decisionScore: number
}

export interface Conversation {
  id: string
  contact: string
  subject: string
  lastMessage: string
  state: 'Unread' | 'Read' | 'Open'
}
