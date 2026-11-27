import type { ApiClient, CreateAccountRequest, LoginRequest } from './types'
import type { Conversation, Hostel, Listing, LivingCombination, Meal, Roommate, RoomComparison, User } from '../types/entities'

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
    const body = await response.json().catch(() => null) as { error?: { message?: string } } | null
    throw new Error(body?.error?.message ?? `Request failed with status ${response.status}`)
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
    if (filters?.area) params.set('area', filters.area)
    if (filters?.maxRent) params.set('max_rent', String(filters.maxRent))
    if (filters?.amenities) params.set('amenities', filters.amenities)
    const query = params.toString()
    const result = await request<{ hostels: Hostel[] }>(`/api/hostels${query ? `?${query}` : ''}`)
    return result.hostels
  },

  async createHostel(input) {
    const result = await request<{ hostel: Hostel }>('/api/hostels', { method: 'POST', body: JSON.stringify(input) })
    return result.hostel
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

  async checkoutPayment(input) {
    const result = await request<{ payment: { id: string; status: string; upiIntent?: string; upiQrData?: string; upiError?: string } }>('/api/payments/checkout', { method: 'POST', body: JSON.stringify(input) })
    return { paymentId: result.payment.id, status: result.payment.status, upiIntent: result.payment.upiIntent, upiQrData: result.payment.upiQrData, upiError: result.payment.upiError }
  },

  async listPayments() {
    const result = await request<{ payments: { id: string; purpose: string; amount: number; method: string; status: string }[] }>('/api/payments')
    return result.payments
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
      id: String(index + 1),
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
    return request<{ role: User['role']; requests: { id: string; studentId: string; targetType: string; targetName: string; moveIn: string; duration: string; message: string; status: string }[]; payments: { purpose: string; amount: number; status: string }[]; roomListings: { id: string; title: string; area: string; price: number }[]; messListings: { id: string; title: string; meal: string; price: number }[]; marketListings: { id: string; title: string; price: number }[] }>('/api/owner/dashboard')
  },

  async updateOwnerRequest(requestId, status) {
    await request<{ request: object }>(`/api/owner/requests/${requestId}`, { method: 'PATCH', body: JSON.stringify({ status }) })
  },

  async listListings() {
    const result = await request<{ listings: Listing[] }>('/api/marketplace/listings')
    return result.listings
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
