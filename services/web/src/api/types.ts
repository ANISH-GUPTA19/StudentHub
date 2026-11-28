import type {
  AdminStats,
  Cart,
  Conversation,
  Hostel,
  Listing,
  LivingCombination,
  Meal,
  NotificationItem,
  PaymentConfig,
  PaymentOrderResult,
  PaymentRecord,
  Product,
  ProductOrder,
  Room,
  RoomAvailabilityRoom,
  RoomBooking,
  RoomComparison,
  Roommate,
  SellerOrderItem,
  User,
} from '../types/entities'

export interface LoginRequest {
  email: string
  password: string
}

export interface CreateAccountRequest {
  name: string
  email: string
  password: string
  role: User['role']
}

export interface ApiClient {
  getCurrentUser(): Promise<User>
  updateProfile(input: { name: string; phone?: string; course?: string }): Promise<User>
  login(input: LoginRequest): Promise<User>
  logout(): Promise<void>
  createAccount(input: CreateAccountRequest): Promise<User>

  // Hostels, rooms & bookings
  listHostels(filters?: {
    search?: string
    area?: string
    location?: string
    minRent?: number
    maxRent?: number
    amenities?: string
    gender?: string
    roomType?: string
    availableOnly?: boolean
  }): Promise<Hostel[]>
  getHostelDetail(hostelId: string): Promise<Hostel>
  createHostel(input: {
    name: string
    area: string
    rent: number
    amenities: string[]
    imageUrl?: string
    imageUrls?: string[]
    address?: string
    location?: string
    contactName?: string
    contactPhone?: string
    securityDeposit?: number
    otherCharges?: number
    roomType?: string
    genderPreference?: string
    rules?: string[]
    capacity?: number
    totalRooms?: number
    availableRooms?: number
    description?: string
  }): Promise<Hostel>
  updateHostel(hostelId: string, input: Record<string, unknown>): Promise<Hostel>
  addRoomToHostel(
    hostelId: string,
    input: { roomNumber: string; roomType: string; capacity: number; occupied?: number; monthlyRent: number; securityDeposit?: number; isAvailable?: boolean },
  ): Promise<Room>
  updateRoom(roomId: string, input: Record<string, unknown>): Promise<Room>
  checkRoomAvailability(hostelId: string, checkInDate: string, durationMonths: number, roomId?: string): Promise<{ available: boolean; checkOutDate: string; rooms: RoomAvailabilityRoom[] }>
  createRoomBooking(input: { hostelId: number; roomId?: number; checkInDate: string; durationMonths: number; notes?: string }): Promise<RoomBooking>
  listMyRoomBookings(): Promise<RoomBooking[]>
  listOwnerRoomBookings(): Promise<RoomBooking[]>
  updateOwnerRoomBooking(bookingId: string, status: string, reason?: string): Promise<RoomBooking>
  cancelRoomBooking(bookingId: string, reason?: string): Promise<RoomBooking>

  // Uploads & Payments
  uploadImage(file: File): Promise<{ objectUrl: string }>
  getPaymentConfig(): Promise<PaymentConfig>
  createPaymentOrder(input: { paymentType: 'order' | 'booking' | 'mess'; referenceId: number; idempotencyKey?: string }): Promise<PaymentOrderResult>
  verifyPayment(input: { paymentId: number; gatewayOrderId: string; gatewayPaymentId: string; gatewaySignature: string }): Promise<{ verified: boolean; alreadyVerified: boolean; payment: PaymentRecord }>
  failPayment(paymentId: string, reason: string): Promise<PaymentRecord>
  checkoutPayment(input: { purpose: string; amount: number; method: 'upi' | 'card' | 'cash'; recipientVpa?: string; recipientName?: string }): Promise<{ paymentId: string; status: string; upiIntent?: string; upiQrData?: string; upiError?: string }>
  listPayments(): Promise<PaymentRecord[]>

