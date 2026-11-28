import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Badge,
  Button,
  Card,
  CardFooter,
  CardHeader,
  CardPreview,
  Field,
  Input,
  MessageBar,
  MessageBarBody,
  Skeleton,
  SkeletonItem,
  Textarea,
} from '@fluentui/react-components'
import { BookmarkRegular, DismissRegular, SearchRegular } from '@fluentui/react-icons'
import { api } from '../api'
import {
  computeLocalComparison,
  DEMO_HOSTELS,
  generateCityDemoHostels,
  normalizeRoomTypeMatch,
} from '../data/demoRooms'
import type { Hostel, RoomAvailabilityRoom, RoomBooking, RoomComparison, User } from '../types/entities'
import { runRazorpayFlow, type GatewayOutcome } from '../utils/razorpay'
import { FALLBACK_ROOM_IMAGE, handleImageError, resolveImageUrl } from '../utils/time'

export function RoomsView({ user }: { user: User | null }) {
  const canManage = user?.role === 'hostel_owner' || user?.role === 'admin'
  const isStudent = user?.role === 'student'

  const [dbHostels, setDbHostels] = useState<Hostel[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Search & Filters
  const [searchInput, setSearchInput] = useState('')
  const [appliedLocation, setAppliedLocation] = useState('')
  const [maxRent, setMaxRent] = useState('')
  const [gender, setGender] = useState('Any')
  const [roomType, setRoomType] = useState('all')
  const [amenities, setAmenities] = useState('')
  const [availableOnly, setAvailableOnly] = useState(false)
  const [sortBy, setSortBy] = useState<'recommended' | 'rent_asc' | 'rent_desc' | 'rating_desc'>('recommended')

  // Compare & Save
  const [selectedRooms, setSelectedRooms] = useState<string[]>([])
  const [comparisons, setComparisons] = useState<RoomComparison[]>([])
  const [savedStayIds, setSavedStayIds] = useState<string[]>(() =>
    JSON.parse(localStorage.getItem('studenthub.savedStays') ?? '[]'),
  )

  // Room Detail & Booking
  const [detailHostel, setDetailHostel] = useState<Hostel | null>(null)
  const [selectedRoomId, setSelectedRoomId] = useState<string>('')
  const [checkInDate, setCheckInDate] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() + 3)
    return d.toISOString().slice(0, 10)
  })
  const [durationMonths, setDurationMonths] = useState('6')
  const [bookingNotes, setBookingNotes] = useState('')
  const [availabilityResult, setAvailabilityResult] = useState<{
    available: boolean
    checkOutDate: string
    rooms: RoomAvailabilityRoom[]
  } | null>(null)
  const [createdBooking, setCreatedBooking] = useState<RoomBooking | null>(null)
  const [bookingBusy, setBookingBusy] = useState(false)
  const [paymentOutcome, setPaymentOutcome] = useState<GatewayOutcome | null>(null)
  const bookingSectionRef = useRef<HTMLDivElement | null>(null)

  // Owner Add Property & Add Room
  const [showAdd, setShowAdd] = useState(false)
  const [addError, setAddError] = useState('')
  const [newRoomFiles, setNewRoomFiles] = useState<File[]>([])
  const [newHostel, setNewHostel] = useState({
    name: '',
    area: '',
    address: '',
    contactName: user?.name ?? '',
    contactPhone: user?.phone ?? '',
    rent: '',
    securityDeposit: '',
    otherCharges: '0',
    roomType: 'Shared',
    genderPreference: 'Any',
    capacity: '2',
    totalRooms: '4',
    amenities: 'Wi-Fi, Meals, Security',
    rules: 'Quiet hours after 10:30 PM, Valid student ID required',
    description: '',
    imageUrl: '',
  })

  const [addUnitForHostelId, setAddUnitForHostelId] = useState<string | null>(null)
  const [unitForm, setUnitForm] = useState({
    roomNumber: '',
    roomType: 'Double',
    capacity: '2',
    monthlyRent: '',
    securityDeposit: '',
  })

  const notify = (detail: string) => window.dispatchEvent(new CustomEvent('studenthub-thank', { detail }))

  const loadDbHostels = useCallback(async () => {
    setError('')
    try {
      const list = await api.listHostels()
      setDbHostels(list)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load hostels')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadDbHostels()
  }, [loadDbHostels])

  const allBaseHostels = useMemo(() => [...dbHostels, ...DEMO_HOSTELS], [dbHostels])

  const { displayedHostels, generatedForCity } = useMemo(() => {
    const loc = appliedLocation.trim().toLowerCase()
    let pool: Hostel[] = allBaseHostels
    let generatedCity = ''

    if (loc) {
      const locationMatches = allBaseHostels.filter((h) =>
        `${h.location ?? ''} ${h.area} ${h.address ?? ''} ${h.name}`.toLowerCase().includes(loc),
      )
      if (locationMatches.length > 0) {
        pool = locationMatches
      } else {
        pool = generateCityDemoHostels(appliedLocation)
        generatedCity = appliedLocation.trim()
      }
    }

    const wantedAmenities = amenities
      .split(',')
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean)

    const filtered = pool.filter((h) => {
      if (maxRent && h.rent > Number(maxRent)) return false
      if (gender !== 'Any') {
        const g = (h.genderPreference || 'Any').toLowerCase()
        if (g !== 'any' && g !== gender.toLowerCase()) return false
      }
      if (!normalizeRoomTypeMatch(h.roomType, roomType)) return false
      if (availableOnly && (!h.isAvailable || (h.availableRooms ?? 1) <= 0)) return false
      if (wantedAmenities.length > 0) {
        const avail = (h.amenities ?? []).map((a) => a.toLowerCase())
        const ok = wantedAmenities.every((w) => avail.some((a) => a.includes(w) || (w === 'food' && a.includes('meal')) || (w === 'meals' && a.includes('food'))))
        if (!ok) return false
      }
      return true
    })

    const sorted = [...filtered]
    if (sortBy === 'rent_asc') sorted.sort((a, b) => a.rent - b.rent)
    else if (sortBy === 'rent_desc') sorted.sort((a, b) => b.rent - a.rent)
    else if (sortBy === 'rating_desc') sorted.sort((a, b) => b.rating - a.rating)

    return { displayedHostels: sorted, generatedForCity: generatedCity }
  }, [allBaseHostels, appliedLocation, maxRent, gender, roomType, availableOnly, amenities, sortBy])

  const triggerLocationSearch = () => {
    setAppliedLocation(searchInput.trim())
  }

  const openDetail = async (hostel: Hostel, focusBooking = false) => {
    setCreatedBooking(null)
    setAvailabilityResult(null)
    setPaymentOutcome(null)
    if (hostel.id.startsWith('demo-')) {
      setDetailHostel(hostel)
      setSelectedRoomId(hostel.rooms?.[0]?.id ?? '')
    } else {
      try {
        const fresh = await api.getHostelDetail(hostel.id)
        setDetailHostel(fresh)
        const firstAvail = fresh.rooms?.find((r) => r.isAvailable) ?? fresh.rooms?.[0]
        setSelectedRoomId(firstAvail?.id ?? '')
      } catch {
        setDetailHostel(hostel)
        setSelectedRoomId(hostel.rooms?.[0]?.id ?? '')
      }
    }
    window.setTimeout(() => {
      if (focusBooking && bookingSectionRef.current) {
        bookingSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
      } else {
        window.scrollTo({ top: 0, behavior: 'smooth' })
      }
    }, 60)
  }

  const runAvailabilityCheck = async () => {
    if (!detailHostel) return
    const months = Math.max(1, Number(durationMonths || 1))
    if (detailHostel.id.startsWith('demo-')) {
      const start = new Date(checkInDate)
      const end = new Date(start)
      end.setMonth(end.getMonth() + months)
      const checkOutDate = end.toISOString().slice(0, 10)
      const chosenRoom = detailHostel.rooms?.find((r) => r.id === selectedRoomId) ?? detailHostel.rooms?.[0]
      const rent = chosenRoom?.monthlyRent ?? detailHostel.rent
      const deposit = chosenRoom?.securityDeposit ?? detailHostel.securityDeposit ?? detailHostel.rent
      const other = detailHostel.otherCharges ?? 0
      const total = rent * months + deposit + other
      setAvailabilityResult({
        available: Boolean(detailHostel.isAvailable),
        checkOutDate,
        rooms: chosenRoom
          ? [
              {
                ...chosenRoom,
                checkInDate,
                checkOutDate,
                durationMonths: months,
                otherCharges: other,
                totalAmount: total,
              },
            ]
          : [],
      })
      return
    }
    try {
      const res = await api.checkRoomAvailability(
        detailHostel.id,
        checkInDate,
        months,
        selectedRoomId || undefined,
      )
      setAvailabilityResult(res)
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not check availability')
    }
  }

  const submitBooking = async () => {
    if (!detailHostel || !isStudent) return
    const months = Math.max(1, Number(durationMonths || 1))
    setBookingBusy(true)
    setPaymentOutcome(null)

    if (detailHostel.id.startsWith('demo-')) {
      const start = new Date(checkInDate)
      const end = new Date(start)
      end.setMonth(end.getMonth() + months)
      const checkOutDate = end.toISOString().slice(0, 10)
      const chosenRoom = detailHostel.rooms?.find((r) => r.id === selectedRoomId) ?? detailHostel.rooms?.[0]
      const monthlyRent = chosenRoom?.monthlyRent ?? detailHostel.rent
      const securityDeposit = chosenRoom?.securityDeposit ?? detailHostel.securityDeposit ?? detailHostel.rent
      const otherCharges = detailHostel.otherCharges ?? 0
      const totalAmount = monthlyRent * months + securityDeposit + otherCharges
      const demoBooking: RoomBooking = {
        id: `demo-bk-${Date.now()}`,
        bookingCode: `BK-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
        studentId: user?.id ?? 'student',
        studentName: user?.name ?? 'Student',
        hostelId: detailHostel.id,
        hostelName: detailHostel.name,
        hostelArea: detailHostel.location || detailHostel.area,
        roomId: chosenRoom?.id ?? null,
        roomNumber: chosenRoom?.roomNumber ?? '101',
        roomType: chosenRoom?.roomType ?? detailHostel.roomType ?? 'Shared',
        ownerId: null,
        checkInDate,
        checkOutDate,
        durationMonths: months,
        monthlyRent,
        securityDeposit,
        otherCharges,
        totalAmount,
        status: 'Payment Pending',
        notes: bookingNotes.trim(),
        cancellationReason: '',
        createdAt: new Date().toISOString(),
        payment: null,
      }
      const existing: RoomBooking[] = JSON.parse(localStorage.getItem('studenthub.demoBookings') ?? '[]')
      localStorage.setItem('studenthub.demoBookings', JSON.stringify([demoBooking, ...existing]))
      setCreatedBooking(demoBooking)
      notify(`Demo booking ${demoBooking.bookingCode} saved to My Bookings!`)
      setBookingBusy(false)
      return
    }

    try {
      const booking = await api.createRoomBooking({
        hostelId: Number(detailHostel.id),
        roomId: selectedRoomId ? Number(selectedRoomId) : undefined,
        checkInDate,
        durationMonths: months,
        notes: bookingNotes.trim(),
      })
      setCreatedBooking(booking)
      notify(`Booking ${booking.bookingCode} created (${booking.status}).`)
      await loadDbHostels()
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Booking could not be submitted')
    } finally {
      setBookingBusy(false)
    }
  }

  const payForBooking = async (booking: RoomBooking) => {
    if (booking.id.startsWith('demo-bk-')) {
      setPaymentOutcome({
        status: 'pending_config',
        paymentId: booking.bookingCode,
        message: 'Demo booking saved as Payment Pending. Configure Razorpay keys or book a verified DB property for live checkout.',
        requiredEnv: ['RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET', 'RAZORPAY_WEBHOOK_SECRET'],
      })
      return
    }
    setBookingBusy(true)
    setPaymentOutcome(null)
    try {
      const payOrder = await api.createPaymentOrder({
        paymentType: 'booking',
        referenceId: Number(booking.id),
      })
      const outcome = await runRazorpayFlow(payOrder, user, `Booking ${booking.bookingCode}`)
      setPaymentOutcome(outcome)
      if (outcome.status === 'paid') {
        setCreatedBooking({ ...booking, status: 'Paid' })
        await loadDbHostels()
      }
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not initiate payment')
    } finally {
      setBookingBusy(false)
    }
  }

  const addHostel = async () => {
    setAddError('')
    try {
      const uploadedUrls: string[] = []
      for (const file of newRoomFiles) {
        const res = await api.uploadImage(file)
        uploadedUrls.push(res.objectUrl)
      }
      if (newHostel.imageUrl.trim()) uploadedUrls.unshift(newHostel.imageUrl.trim())

      await api.createHostel({
        name: newHostel.name.trim(),
        area: newHostel.area.trim(),
        location: newHostel.area.trim(),
        address: newHostel.address.trim() || `${newHostel.name.trim()}, ${newHostel.area.trim()}`,
        contactName: newHostel.contactName.trim(),
        contactPhone: newHostel.contactPhone.trim(),
        rent: Number(newHostel.rent),
        securityDeposit: Number(newHostel.securityDeposit || newHostel.rent),
        otherCharges: Number(newHostel.otherCharges || 0),
        roomType: newHostel.roomType,
        genderPreference: newHostel.genderPreference,
        capacity: Number(newHostel.capacity || 2),
        totalRooms: Number(newHostel.totalRooms || 4),
        availableRooms: Number(newHostel.totalRooms || 4),
        amenities: newHostel.amenities.split(',').map((s) => s.trim()).filter(Boolean),
        rules: newHostel.rules.split(',').map((s) => s.trim()).filter(Boolean),
        description: newHostel.description.trim(),
        imageUrl: uploadedUrls[0],
        imageUrls: uploadedUrls,
      })
      setShowAdd(false)
      setNewRoomFiles([])
      await loadDbHostels()
      notify('Hostel / PG listing added successfully.')
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Listing could not be created')
    }
  }

  const addRoomUnit = async () => {
    if (!addUnitForHostelId || !unitForm.roomNumber.trim() || !unitForm.monthlyRent) return
    try {
      await api.addRoomToHostel(addUnitForHostelId, {
        roomNumber: unitForm.roomNumber.trim(),
        roomType: unitForm.roomType,
        capacity: Number(unitForm.capacity || 2),
        monthlyRent: Number(unitForm.monthlyRent),
        securityDeposit: Number(unitForm.securityDeposit || 0),
      })
      const refreshed = await api.getHostelDetail(addUnitForHostelId)
      setDetailHostel(refreshed)
      setAddUnitForHostelId(null)
      setUnitForm({ roomNumber: '', roomType: 'Double', capacity: '2', monthlyRent: '', securityDeposit: '' })
      await loadDbHostels()
      notify('Room unit added.')
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not add room unit')
    }
  }

  const toggleSaveStay = (hostel: Hostel) => {
    const isRemoving = savedStayIds.includes(hostel.id)
    const next = isRemoving ? savedStayIds.filter((x) => x !== hostel.id) : [...savedStayIds, hostel.id]
    setSavedStayIds(next)
    localStorage.setItem('studenthub.savedStays', JSON.stringify(next))
    const savedMeta: Record<string, Hostel> = JSON.parse(localStorage.getItem('studenthub.savedStaysMeta') ?? '{}')
    if (isRemoving) delete savedMeta[hostel.id]
    else savedMeta[hostel.id] = hostel
    localStorage.setItem('studenthub.savedStaysMeta', JSON.stringify(savedMeta))
    notify(isRemoving ? `${hostel.name} removed from saved listings.` : `${hostel.name} saved to your shortlist.`)
  }

  const compareSelected = async () => {
    if (selectedRooms.length < 2) return
    const numericIds = selectedRooms.filter((id) => /^\d+$/.test(id))
    const demoHostels = displayedHostels.filter((h) => selectedRooms.includes(h.id) && !/^\d+$/.test(h.id))
    const combined: RoomComparison[] = []
    if (numericIds.length > 0) {
      try {
        const res = await api.compareRooms(numericIds)
        combined.push(...res.rooms)
      } catch {
        const fallbackDb = allBaseHostels.filter((h) => numericIds.includes(h.id))
        combined.push(...computeLocalComparison(fallbackDb))
      }
    }
    if (demoHostels.length > 0) {
      combined.push(...computeLocalComparison(demoHostels))
    }
    setComparisons(combined)
  }

  const clearAllFilters = () => {
    setSearchInput('')
    setAppliedLocation('')
    setMaxRent('')
    setGender('Any')
    setRoomType('all')
    setAmenities('')
    setAvailableOnly(false)
    setSortBy('recommended')
  }

  if (loading) {
    return (
      <>
        <div className="page-header"><h1>Find Rooms &amp; Hostels</h1></div>
        <div className="content-grid">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <Skeleton><SkeletonItem size={128} /><SkeletonItem /><SkeletonItem /></Skeleton>
            </Card>
          ))}
        </div>
      </>
    )
  }

  return (
    <>
      <div className="page-header">
        <div>
          <div className="eyebrow">{displayedHostels.length} hostels and PG accommodations matching your search</div>
          <h1>Find Rooms &amp; Hostels</h1>
        </div>
        {canManage && (
          <Button appearance="primary" onClick={() => setShowAdd((v) => !v)}>
            {showAdd ? 'Close Form' : 'Add Hostel / PG'}
          </Button>
        )}
      </div>

      <Card className="room-search-banner">
        <div className="room-search-banner__row">
          <Field label="Search city, locality, or hostel name" className="room-search-banner__input">
            <Input
              value={searchInput}
              onChange={(_, d) => setSearchInput(d.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') triggerLocationSearch()
              }}
              placeholder="Try Kanpur, Varanasi, Delhi, Lucknow, Gorakhpur, Noida, Mumbai..."
            />
          </Field>
          <Field label="Sort by">
            <select
              className="native-select"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
              aria-label="Sort rooms"
            >
              <option value="recommended">Recommended</option>
              <option value="rent_asc">Rent: Low to High</option>
              <option value="rent_desc">Rent: High to Low</option>
              <option value="rating_desc">Rating: High to Low</option>
            </select>
          </Field>
          <Button appearance="primary" icon={<SearchRegular />} onClick={triggerLocationSearch}>
            Search
          </Button>
        </div>
        <div className="room-search-chips">
          <span>Popular cities:</span>
          {['Kanpur', 'Varanasi', 'Delhi', 'Lucknow', 'Gorakhpur', 'Noida', 'Mumbai'].map((city) => (
            <button
              type="button"
              key={city}
              className={`city-chip ${appliedLocation.toLowerCase() === city.toLowerCase() ? 'active' : ''}`}
              onClick={() => {
                setSearchInput(city)
                setAppliedLocation(city)
              }}
            >
              {city}
            </button>
          ))}
          {appliedLocation && (
            <button type="button" className="city-chip" onClick={clearAllFilters}>
              All Locations ×
            </button>
          )}
        </div>
      </Card>

      {generatedForCity && (
        <MessageBar intent="info">
          <MessageBarBody>
            Showing recommended sample PG &amp; hostel listings tailored for <strong>{generatedForCity}</strong>.
          </MessageBarBody>
        </MessageBar>
      )}

      {error && (
        <MessageBar intent="error">
          <MessageBarBody>{error}</MessageBarBody>
        </MessageBar>
      )}

      {detailHostel && (
        <Card className="detail-modal-card">
          <div className="detail-modal__header">
            <div>
              <div className="order-badges">
                <Badge appearance="tint" color={detailHostel.verified ? 'success' : 'informative'}>
                  {detailHostel.verified ? 'Verified Property' : 'Owner Listed'}
                </Badge>
                <Badge appearance="tint" color={detailHostel.isAvailable ? 'success' : 'danger'}>
                  {detailHostel.isAvailable ? `${detailHostel.availableRooms ?? 1} rooms available` : 'Fully Booked'}
                </Badge>
                <Badge>{detailHostel.genderPreference || 'Any'}</Badge>
              </div>
              <h2>{detailHostel.name}</h2>
              <span className="eyebrow">{detailHostel.address || detailHostel.area}</span>
            </div>
            <Button appearance="subtle" icon={<DismissRegular />} onClick={() => setDetailHostel(null)}>
              Close
            </Button>
          </div>

          <div className="detail-modal__grid">
            <div className="detail-gallery">
              <img
                className="detail-gallery__main"
                src={resolveImageUrl(detailHostel.image, FALLBACK_ROOM_IMAGE)}
                onError={handleImageError(FALLBACK_ROOM_IMAGE)}
                alt={detailHostel.name}
              />
              {detailHostel.images && detailHostel.images.length > 1 && (
                <div className="detail-gallery__thumbs">
                  {detailHostel.images.map((img, i) => (
                    <img
                      key={i}
                      src={resolveImageUrl(img, FALLBACK_ROOM_IMAGE)}
                      onError={handleImageError(FALLBACK_ROOM_IMAGE)}
                      alt={`${detailHostel.name} ${i + 1}`}
                    />
                  ))}
                </div>
              )}
              <div className="detail-rules">
                <h4>Amenities &amp; Facilities</h4>
                <div className="tag-row">
                  {(detailHostel.amenities ?? []).map((a) => <Badge key={a}>{a}</Badge>)}
                </div>
                {detailHostel.rules && detailHostel.rules.length > 0 && (
                  <>
                    <h4>Accommodation Rules</h4>
                    <ul>
                      {detailHostel.rules.map((r, i) => <li key={i}>{r}</li>)}
                    </ul>
                  </>
                )}
              </div>
            </div>

            <div className="detail-info">
              <div className="detail-price">₹{detailHostel.rent.toLocaleString('en-IN')} / month</div>
              <p>{detailHostel.description}</p>
              <div className="detail-meta-list">
                <div><span>Location</span><strong>{detailHostel.location || detailHostel.area}</strong></div>
                <div><span>Security Deposit</span><strong>₹{(detailHostel.securityDeposit ?? detailHostel.rent).toLocaleString('en-IN')}</strong></div>
                <div><span>Other Charges</span><strong>₹{(detailHostel.otherCharges ?? 0).toLocaleString('en-IN')}</strong></div>
                <div><span>Contact</span><strong>{detailHostel.contactName || 'Desk'} ({detailHostel.contactPhone || 'In-app'})</strong></div>
                <div><span>Occupancy</span><strong>{detailHostel.occupied ?? 0} / {detailHostel.capacity ?? 2} beds filled</strong></div>
              </div>

              {detailHostel.rooms && detailHostel.rooms.length > 0 && (
                <div className="room-units-box">
                  <div className="section-heading">
                    <h4>Available Room Units</h4>
                    {canManage && !detailHostel.id.startsWith('demo-') && (detailHostel.ownerId === user?.id || user?.role === 'admin') && (
                      <Button size="small" onClick={() => setAddUnitForHostelId(detailHostel.id)}>+ Add Room Unit</Button>
                    )}
                  </div>
                  <div className="room-units-list">
                    {detailHostel.rooms.map((rm) => (
                      <label key={rm.id} className={`room-unit-option ${selectedRoomId === rm.id ? 'selected' : ''}`}>
                        <input
                          type="radio"
                          name="selectedRoomUnit"
                          checked={selectedRoomId === rm.id}
                          onChange={() => setSelectedRoomId(rm.id)}
                          disabled={!rm.isAvailable}
                        />
                        <div>
                          <strong>Room {rm.roomNumber} · {rm.roomType}</strong>
                          <small>
                            Occupancy: {rm.occupied}/{rm.capacity} · ₹{rm.monthlyRent.toLocaleString('en-IN')}/mo · Deposit ₹{rm.securityDeposit.toLocaleString('en-IN')}
                          </small>
                        </div>
                        <Badge appearance="tint" color={rm.isAvailable ? 'success' : 'danger'}>
                          {rm.isAvailable ? `${rm.spotsLeft} left` : 'Full'}
                        </Badge>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {addUnitForHostelId === detailHostel.id && canManage && (
                <Card className="owner-publish-form">
                  <h4>Add Room Unit</h4>
                  <div className="form-grid">
                    <Field label="Room No."><Input value={unitForm.roomNumber} onChange={(_, d) => setUnitForm({ ...unitForm, roomNumber: d.value })} placeholder="201" /></Field>
                    <Field label="Type"><Input value={unitForm.roomType} onChange={(_, d) => setUnitForm({ ...unitForm, roomType: d.value })} /></Field>
                    <Field label="Capacity"><Input type="number" value={unitForm.capacity} onChange={(_, d) => setUnitForm({ ...unitForm, capacity: d.value })} /></Field>
                    <Field label="Monthly Rent"><Input type="number" value={unitForm.monthlyRent} onChange={(_, d) => setUnitForm({ ...unitForm, monthlyRent: d.value })} /></Field>
                    <Field label="Deposit"><Input type="number" value={unitForm.securityDeposit} onChange={(_, d) => setUnitForm({ ...unitForm, securityDeposit: d.value })} /></Field>
                  </div>
                  <div className="form-actions">
                    <Button appearance="primary" onClick={() => void addRoomUnit()}>Save Unit</Button>
                    <Button appearance="subtle" onClick={() => setAddUnitForHostelId(null)}>Cancel</Button>
                  </div>
                </Card>
              )}

              {isStudent && (
                <div className="booking-box" ref={bookingSectionRef}>
                  <h4>Book This Room</h4>
                  <div className="booking-inputs-grid">
                    <Field label="Check-in Date">
                      <Input type="date" value={checkInDate} onChange={(_, d) => setCheckInDate(d.value)} />
                    </Field>
                    <Field label="Duration (Months)">
                      <Input type="number" min={1} max={36} value={durationMonths} onChange={(_, d) => setDurationMonths(d.value)} />
                    </Field>
                  </div>
                  <Field label="Notes for Owner">
                    <Input value={bookingNotes} onChange={(_, d) => setBookingNotes(d.value)} placeholder="Preferred floor, arrival time..." />
                  </Field>
                  <div className="booking-box__actions">
                    <Button appearance="secondary" onClick={() => void runAvailabilityCheck()}>
                      Check Availability
                    </Button>
                    <Button appearance="primary" disabled={bookingBusy || !detailHostel.isAvailable} onClick={() => void submitBooking()}>
                      {bookingBusy ? 'Submitting…' : 'Submit Booking'}
                    </Button>
                  </div>

                  {availabilityResult && (
                    <MessageBar intent={availabilityResult.available ? 'success' : 'warning'}>
                      <MessageBarBody>
                        {availabilityResult.available
                          ? `Available until ${availabilityResult.checkOutDate}. Estimated total: ₹${(availabilityResult.rooms[0]?.totalAmount ?? 0).toLocaleString('en-IN')}`
                          : 'No rooms available for the selected dates.'}
                      </MessageBarBody>
                    </MessageBar>
                  )}

                  {createdBooking && (
                    <Card className="booking-confirmation-box">
                      <div className="booking-confirmation-box__top">
                        <strong>Booking {createdBooking.bookingCode}</strong>
                        <Badge appearance="tint" color={createdBooking.status === 'Paid' ? 'success' : 'warning'}>
                          {createdBooking.status}
                        </Badge>
                      </div>
                      <p>
                        Check-in: {createdBooking.checkInDate} → {createdBooking.checkOutDate} ({createdBooking.durationMonths} mo)
                      </p>
                      <div className="summary-lines">
                        <div><span>Rent ({createdBooking.durationMonths} mo)</span><strong>₹{(createdBooking.monthlyRent * createdBooking.durationMonths).toLocaleString('en-IN')}</strong></div>
                        <div><span>Security Deposit</span><strong>₹{createdBooking.securityDeposit.toLocaleString('en-IN')}</strong></div>
                        <div><span>Other Charges</span><strong>₹{createdBooking.otherCharges.toLocaleString('en-IN')}</strong></div>
                        <div className="summary-total"><span>Total Payable</span><strong>₹{createdBooking.totalAmount.toLocaleString('en-IN')}</strong></div>
                      </div>
                      {(createdBooking.status === 'Confirmed' || createdBooking.status === 'Payment Pending') && (
                        <Button appearance="primary" disabled={bookingBusy} onClick={() => void payForBooking(createdBooking)}>
                          {bookingBusy ? 'Processing…' : `Pay ₹${createdBooking.totalAmount.toLocaleString('en-IN')} Now`}
                        </Button>
                      )}
                      {createdBooking.status === 'Pending' && (
                        <small>Your request has been sent to the property owner. Payment unlocks once confirmed.</small>
                      )}
                    </Card>
                  )}

                  {paymentOutcome && (
                    <MessageBar intent={paymentOutcome.status === 'paid' ? 'success' : paymentOutcome.status === 'pending_config' ? 'warning' : 'error'}>
                      <MessageBarBody>
                        {paymentOutcome.message}
                        {paymentOutcome.requiredEnv?.length ? ` (Required env: ${paymentOutcome.requiredEnv.join(', ')})` : ''}
                      </MessageBarBody>
                    </MessageBar>
                  )}
                </div>
              )}
            </div>
          </div>
        </Card>
      )}

      <div className="split-layout">
        <Card className="filters">
          <h3>Filters</h3>
          <Field label="Location / City">
            <Input
              value={searchInput}
              onChange={(_, d) => setSearchInput(d.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') triggerLocationSearch()
              }}
              placeholder="Kanpur, Varanasi, Delhi..."
            />
          </Field>
          <Button appearance="primary" onClick={triggerLocationSearch}>Apply Location</Button>
          <Field label="Max Monthly Rent (₹)"><Input type="number" value={maxRent} onChange={(_, d) => setMaxRent(d.value)} placeholder="12000" /></Field>
          <Field label="Gender Preference">
            <select className="native-select" value={gender} onChange={(e) => setGender(e.target.value)}>
              <option value="Any">Any</option>
              <option value="Boys">Boys</option>
              <option value="Girls">Girls</option>
            </select>
          </Field>
          <Field label="Room Type">
            <select className="native-select" value={roomType} onChange={(e) => setRoomType(e.target.value)}>
              <option value="all">All types</option>
              <option value="Single">Single</option>
              <option value="Double Sharing">Double Sharing</option>
              <option value="Triple Sharing">Triple Sharing</option>
            </select>
          </Field>
          <Field label="Amenities"><Textarea value={amenities} onChange={(_, d) => setAmenities(d.value)} placeholder="Wi-Fi, Food, Laundry, Parking, Security" /></Field>
          <label className="checkbox-row">
            <input type="checkbox" checked={availableOnly} onChange={(e) => setAvailableOnly(e.target.checked)} />
            <span>Available rooms only</span>
          </label>
          <Button appearance="subtle" onClick={clearAllFilters}>
            Clear filters
          </Button>
        </Card>

        <div>
          {selectedRooms.length >= 2 && (
            <div style={{ marginBottom: 12 }}>
              <Button appearance="primary" onClick={() => void compareSelected()}>
                Compare {selectedRooms.length} rooms
              </Button>
            </div>
          )}

          {comparisons.length >= 2 && (
            <Card className="comparison-card" style={{ marginBottom: 16 }}>
              <div className="section-heading">
                <h3>Room Comparison</h3>
                <Button size="small" appearance="subtle" onClick={() => setComparisons([])}>Clear comparison</Button>
              </div>
              <table>
                <thead><tr><th>Room</th><th>Price</th><th>Safety</th><th>Value</th><th>Amenities</th></tr></thead>
                <tbody>
                  {comparisons.map((room) => (
                    <tr key={room.id}>
                      <td><strong>{room.name}</strong><br />{room.area}</td>
                      <td>₹{room.rent.toLocaleString('en-IN')}/mo</td>
                      <td>{room.safetyScore}/100</td>
                      <td>{room.valueScore}/100</td>
                      <td>{room.amenities.join(' · ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}

          {showAdd && canManage && (
            <Card className="add-room owner-publish-form">
              <h3>Add Hostel / PG Listing</h3>
              <div className="form-grid">
                <Field label="Property name"><Input value={newHostel.name} onChange={(_, d) => setNewHostel({ ...newHostel, name: d.value })} /></Field>
                <Field label="Area / Location"><Input value={newHostel.area} onChange={(_, d) => setNewHostel({ ...newHostel, area: d.value })} /></Field>
                <Field label="Full address"><Input value={newHostel.address} onChange={(_, d) => setNewHostel({ ...newHostel, address: d.value })} /></Field>
                <Field label="Monthly rent (₹)"><Input type="number" value={newHostel.rent} onChange={(_, d) => setNewHostel({ ...newHostel, rent: d.value })} /></Field>
                <Field label="Security deposit (₹)"><Input type="number" value={newHostel.securityDeposit} onChange={(_, d) => setNewHostel({ ...newHostel, securityDeposit: d.value })} /></Field>
                <Field label="Other charges (₹)"><Input type="number" value={newHostel.otherCharges} onChange={(_, d) => setNewHostel({ ...newHostel, otherCharges: d.value })} /></Field>
                <Field label="Room type">
                  <select className="native-select" value={newHostel.roomType} onChange={(e) => setNewHostel({ ...newHostel, roomType: e.target.value })}>
                    <option value="Single">Single</option>
                    <option value="Double Sharing">Double Sharing</option>
                    <option value="Triple Sharing">Triple Sharing</option>
                  </select>
                </Field>
                <Field label="Gender preference">
                  <select className="native-select" value={newHostel.genderPreference} onChange={(e) => setNewHostel({ ...newHostel, genderPreference: e.target.value })}>
                    <option value="Any">Any</option>
                    <option value="Boys">Boys</option>
                    <option value="Girls">Girls</option>
                  </select>
                </Field>
                <Field label="Room capacity"><Input type="number" value={newHostel.capacity} onChange={(_, d) => setNewHostel({ ...newHostel, capacity: d.value })} /></Field>
                <Field label="Contact name"><Input value={newHostel.contactName} onChange={(_, d) => setNewHostel({ ...newHostel, contactName: d.value })} /></Field>
                <Field label="Contact phone"><Input value={newHostel.contactPhone} onChange={(_, d) => setNewHostel({ ...newHostel, contactPhone: d.value })} /></Field>
                <Field label="Amenities (comma-separated)"><Input value={newHostel.amenities} onChange={(_, d) => setNewHostel({ ...newHostel, amenities: d.value })} /></Field>
                <Field label="House rules (comma-separated)"><Input value={newHostel.rules} onChange={(_, d) => setNewHostel({ ...newHostel, rules: d.value })} /></Field>
                <Field label="Image URL"><Input value={newHostel.imageUrl} onChange={(_, d) => setNewHostel({ ...newHostel, imageUrl: d.value })} /></Field>
                <Field label="Upload room photos"><input className="native-file" type="file" accept="image/*" multiple onChange={(e) => setNewRoomFiles(Array.from(e.target.files ?? []))} /></Field>
              </div>
              <Field label="Description"><Textarea value={newHostel.description} onChange={(_, d) => setNewHostel({ ...newHostel, description: d.value })} /></Field>
              {addError && <MessageBar intent="error"><MessageBarBody>{addError}</MessageBarBody></MessageBar>}
              <div className="form-actions">
                <Button appearance="primary" onClick={() => void addHostel()} disabled={!newHostel.name || !newHostel.area || !newHostel.rent}>
                  Publish Property
                </Button>
                <Button appearance="subtle" onClick={() => setShowAdd(false)}>Cancel</Button>
              </div>
            </Card>
          )}

          {displayedHostels.length === 0 ? (
            <Card className="empty-state">
              <h3>No hostels match your active filters</h3>
              <p>Try increasing your max budget, changing room type, or clearing amenity filters.</p>
              <Button appearance="primary" onClick={clearAllFilters}>Reset Filters</Button>
            </Card>
          ) : (
            <div className="content-grid">
              {displayedHostels.map((hostel) => (
                <Card key={hostel.id}>
                  <CardPreview>
                    <img
                      className="card-image"
                      src={resolveImageUrl(hostel.image, FALLBACK_ROOM_IMAGE)}
                      onError={handleImageError(FALLBACK_ROOM_IMAGE)}
                      alt={hostel.name}
                    />
                  </CardPreview>
                  <CardHeader
                    header={<strong>{hostel.name}</strong>}
                    action={
                      <Badge appearance="tint" color={hostel.isAvailable ? 'success' : 'danger'}>
                        {hostel.isAvailable ? `${hostel.availableRooms ?? 1} open` : 'Full'}
                      </Badge>
                    }
                  />
                  <div className="card-copy">
                    <p>{hostel.address || hostel.location || hostel.area}</p>
                    <span>{hostel.roomType || 'Shared'} · {hostel.genderPreference || 'Any'}</span>
                    <strong>₹{hostel.rent.toLocaleString('en-IN')}/month</strong>
                    <span>Deposit ₹{(hostel.securityDeposit ?? hostel.rent).toLocaleString('en-IN')} · ★ {hostel.rating}</span>
                    <span>{hostel.amenities?.join(' · ')}</span>
                  </div>
                  <CardFooter>
                    <Button appearance="secondary" onClick={() => void openDetail(hostel, false)}>
                      View Details
                    </Button>
                    <Button appearance="primary" onClick={() => void openDetail(hostel, true)}>
                      Book Now
                    </Button>
                    <Button
                      appearance={selectedRooms.includes(hostel.id) ? 'primary' : 'secondary'}
                      onClick={() =>
                        setSelectedRooms((cur) => (cur.includes(hostel.id) ? cur.filter((id) => id !== hostel.id) : [...cur, hostel.id]))
                      }
                    >
                      {selectedRooms.includes(hostel.id) ? 'Selected' : 'Compare'}
                    </Button>
                    <Button
                      icon={<BookmarkRegular />}
                      aria-label="Save stay"
                      appearance={savedStayIds.includes(hostel.id) ? 'primary' : 'secondary'}
                      onClick={() => toggleSaveStay(hostel)}
                    />
                  </CardFooter>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
