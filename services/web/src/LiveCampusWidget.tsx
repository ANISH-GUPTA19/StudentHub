import { useEffect, useState } from 'react'

const campuses = [
  'AITD Kanpur, Uttar Pradesh',
  'IIT Kanpur, Uttar Pradesh',
  'North Campus, Delhi',
  'Koramangala, Bengaluru',
]

export function LiveCampusWidget() {
  const [now, setNow] = useState(() => new Date())
  const [campus, setCampus] = useState(() => localStorage.getItem('studenthub.campus') || campuses[0])
  const [locationState, setLocationState] = useState<'idle' | 'loading' | 'granted' | 'denied' | 'unavailable'>('idle')

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  const formatted = new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(now)
  const time = new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  }).format(now)

  const selectCampus = (value: string) => {
    setCampus(value)
    localStorage.setItem('studenthub.campus', value)
  }

  const useCurrentLocation = () => {
    if (!navigator.geolocation) {
      setLocationState('unavailable')
      return
    }
    setLocationState('loading')
    navigator.geolocation.getCurrentPosition(
      () => {
        setLocationState('granted')
        setCampus(campus)
      },
      () => setLocationState('denied'),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
    )
  }

  return <section className="live-campus-widget" aria-label="Live campus information">
    <div className="live-campus-widget__time">
      <strong>{time}</strong>
      <span>{formatted}</span>
      <small>Asia/Kolkata (IST)</small>
    </div>
    <div className="live-campus-widget__location">
      <span>Campus</span>
      <select value={campus} onChange={event => selectCampus(event.target.value)} aria-label="Select campus">
        {campuses.map(item => <option key={item} value={item}>{item}</option>)}
      </select>
      <button type="button" onClick={useCurrentLocation} disabled={locationState === 'loading'}>
        {locationState === 'loading' ? 'Locating...' : 'Use current location'}
      </button>
      {locationState === 'denied' && <small>Location denied. Using selected campus.</small>}
      {locationState === 'unavailable' && <small>Geolocation unavailable. Using selected campus.</small>}
      {locationState === 'granted' && <small>Permission granted. Showing selected campus.</small>}
    </div>
  </section>
}