  // Marketplace Products, Cart & Orders
  listProducts(filters?: { search?: string; category?: string; minPrice?: number; maxPrice?: number; location?: string; inStockOnly?: boolean }): Promise<Product[]>
  getProduct(productId: string): Promise<Product>
  createProduct(input: {
    title: string
    description?: string
    price: number
    stock: number
    category: string
    condition: string
    listingType?: string
    location?: string
    contactName: string
    contactPhone?: string
    imageUrl?: string
    imageUrls?: string[]
  }): Promise<Product>
  updateProduct(productId: string, input: Record<string, unknown>): Promise<Product>
  updateProductStock(productId: string, stock: number): Promise<Product>
  toggleProductStatus(productId: string, isActive: boolean): Promise<Product>
  deleteProduct(productId: string): Promise<{ deleted: boolean; deactivated: boolean }>
  listSellerProducts(): Promise<Product[]>
  listSellerOrders(): Promise<{ orders: SellerOrderItem[]; summary: { totalRevenue: number; pendingOrders: number; processedOrders: number; unitsSold: number } }>
  updateSellerOrderStatus(orderItemId: string, sellerStatus: string): Promise<{ id: string; sellerStatus: string; orderStatus: string }>
  getCart(): Promise<Cart>
  addToCart(productId: number, quantity?: number): Promise<Cart>
  updateCartItem(itemId: string, quantity: number): Promise<Cart>
  removeCartItem(itemId: string): Promise<Cart>
  clearCart(): Promise<Cart>
  createOrder(input: { deliveryName: string; deliveryPhone: string; deliveryAddress: string; notes?: string; idempotencyKey?: string }): Promise<ProductOrder>
  listOrders(): Promise<ProductOrder[]>
  cancelOrder(orderId: string, reason?: string): Promise<ProductOrder>

  // Notifications & Admin
  listNotifications(): Promise<{ unreadCount: number; notifications: NotificationItem[] }>
  markNotificationRead(notificationId: string): Promise<void>
  markAllNotificationsRead(): Promise<void>
  getAdminOverview(): Promise<{ stats: AdminStats }>
  listAdminUsers(): Promise<User[]>
  updateAdminUserRole(userId: string, role: User['role']): Promise<User>
  toggleAdminHostelVerify(hostelId: string): Promise<{ id: string; verified: boolean }>
  toggleAdminProduct(productId: string): Promise<{ id: string; isActive: boolean }>

  // Existing student features
  aiChat(message: string): Promise<string>
  compareRooms(ids: string[]): Promise<{ rooms: RoomComparison[]; recommendation: { cheapest: string | null; safest: string | null } }>
  listRoommates(filters?: { course?: string; budgetMax?: number; preference?: string; sleep?: string; study?: string; diet?: string; hobby?: string }): Promise<Roommate[]>
  getRoommateProfile(): Promise<{ course: string; budget: number; sleep: string; study: string; diet: string; hobbies: string }>
  saveRoommateProfile(input: { course: string; budget: number; sleep: string; study: string; diet: string; hobbies: string }): Promise<void>
  getRoommateCandidates(): Promise<{ id: string; name: string; email: string; course: string; budget: number; sleep: string; study: string; diet: string; hobbies: string[]; compatibility: number; disagreements: string[] }[]>
  getMessMenu(): Promise<Meal[]>
  listListings(): Promise<Listing[]>
  createMessPlan(input: { name: string; meal: string; menu: string; time: string; price: number; imageUrl?: string }): Promise<object>
  createMarketplaceListing(input: { title: string; price: number; condition: string; category: string; contactName: string; contactPhone?: string; imageUrl?: string }): Promise<Listing>
  createBookingRequest(input: { targetType: 'room' | 'mess' | 'listing'; targetId: string; targetName: string; moveIn?: string; duration?: string; message?: string }): Promise<{ id: string; status: string }>
  getOwnerDashboard(): Promise<{
    role: User['role']
    requests: { id: string; studentId: string; targetType: string; targetName: string; moveIn: string; duration: string; message: string; status: string }[]
    payments: { purpose: string; amount: number; status: string }[]
    roomListings: { id: string; title: string; area: string; price: number; availableRooms?: number; totalRooms?: number }[]
    messListings: { id: string; title: string; meal: string; price: number }[]
    marketListings: { id: string; title: string; price: number; stock?: number; isActive?: boolean }[]
  }>
  updateOwnerRequest(requestId: string, status: 'pending' | 'approved' | 'declined'): Promise<void>
  listConversations(): Promise<Conversation[]>
  submitReport(targetType: string, targetId: string, reason: string): Promise<{ reportId: string }>
  getCombinations(maxMonthlyCost?: number): Promise<{ combinations: LivingCombination[]; status: Record<string, string> }>
  submitFeedback(input: { category: string; rating: number; comment?: string }): Promise<void>
  listFeedback(category?: string): Promise<{ id: string; rating: number; category: string; comment: string }[]>
  listExpenses(): Promise<{ id: string; title: string; amount: number; category: string }[]>
  addExpense(input: { title: string; amount: number; category: string }): Promise<void>
  listSupport(): Promise<{ id: string; subject: string; description: string; status: string }[]>
  addSupport(input: { subject: string; description: string }): Promise<void>
}
