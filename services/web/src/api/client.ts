import type { ApiClient, CreateAccountRequest, LoginRequest } from './types'
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

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? ''
const TOKEN_KEY = 'studenthub.session.token'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = window.localStorage.getItem(TOKEN_KEY)
  const headers = new Headers(init?.headers)
  headers.set('Accept', 'application/json')
  if (init?.body) headers.set('Content-Type', 'application/json')
  if (token) headers.set('Authorization', `Bearer ${token}`)

  const response = await fetch(`${BASE_URL}${path}`, { ...init, headers })
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: { message?: string }; detail?: string } | null
    throw new Error(body?.error?.message ?? body?.detail ?? `Request failed with status ${response.status}`)
  }
  return response.json() as Promise<T>
}

function saveSession(token: string, user: User): void {
  window.localStorage.setItem(TOKEN_KEY, token)
  window.localStorage.setItem('studenthub.currentUser', JSON.stringify(user))
}

export const liveClient: ApiClient = {
  async getCurrentUser() {
    const token = window.localStorage.getItem(TOKEN_KEY)
    if (!token) throw new Error('No active session')
    const result = await request<{ user: User }>('/api/auth/me')
    saveSession(token, result.user)
    return result.user
  },

  async updateProfile(input) {
    const result = await request<{ user: User }>('/api/auth/me', { method: 'PUT', body: JSON.stringify(input) })
    const token = window.localStorage.getItem(TOKEN_KEY)
    if (token) saveSession(token, result.user)
    return result.user
  },

  async login(input: LoginRequest) {
    const result = await request<{ user: User; session: { token: string } }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(input),
    })
    saveSession(result.session.token, result.user)
    return result.user
  },

  async logout() {
    window.localStorage.removeItem(TOKEN_KEY)
    window.localStorage.removeItem('studenthub.currentUser')
  },

  async createAccount(input: CreateAccountRequest) {
    const result = await request<{ user: User; session: { token: string } }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(input),
    })
    saveSession(result.session.token, result.user)
    return result.user
  },

  async listHostels(filters) {
    const params = new URLSearchParams()
    if (filters?.search) params.set('search', filters.search)
    if (filters?.area) params.set('area', filters.area)
    if (filters?.location) params.set('location', filters.location)
    if (filters?.minRent) params.set('min_rent', String(filters.minRent))
    if (filters?.maxRent) params.set('max_rent', String(filters.maxRent))
    if (filters?.amenities) params.set('amenities', filters.amenities)
    if (filters?.gender) params.set('gender', filters.gender)
    if (filters?.roomType) params.set('room_type', filters.roomType)
    if (filters?.availableOnly) params.set('available_only', 'true')
    const query = params.toString()
    const result = await request<{ hostels: Hostel[] }>(`/api/hostels${query ? `?${query}` : ''}`)
    return result.hostels
  },

  async getHostelDetail(hostelId) {
    const result = await request<{ hostel: Hostel }>(`/api/hostels/${hostelId}`)
    return result.hostel
  },

  async createHostel(input) {
    const result = await request<{ hostel: Hostel }>('/api/hostels', { method: 'POST', body: JSON.stringify(input) })
    return result.hostel
  },

  async updateHostel(hostelId, input) {
    const result = await request<{ hostel: Hostel }>(`/api/hostels/${hostelId}`, { method: 'PUT', body: JSON.stringify(input) })
    return result.hostel
  },

  async addRoomToHostel(hostelId, input) {
    const result = await request<{ room: Room }>(`/api/hostels/${hostelId}/rooms`, { method: 'POST', body: JSON.stringify(input) })
    return result.room
  },

  async updateRoom(roomId, input) {
    const result = await request<{ room: Room }>(`/api/rooms/${roomId}`, { method: 'PATCH', body: JSON.stringify(input) })
    return result.room
  },

  async checkRoomAvailability(hostelId, checkInDate, durationMonths, roomId) {
    const params = new URLSearchParams({ check_in_date: checkInDate, duration_months: String(durationMonths) })
    if (roomId) params.set('room_id', roomId)
    return request<{ available: boolean; checkOutDate: string; rooms: RoomAvailabilityRoom[] }>(`/api/hostels/${hostelId}/availability?${params.toString()}`)
  },

  async createRoomBooking(input) {
    const result = await request<{ booking: RoomBooking }>('/api/room-bookings', { method: 'POST', body: JSON.stringify(input) })
    return result.booking
  },

  async listMyRoomBookings() {
    const result = await request<{ bookings: RoomBooking[] }>('/api/room-bookings')
    return result.bookings
  },

  async listOwnerRoomBookings() {
    const result = await request<{ bookings: RoomBooking[] }>('/api/owner/room-bookings')
    return result.bookings
  },

  async updateOwnerRoomBooking(bookingId, status, reason) {
    const result = await request<{ booking: RoomBooking }>(`/api/owner/room-bookings/${bookingId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status, reason: reason ?? '' }),
    })
    return result.booking
  },

  async cancelRoomBooking(bookingId, reason) {
    const result = await request<{ booking: RoomBooking }>(`/api/room-bookings/${bookingId}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ reason: reason ?? 'Cancelled by student' }),
    })
    return result.booking
  },

  async uploadImage(file) {
    const token = window.localStorage.getItem(TOKEN_KEY)
    const form = new FormData()
    form.append('file', file)
    const headers = new Headers()
    if (token) headers.set('Authorization', `Bearer ${token}`)
    const response = await fetch(`${BASE_URL}/api/uploads/image`, { method: 'POST', headers, body: form })
    if (!response.ok) throw new Error('Image upload failed')
    return response.json() as Promise<{ objectUrl: string }>
  },

  async getPaymentConfig() {
    return request<PaymentConfig>('/api/payments/config')
  },

  async createPaymentOrder(input) {
    return request<PaymentOrderResult>('/api/payments/create-order', { method: 'POST', body: JSON.stringify(input) })
  },

  async verifyPayment(input) {
    return request<{ verified: boolean; alreadyVerified: boolean; payment: PaymentRecord }>('/api/payments/verify', {
      method: 'POST',
      body: JSON.stringify(input),
    })
  },

  async failPayment(paymentId, reason) {
    const result = await request<{ payment: PaymentRecord }>(`/api/payments/${paymentId}/fail`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    })
    return result.payment
  },

  async checkoutPayment(input) {
    const result = await request<{ payment: { id: string; status: string; upiIntent?: string; upiQrData?: string; upiError?: string } }>('/api/payments/checkout', { method: 'POST', body: JSON.stringify(input) })
    return { paymentId: result.payment.id, status: result.payment.status, upiIntent: result.payment.upiIntent, upiQrData: result.payment.upiQrData, upiError: result.payment.upiError }
  },

  async listPayments() {
    const result = await request<{ payments: PaymentRecord[] }>('/api/payments')
    return result.payments
  },

  async listProducts(filters) {
    const params = new URLSearchParams()
    if (filters?.search) params.set('search', filters.search)
    if (filters?.category && filters.category !== 'all') params.set('category', filters.category)
    if (filters?.minPrice !== undefined) params.set('min_price', String(filters.minPrice))
    if (filters?.maxPrice !== undefined) params.set('max_price', String(filters.maxPrice))
    if (filters?.location) params.set('location', filters.location)
    if (filters?.inStockOnly) params.set('in_stock_only', 'true')
    const query = params.toString()
    const result = await request<{ products: Product[] }>(`/api/products${query ? `?${query}` : ''}`)
    return result.products
  },

  async getProduct(productId) {
    const result = await request<{ product: Product }>(`/api/products/${productId}`)
    return result.product
  },

  async createProduct(input) {
    const result = await request<{ product: Product }>('/api/products', { method: 'POST', body: JSON.stringify(input) })
    return result.product
  },

  async updateProduct(productId, input) {
    const result = await request<{ product: Product }>(`/api/products/${productId}`, { method: 'PUT', body: JSON.stringify(input) })
    return result.product
  },

  async updateProductStock(productId, stock) {
    const result = await request<{ product: Product }>(`/api/products/${productId}/stock`, { method: 'PATCH', body: JSON.stringify({ stock }) })
    return result.product
  },

  async toggleProductStatus(productId, isActive) {
    const result = await request<{ product: Product }>(`/api/products/${productId}/status`, { method: 'PATCH', body: JSON.stringify({ isActive }) })
    return result.product
  },

  async deleteProduct(productId) {
    return request<{ deleted: boolean; deactivated: boolean }>(`/api/products/${productId}`, { method: 'DELETE' })
  },

  async listSellerProducts() {
    const result = await request<{ products: Product[] }>('/api/seller/products')
    return result.products
  },

  async listSellerOrders() {
    return request<{ orders: SellerOrderItem[]; summary: { totalRevenue: number; pendingOrders: number; processedOrders: number; unitsSold: number } }>('/api/seller/orders')
  },

  async updateSellerOrderStatus(orderItemId, sellerStatus) {
    const result = await request<{ item: { id: string; sellerStatus: string; orderStatus: string } }>(`/api/seller/orders/${orderItemId}`, {
      method: 'PATCH',
      body: JSON.stringify({ sellerStatus }),
    })
    return result.item
  },

  async getCart() {
    const result = await request<{ cart: Cart }>('/api/cart')
    return result.cart
  },

  async addToCart(productId, quantity = 1) {
    const result = await request<{ cart: Cart }>('/api/cart/items', { method: 'POST', body: JSON.stringify({ productId, quantity }) })
    return result.cart
  },

  async updateCartItem(itemId, quantity) {
    const result = await request<{ cart: Cart }>(`/api/cart/items/${itemId}`, { method: 'PATCH', body: JSON.stringify({ quantity }) })
    return result.cart
  },

  async removeCartItem(itemId) {
    const result = await request<{ cart: Cart }>(`/api/cart/items/${itemId}`, { method: 'DELETE' })
    return result.cart
  },

  async clearCart() {
    const result = await request<{ cart: Cart }>('/api/cart', { method: 'DELETE' })
    return result.cart
  },

  async createOrder(input) {
    const result = await request<{ order: ProductOrder }>('/api/orders', { method: 'POST', body: JSON.stringify(input) })
    return result.order
  },

  async listOrders() {
    const result = await request<{ orders: ProductOrder[] }>('/api/orders')
    return result.orders
  },

  async cancelOrder(orderId, reason) {
    const result = await request<{ order: ProductOrder }>(`/api/orders/${orderId}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ reason: reason ?? 'Cancelled by student' }),
    })
    return result.order
  },

  async listNotifications() {
    return request<{ unreadCount: number; notifications: NotificationItem[] }>('/api/notifications')
  },

  async markNotificationRead(notificationId) {
    await request(`/api/notifications/${notificationId}/read`, { method: 'PATCH' })
  },

  async markAllNotificationsRead() {
    await request('/api/notifications/read-all', { method: 'POST' })
  },

  async getAdminOverview() {
    return request<{ stats: AdminStats }>('/api/admin/overview')
  },

  async listAdminUsers() {
    const result = await request<{ users: User[] }>('/api/admin/users')
    return result.users
  },

  async updateAdminUserRole(userId, role) {
    const result = await request<{ user: User }>(`/api/admin/users/${userId}/role`, { method: 'PATCH', body: JSON.stringify({ role }) })
    return result.user
  },

  async toggleAdminHostelVerify(hostelId) {
    const result = await request<{ hostel: { id: string; verified: boolean } }>(`/api/admin/hostels/${hostelId}/verify`, { method: 'PATCH' })
    return result.hostel
  },

  async toggleAdminProduct(productId) {
    const result = await request<{ product: { id: string; isActive: boolean } }>(`/api/admin/products/${productId}/toggle`, { method: 'PATCH' })
    return result.product
  },

  async aiChat(message) {
    const result = await request<{ reply: string }>('/api/ai/chat', { method: 'POST', body: JSON.stringify({ message }) })
    return result.reply
  },

  async compareRooms(ids) {
    return request<{ rooms: RoomComparison[]; recommendation: { cheapest: string | null; safest: string | null } }>(`/api/hostels/compare?ids=${ids.join(',')}`)
  },

  async getRoommateProfile() {
    const result = await request<{ profile: { course: string; budget: number; sleep: string; study: string; diet: string; hobbies: string } }>('/api/roommate-profile')
    return result.profile
  },

  async saveRoommateProfile(input) {
    await request<{ profile: object }>('/api/roommate-profile', { method: 'PUT', body: JSON.stringify(input) })
  },

  async getRoommateCandidates() {
    const result = await request<{ candidates: { id: string; name: string; email: string; course: string; budget: number; sleep: string; study: string; diet: string; hobbies: string[]; compatibility: number; disagreements: string[] }[] }>('/api/roommate-candidates')
    return result.candidates
  },

  async listRoommates(filters) {
    const params = new URLSearchParams()
    if (filters?.course) params.set('course', filters.course)
    if (filters?.budgetMax) params.set('budget_max', String(filters.budgetMax))
    if (filters?.preference) params.set('preference', filters.preference)
    if (filters?.sleep) params.set('sleep', filters.sleep)
    if (filters?.study) params.set('study', filters.study)
    if (filters?.diet) params.set('diet', filters.diet)
    if (filters?.hobby) params.set('hobby', filters.hobby)
    const query = params.toString()
    const result = await request<{ matches: Roommate[] }>(`/api/roommates/matches${query ? `?${query}` : ''}`)
    return result.matches
  },

  async getMessMenu() {
    const result = await request<{ menu: Meal[] }>('/api/mess/menu')
    return result.menu.map((meal, index) => ({
      id: meal.id ?? String(index + 1),
      name: meal.name ?? meal.meal,
      menu: meal.menu,
      time: meal.time,
      state: meal.state,
      price: meal.price,
      rating: meal.rating,
      image: meal.image,
    }))
  },

  async createMessPlan(input) {
    return request<{ plan: object }>('/api/mess/plans', { method: 'POST', body: JSON.stringify(input) })
  },

  async createMarketplaceListing(input) {
    const result = await request<{ listing: Listing }>('/api/marketplace/listings', { method: 'POST', body: JSON.stringify(input) })
    return result.listing
  },

  async createBookingRequest(input) {
    const result = await request<{ request: { id: string; targetName: string; status: string } }>('/api/booking-requests', { method: 'POST', body: JSON.stringify(input) })
    return { id: result.request.id, status: result.request.status }
  },

  async getOwnerDashboard() {
    return request('/api/owner/dashboard')
  },

  async updateOwnerRequest(requestId, status) {
    await request<{ request: object }>(`/api/owner/requests/${requestId}`, { method: 'PATCH', body: JSON.stringify({ status }) })
  },

  async listListings() {
    return this.listProducts()
  },

  async listConversations() {
    const result = await request<{ conversations: Conversation[] }>('/api/conversations')
    return result.conversations
  },

  async getCombinations(maxMonthlyCost) {
    const query = maxMonthlyCost ? `?max_monthly_cost=${maxMonthlyCost}` : ''
    return request<{ combinations: LivingCombination[]; status: Record<string, string> }>(`/api/decision/combinations${query}`)
  },

  async listFeedback(category) {
    const query = category ? `?category=${encodeURIComponent(category)}` : ''
    const result = await request<{ feedback: { id: string; rating: number; category: string; comment: string }[] }>(`/api/feedback${query}`)
    return result.feedback
  },

  async submitFeedback(input) {
    await request<{ feedback: { id: string } }>('/api/feedback', { method: 'POST', body: JSON.stringify(input) })
  },

  async listExpenses() {
    const result = await request<{ expenses: { id: string; title: string; amount: number; category: string }[] }>('/api/expenses')
    return result.expenses
  },

  async addExpense(input) {
    await request<{ expense: { id: string } }>('/api/expenses', { method: 'POST', body: JSON.stringify(input) })
  },

  async listSupport() {
    const result = await request<{ requests: { id: string; subject: string; description: string; status: string }[] }>('/api/support')
    return result.requests
  },

  async addSupport(input) {
    await request<{ request: { id: string } }>('/api/support', { method: 'POST', body: JSON.stringify(input) })
  },

  async submitReport(targetType: string, targetId: string, reason: string) {
    const result = await request<{ report: { id: string } }>('/api/reports', {
      method: 'POST',
      body: JSON.stringify({ targetType, targetId, reason }),
    })
    return { reportId: result.report.id }
  },
}
