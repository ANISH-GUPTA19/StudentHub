import heroFallback from '../assets/hero.png'

export const FALLBACK_ROOM_IMAGE = 'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=900'
export const FALLBACK_MEAL_IMAGE = 'https://images.unsplash.com/photo-1547592180-85f173990554?w=900'
export const FALLBACK_PRODUCT_IMAGE = 'https://images.unsplash.com/photo-1496181133206-80ce9b88a853?w=900'
export const LOCAL_ASSET_FALLBACK = heroFallback

export function getGreeting(date: Date): string {
  const hour = date.getHours()
  if (hour >= 5 && hour < 12) return 'Good Morning'
  if (hour >= 12 && hour < 17) return 'Good Afternoon'
  if (hour >= 17 && hour < 21) return 'Good Evening'
  return 'Good Night'
}

export function formatLocalDate(date: Date): string {
  const weekday = new Intl.DateTimeFormat(undefined, { weekday: 'long' }).format(date)
  const day = date.getDate()
  const month = new Intl.DateTimeFormat(undefined, { month: 'long' }).format(date)
  const year = date.getFullYear()
  return `${weekday}, ${day} ${month} ${year}`
}

export function formatLocalTime(date: Date, includeSeconds = false): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    ...(includeSeconds ? { second: '2-digit' } : {}),
    hour12: true,
  }).format(date)
}

export function getLocalTimeZoneName(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Local time'
  } catch {
    return 'Local time'
  }
}

export function resolveImageUrl(url?: string | null, fallback = ''): string {
  if (!url) return fallback || LOCAL_ASSET_FALLBACK
  if (url.startsWith('/uploads/')) {
    return `${window.location.protocol}//${window.location.hostname}:8000${url}`
  }
  return url
}

export function handleImageError(fallbackUrl: string) {
  return (event: React.SyntheticEvent<HTMLImageElement>) => {
    const img = event.currentTarget
    if (img.dataset.fallbackApplied === 'local') return
    if (img.dataset.fallbackApplied === 'primary' || img.src === fallbackUrl) {
      img.dataset.fallbackApplied = 'local'
      img.src = LOCAL_ASSET_FALLBACK
      return
    }
    img.dataset.fallbackApplied = 'primary'
    img.src = fallbackUrl
  }
}
