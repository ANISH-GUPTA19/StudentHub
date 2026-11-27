export type Role = 'student' | 'hostel_owner' | 'mess_owner' | 'seller' | 'admin'

export interface User {
  id: string
  name: string
  email: string
  role: Role
  course?: string
}

export interface Hostel {
  id: string
  name: string
  area: string
  rent: number
  rating: number
  verified: boolean
  image?: string
  amenities?: string[]
  distanceKm?: number
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

export interface Listing {
  id: string
  title: string
  seller: string
  contactName?: string
  contactPhone?: string
  price: number
  condition: string
  image?: string
  drop?: number
  rating?: number
  category?: 'books' | 'electronics' | 'essentials'
  listingType?: 'used_senior' | 'new_seller'
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
