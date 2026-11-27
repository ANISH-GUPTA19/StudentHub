import type { Conversation, Hostel, Listing, LivingCombination, Meal, Roommate, RoomComparison, User } from '../types/entities'

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
  login(input: LoginRequest): Promise<User>
  logout(): Promise<void>
  createAccount(input: CreateAccountRequest): Promise<User>
  listHostels(filters?: { area?: string; maxRent?: number; amenities?: string }): Promise<Hostel[]>
  createHostel(input: { name: string; area: string; rent: number; amenities: string[]; imageUrl?: string }): Promise<Hostel>
  uploadImage(file: File): Promise<{ objectUrl: string }>
  checkoutPayment(input: { purpose: string; amount: number; method: 'upi' | 'card' | 'cash'; recipientVpa?: string; recipientName?: string }): Promise<{ paymentId: string; status: string; upiIntent?: string; upiQrData?: string; upiError?: string }>
  listPayments(): Promise<{ id: string; purpose: string; amount: number; method: string; status: string }[]>
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
  getOwnerDashboard(): Promise<{ role: User['role']; requests: { id: string; studentId: string; targetType: string; targetName: string; moveIn: string; duration: string; message: string; status: string }[]; payments: { purpose: string; amount: number; status: string }[]; roomListings: { id: string; title: string; area: string; price: number }[]; messListings: { id: string; title: string; meal: string; price: number }[]; marketListings: { id: string; title: string; price: number }[] }>
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
