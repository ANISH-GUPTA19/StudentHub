import { useCallback, useEffect, useState } from 'react'
import {
  Avatar,
  Badge,
  Button,
  Card,
  Field,
  Input,
  MessageBar,
  MessageBarBody,
} from '@fluentui/react-components'
import { BuildingRegular } from '@fluentui/react-icons'
import { api } from '../api'
import { DEMO_HOSTELS } from '../data/demoRooms'
import type {
  AdminStats,
  Hostel,
  PaymentConfig,
  PaymentRecord,
  Product,
  RoomBooking,
  SellerOrderItem,
  User,
} from '../types/entities'
import { runRazorpayFlow, type GatewayOutcome } from '../utils/razorpay'

const notify = (detail: string) => window.dispatchEvent(new CustomEvent('studenthub-thank', { detail }))

export function BookingsPage({ user, navigate }: { user: User | null; navigate: (path: string) => void }) {
  const [bookings, setBookings] = useState<RoomBooking[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [outcome, setOutcome] = useState<GatewayOutcome | null>(null)

  const load = useCallback(async () => {
    const demoBookings: RoomBooking[] = JSON.parse(localStorage.getItem('studenthub.demoBookings') ?? '[]')
    try {
      const serverBookings = await api.listMyRoomBookings()
      setBookings([...demoBookings, ...serverBookings])
    } catch {
      setBookings(demoBookings)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const handlePay = async (booking: RoomBooking) => {
    if (booking.id.startsWith('demo-bk-')) {
      setOutcome({
        status: 'pending_config',
        paymentId: booking.bookingCode,
        message: 'Demo room booking is in Payment Pending status. Configure Razorpay keys or book a verified DB property for live checkout.',
        requiredEnv: ['RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET', 'RAZORPAY_WEBHOOK_SECRET'],
      })
      return
    }
    setBusyId(booking.id)
    setOutcome(null)
    try {
      const order = await api.createPaymentOrder({ paymentType: 'booking', referenceId: Number(booking.id) })
      const res = await runRazorpayFlow(order, user, `Booking ${booking.bookingCode}`)
      setOutcome(res)
      await load()
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Unable to start payment')
    } finally {
      setBusyId(null)
    }
  }

  const handleCancel = async (bookingId: string) => {
    if (bookingId.startsWith('demo-bk-')) {
      const demoBookings: RoomBooking[] = JSON.parse(localStorage.getItem('studenthub.demoBookings') ?? '[]')
      const updated = demoBookings.map((b) =>
        b.id === bookingId ? { ...b, status: 'Cancelled', cancellationReason: 'Cancelled by student' } : b,
      )
      localStorage.setItem('studenthub.demoBookings', JSON.stringify(updated))
      notify('Booking cancelled.')
      await load()
      return
    }
    try {
      await api.cancelRoomBooking(bookingId, 'Cancelled by student')
      notify('Booking cancelled.')
      await load()
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Booking could not be cancelled')
    }
  }

  return (
    <>
      <div className="page-header">
        <div>
          <div className="eyebrow">Stay and room booking history</div>
          <h1>My Bookings</h1>
        </div>
        <Button appearance="primary" onClick={() => navigate('/hostels')}>Browse Rooms</Button>
      </div>

      {outcome && (
        <MessageBar intent={outcome.status === 'paid' ? 'success' : outcome.status === 'pending_config' ? 'warning' : 'error'}>
          <MessageBarBody>
            {outcome.message}
            {outcome.requiredEnv?.length ? ` (Configure: ${outcome.requiredEnv.join(', ')})` : ''}
          </MessageBarBody>
        </MessageBar>
      )}

      {loading ? (
        <Card className="table-card"><p>Loading bookings…</p></Card>
      ) : bookings.length === 0 ? (
        <Card className="utility-feature">
          <h2>No room bookings yet</h2>
          <p>Select a hostel or PG room to check availability, submit a booking, and complete payment.</p>
          <Button appearance="primary" onClick={() => navigate('/hostels')}>Find Rooms</Button>
        </Card>
      ) : (
        <div className="orders-list">
          {bookings.map((b) => (
            <Card key={b.id} className="order-history-card">
              <div className="order-history-card__top">
                <div>
                  <strong>{b.bookingCode} · {b.hostelName}</strong>
                  <span className="eyebrow">
                    Room {b.roomNumber} ({b.roomType}) · {b.hostelArea} · Check-in {b.checkInDate} → {b.checkOutDate} ({b.durationMonths} mo)
                  </span>
                </div>
                <Badge
                  appearance="tint"
                  color={b.status === 'Paid' ? 'success' : b.status === 'Cancelled' || b.status === 'Rejected' ? 'danger' : 'warning'}
                >
                  {b.status}
                </Badge>
              </div>
              <div className="summary-lines">
                <div><span>Monthly Rent × {b.durationMonths}</span><strong>₹{(b.monthlyRent * b.durationMonths).toLocaleString('en-IN')}</strong></div>
                <div><span>Security Deposit</span><strong>₹{b.securityDeposit.toLocaleString('en-IN')}</strong></div>
                <div><span>Other Charges</span><strong>₹{b.otherCharges.toLocaleString('en-IN')}</strong></div>
                <div className="summary-total"><span>Total Payable</span><strong>₹{b.totalAmount.toLocaleString('en-IN')}</strong></div>
              </div>
              {b.cancellationReason && <small>Reason: {b.cancellationReason}</small>}
              <div className="order-history-card__bottom">
                <small>{b.payment?.gatewayPaymentId ? `Transaction: ${b.payment.gatewayPaymentId}` : 'Awaiting verified payment'}</small>
                <div className="order-actions">
                  {(b.status === 'Confirmed' || b.status === 'Payment Pending') && (
                    <Button appearance="primary" disabled={busyId === b.id} onClick={() => void handlePay(b)}>
                      {busyId === b.id ? 'Processing…' : `Pay ₹${b.totalAmount.toLocaleString('en-IN')}`}
                    </Button>
                  )}
                  {['Pending', 'Confirmed', 'Payment Pending', 'Paid'].includes(b.status) && (
                    <Button appearance="subtle" onClick={() => void handleCancel(b.id)}>Cancel Booking</Button>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  )
}

export function PaymentsPage({ navigate }: { navigate: (path: string) => void }) {
  const [payments, setPayments] = useState<PaymentRecord[]>([])
  const [config, setConfig] = useState<PaymentConfig | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    void Promise.all([api.listPayments(), api.getPaymentConfig()])
      .then(([rows, cfg]) => {
        setPayments(rows)
        setConfig(cfg)
      })
      .finally(() => setLoading(false))
  }, [])

  return (
    <>
      <div className="page-header">
        <div>
          <div className="eyebrow">Transaction records and gateway status</div>
          <h1>Payments</h1>
        </div>
        <div className="header-actions-row">
          <Button appearance="secondary" onClick={() => navigate('/bookings')}>Room Bookings</Button>
          <Button appearance="primary" onClick={() => navigate('/marketplace')}>Marketplace Orders</Button>
        </div>
      </div>

      {config && (
        <MessageBar intent={config.configured ? 'success' : 'warning'}>
          <MessageBarBody>
            <strong>Gateway ({config.gateway.toUpperCase()}):</strong>{' '}
            {config.configured
              ? `Configured in ${config.mode} mode.`
              : `${config.instructions} Required: ${config.requiredEnv.join(', ')}.`}
          </MessageBarBody>
        </MessageBar>
      )}

      <Card className="table-card">
        {loading ? (
          <p>Loading payment history…</p>
        ) : payments.length === 0 ? (
          <div className="empty-state">
            <h3>No transactions recorded yet</h3>
            <p>Payments for room bookings, marketplace orders, and mess plans appear here.</p>
          </div>
        ) : (
          <table>
            <thead>
              <tr><th>Purpose</th><th>Amount</th><th>Method / Gateway</th><th>Gateway IDs</th><th>Status</th></tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id}>
                  <td><strong>{p.purpose}</strong><br /><small>{p.failureReason || p.createdAt?.slice(0, 10) || ''}</small></td>
                  <td>₹{p.amount.toLocaleString('en-IN')}</td>
                  <td>{p.gateway ?? p.method}</td>
                  <td><small>{p.gatewayOrderId || '—'}</small><br /><small>{p.gatewayPaymentId || ''}</small></td>
                  <td>
                    <Badge
                      appearance="tint"
                      color={p.status === 'paid' || p.status === 'completed' ? 'success' : p.status === 'failed' || p.status === 'cancelled' ? 'danger' : 'warning'}
                    >
                      {p.status}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </>
  )
}

export function SavedListingsPage({ navigate }: { navigate: (path: string) => void }) {
  const [savedStayIds] = useState<string[]>(() => JSON.parse(localStorage.getItem('studenthub.savedStays') ?? '[]'))
  const [savedListingIds] = useState<string[]>(() => JSON.parse(localStorage.getItem('studenthub.savedListings') ?? '[]'))
  const [hostels, setHostels] = useState<Hostel[]>([])
  const [products, setProducts] = useState<Product[]>([])

  useEffect(() => {
    const savedMeta: Record<string, Hostel> = JSON.parse(localStorage.getItem('studenthub.savedStaysMeta') ?? '{}')
    void api
      .listHostels()
      .then((list) => {
        const combined = [...list, ...DEMO_HOSTELS, ...Object.values(savedMeta)]
        const unique = new Map<string, Hostel>()
        combined.forEach((h) => {
          if (savedStayIds.includes(h.id) && !unique.has(h.id)) unique.set(h.id, h)
        })
        setHostels(Array.from(unique.values()))
      })
      .catch(() => {
        const fallback = [...DEMO_HOSTELS, ...Object.values(savedMeta)].filter((h) => savedStayIds.includes(h.id))
        setHostels(fallback)
      })
    void api.listProducts().then((list) => setProducts(list.filter((p) => savedListingIds.includes(p.id)))).catch(() => undefined)
  }, [savedStayIds, savedListingIds])

  return (
    <>
      <div className="page-header">
        <div>
          <div className="eyebrow">Your saved rooms and marketplace items</div>
          <h1>Saved Listings</h1>
        </div>
      </div>
      <div className="saved-grid">
        <Card className="table-card">
          <div className="section-heading"><h2>Saved Rooms ({hostels.length})</h2><Button size="small" onClick={() => navigate('/hostels')}>Find Rooms</Button></div>
          {hostels.length === 0 ? <p>No saved rooms yet. Click the bookmark button on any hostel card.</p> : hostels.map((h) => (
            <div className="history-row" key={h.id}>
              <div><strong>{h.name}</strong><span>{h.area}</span></div>
              <b>₹{h.rent.toLocaleString('en-IN')}/mo</b>
            </div>
          ))}
        </Card>
        <Card className="table-card">
          <div className="section-heading"><h2>Saved Essentials ({products.length})</h2><Button size="small" onClick={() => navigate('/marketplace')}>Marketplace</Button></div>
          {products.length === 0 ? <p>No saved products yet. Click the bookmark button on any product card.</p> : products.map((p) => (
            <div className="history-row" key={p.id}>
              <div><strong>{p.title}</strong><span>{p.location}</span></div>
              <b>₹{p.price.toLocaleString('en-IN')}</b>
            </div>
          ))}
        </Card>
      </div>
    </>
  )
}

export function ProfilePage({ user, onUpdated }: { user: User | null; onUpdated: (u: User) => void }) {
  const [name, setName] = useState(user?.name ?? '')
  const [phone, setPhone] = useState(user?.phone ?? '')
  const [course, setCourse] = useState(user?.course ?? '')
  const [busy, setBusy] = useState(false)

  const save = async () => {
    setBusy(true)
    try {
      const updated = await api.updateProfile({ name, phone, course })
      onUpdated(updated)
      notify('Profile updated.')
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Profile could not be updated')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="page-header">
        <div>
          <div className="eyebrow">Account details and preferences</div>
          <h1>Profile</h1>
        </div>
      </div>
      <Card className="utility-feature">
        <div className="person-row">
          <Avatar name={user?.name ?? 'User'} size={48} />
          <div>
            <strong>{user?.email}</strong>
            <div className="profile-role-row">
              <span>Role:</span>
              <Badge appearance="tint" color="informative">{user?.role}</Badge>
            </div>
          </div>
        </div>
        <Field label="Full Name"><Input value={name} onChange={(_, d) => setName(d.value)} /></Field>
        <Field label="Phone"><Input value={phone} onChange={(_, d) => setPhone(d.value)} placeholder="+91 98765 43210" /></Field>
        <Field label="Course / Department"><Input value={course} onChange={(_, d) => setCourse(d.value)} placeholder="B.Tech CSE" /></Field>
        <Button appearance="primary" disabled={busy || name.trim().length < 2} onClick={() => void save()}>
          {busy ? 'Saving…' : 'Save Profile'}
        </Button>
      </Card>
    </>
  )
}

export function OwnerDashboard({ user, navigate }: { user: User | null; navigate: (path: string) => void }) {
  type OwnerRequest = { id: string; studentId: string; targetName: string; moveIn: string; duration: string; status: 'Pending' | 'Approved' | 'Declined' }
  const [requests, setRequests] = useState<OwnerRequest[]>([])
  const [roomBookings, setRoomBookings] = useState<RoomBooking[]>([])
  const [sellerOrders, setSellerOrders] = useState<SellerOrderItem[]>([])
  const [listingsCount, setListingsCount] = useState(0)
  const [payments, setPayments] = useState<{ purpose: string; amount: number; status: string }[]>([])

  const role = user?.role

  const load = useCallback(async () => {
    try {
      const data = await api.getOwnerDashboard()
      setRequests(
        data.requests.map((r) => ({
          id: r.id,
          studentId: r.studentId,
          targetName: r.targetName,
          moveIn: r.moveIn,
          duration: r.duration,
          status: r.status === 'Approved' ? 'Approved' : r.status === 'Declined' ? 'Declined' : 'Pending',
        })),
      )
      setPayments(data.payments)
      setListingsCount(
        role === 'mess_owner' ? data.messListings.length : role === 'seller' ? data.marketListings.length : data.roomListings.length,
      )
      if (role === 'hostel_owner' || role === 'admin') {
        setRoomBookings(await api.listOwnerRoomBookings())
      }
      if (role === 'seller' || role === 'admin') {
        const res = await api.listSellerOrders()
        setSellerOrders(res.orders)
      }
    } catch {
      setRequests([])
      setPayments([])
    }
  }, [role])

  useEffect(() => {
    void load()
  }, [load])

  if (!user || role === 'student') {
    return (
      <Card className="owner-locked">
        <div className="owner-locked__icon"><BuildingRegular /></div>
        <h2>Owner access required</h2>
        <p>This workspace is available only to room owners, mess owners, sellers, and administrators.</p>
      </Card>
    )
  }

  const completedValue = payments.filter((p) => p.status === 'completed').reduce((sum, p) => sum + p.amount, 0)
  const pendingRoomCount = roomBookings.filter((b) => b.status === 'Pending').length
  const pendingOrderCount = sellerOrders.filter((o) => o.sellerStatus === 'pending').length

  return (
    <div className="owner-dashboard">
      <div className="owner-dashboard__header">
        <div>
          <span className="eyebrow">
            {role === 'mess_owner' ? 'Mess owner workspace' : role === 'seller' ? 'Seller workspace' : role === 'admin' ? 'Administrator workspace' : 'Room owner workspace'}
          </span>
          <h1>
            {role === 'mess_owner' ? 'Mess business overview' : role === 'seller' ? 'Marketplace seller overview' : 'Owner & Operations Hub'}
          </h1>
          <p>Manage listings, room bookings, marketplace orders, and payment activity in one place.</p>
        </div>
        <Button
          appearance="primary"
          icon={<BuildingRegular />}
          onClick={() => navigate(role === 'mess_owner' ? '/mess' : role === 'seller' ? '/marketplace' : '/hostels')}
        >
          Manage Listings
        </Button>
      </div>

      <section className="owner-stat-grid">
        <Card><span>Active Listings</span><strong>{listingsCount}</strong><small>Published in StudentHub</small></Card>
        <Card><span>Pending Bookings</span><strong>{pendingRoomCount}</strong><small>Room requests</small></Card>
        <Card><span>Pending Orders</span><strong>{pendingOrderCount}</strong><small>Seller fulfillment</small></Card>
        <Card><span>Verified Collected</span><strong>₹{completedValue.toLocaleString('en-IN')}</strong><small>Completed payments</small></Card>
      </section>

      {(role === 'hostel_owner' || role === 'admin') && (
        <section className="owner-request-panel">
          <div className="section-heading">
            <div><span className="eyebrow">Hostel &amp; PG bookings</span><h2>Room Booking Requests</h2></div>
            <Badge appearance="tint" color="warning">{pendingRoomCount} pending</Badge>
          </div>
          {roomBookings.length === 0 ? (
            <p className="eyebrow">No room bookings yet.</p>
          ) : (
            <div className="owner-request-list">
              {roomBookings.map((b) => (
                <article className="owner-request-row" key={b.id}>
                  <Avatar name={b.studentName} />
                  <div className="owner-request__student">
                    <strong>{b.studentName} · {b.bookingCode}</strong>
                    <span>{b.hostelName} (Room {b.roomNumber})</span>
                  </div>
                  <div><span>Check-in</span><strong>{b.checkInDate}</strong></div>
                  <div><span>Total ({b.durationMonths} mo)</span><strong>₹{b.totalAmount.toLocaleString('en-IN')}</strong></div>
                  <Badge appearance="tint" color={b.status === 'Paid' ? 'success' : b.status === 'Rejected' || b.status === 'Cancelled' ? 'danger' : 'warning'}>
                    {b.status}
                  </Badge>
                  <div className="owner-request__actions">
                    {b.status === 'Pending' && (
                      <>
                        <Button size="small" appearance="primary" onClick={() => void api.updateOwnerRoomBooking(b.id, 'Payment Pending').then(load).catch((e) => notify(e.message))}>
                          Approve
                        </Button>
                        <Button size="small" appearance="subtle" onClick={() => void api.updateOwnerRoomBooking(b.id, 'Rejected', 'Declined by owner').then(load)}>
                          Reject
                        </Button>
                      </>
                    )}
                    {b.status === 'Confirmed' && (
                      <Button size="small" appearance="primary" onClick={() => void api.updateOwnerRoomBooking(b.id, 'Payment Pending').then(load)}>
                        Request Pay
                      </Button>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      {(role === 'seller' || role === 'admin') && (
        <section className="owner-request-panel">
          <div className="section-heading">
            <div><span className="eyebrow">Marketplace fulfillment</span><h2>Incoming Product Orders</h2></div>
            <Button size="small" onClick={() => navigate('/marketplace')}>Open Seller Hub</Button>
          </div>
          {sellerOrders.length === 0 ? (
            <p className="eyebrow">No product orders yet.</p>
          ) : (
            <div className="owner-request-list">
              {sellerOrders.slice(0, 10).map((item) => (
                <article className="owner-request-row" key={item.id}>
                  <Avatar name={item.deliveryName} />
                  <div className="owner-request__student">
                    <strong>{item.orderNumber} · {item.productTitle} (×{item.quantity})</strong>
                    <span>{item.deliveryName} · {item.deliveryAddress}</span>
                  </div>
                  <div><span>Payment</span><strong>{item.paymentStatus}</strong></div>
                  <div><span>Amount</span><strong>₹{item.lineTotal.toLocaleString('en-IN')}</strong></div>
                  <Badge appearance="tint" color={item.sellerStatus === 'delivered' ? 'success' : 'warning'}>{item.sellerStatus}</Badge>
                  <div className="owner-request__actions">
                    {item.sellerStatus === 'pending' && (
                      <>
                        <Button size="small" appearance="primary" onClick={() => void api.updateSellerOrderStatus(item.id, 'accepted').then(load).catch((e) => notify(e.message))}>Accept</Button>
                        <Button size="small" appearance="subtle" onClick={() => void api.updateSellerOrderStatus(item.id, 'rejected').then(load)}>Reject</Button>
                      </>
                    )}
                    {item.sellerStatus === 'accepted' && (
                      <Button size="small" appearance="primary" onClick={() => void api.updateSellerOrderStatus(item.id, 'shipped').then(load)}>Ship</Button>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      {requests.length > 0 && (
        <section className="owner-request-panel">
          <div className="section-heading"><div><span className="eyebrow">Service requests</span><h2>Mess &amp; General Requests</h2></div></div>
          <div className="owner-request-list">
            {requests.map((r) => (
              <article className="owner-request-row" key={r.id}>
                <Avatar name={`Student ${r.studentId}`} />
                <div className="owner-request__student"><strong>Student #{r.studentId}</strong><span>{r.targetName}</span></div>
                <div><span>Move-in</span><strong>{r.moveIn || '—'}</strong></div>
                <div><span>Duration</span><strong>{r.duration || '—'}</strong></div>
                <Badge appearance="tint" color={r.status === 'Approved' ? 'success' : r.status === 'Declined' ? 'danger' : 'warning'}>{r.status}</Badge>
                <div className="owner-request__actions">
                  {r.status === 'Pending' ? (
                    <>
                      <Button size="small" appearance="primary" onClick={() => void api.updateOwnerRequest(r.id, 'approved').then(load)}>Approve</Button>
                      <Button size="small" appearance="subtle" onClick={() => void api.updateOwnerRequest(r.id, 'declined').then(load)}>Decline</Button>
                    </>
                  ) : (
                    <Button size="small" appearance="subtle" onClick={() => void api.updateOwnerRequest(r.id, 'pending').then(load)}>Reset</Button>
                  )}
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      <section className="owner-payment-panel">
        <div className="section-heading">
          <div><span className="eyebrow">Payment activity</span><h2>Payment History</h2></div>
          <div className="owner-payment-summary"><span>Collected</span><strong>₹{completedValue.toLocaleString('en-IN')}</strong></div>
        </div>
        {payments.length ? (
          <div className="owner-payment-list">
            {payments.map((p, idx) => (
              <article key={`${p.purpose}-${idx}`}>
                <div><strong>{p.purpose}</strong><span>StudentHub transaction</span></div>
                <strong>₹{p.amount.toLocaleString('en-IN')}</strong>
                <Badge appearance="tint" color={p.status === 'completed' ? 'success' : 'warning'}>{p.status}</Badge>
              </article>
            ))}
          </div>
        ) : (
          <Card className="owner-empty-payments">No payment activity yet.</Card>
        )}
      </section>
    </div>
  )
}

export function AdminDashboard({ user }: { user: User | null }) {
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [users, setUsers] = useState<User[]>([])
  const [hostels, setHostels] = useState<Hostel[]>([])
  const [products, setProducts] = useState<Product[]>([])

  const load = useCallback(async () => {
    if (user?.role !== 'admin') return
    const [ov, us, hs, ps] = await Promise.all([
      api.getAdminOverview(),
      api.listAdminUsers(),
      api.listHostels(),
      api.listSellerProducts(),
    ])
    setStats(ov.stats)
    setUsers(us)
    setHostels(hs)
    setProducts(ps)
  }, [user?.role])

  useEffect(() => {
    void load().catch(() => undefined)
  }, [load])

  if (user?.role !== 'admin') {
    return (
      <Card className="owner-locked">
        <h2>Administrator access required</h2>
        <p>Only platform administrators can manage users, verifications, and global listings.</p>
      </Card>
    )
  }

  return (
    <div className="owner-dashboard">
      <div className="page-header">
        <div>
          <div className="eyebrow">Platform governance and moderation</div>
          <h1>Admin Console</h1>
        </div>
      </div>

      {stats && (
        <section className="owner-stat-grid">
          <Card><span>Users</span><strong>{stats.users}</strong><small>Registered accounts</small></Card>
          <Card><span>Products</span><strong>{stats.products}</strong><small>{stats.orders} total orders</small></Card>
          <Card><span>Hostels</span><strong>{stats.hostels}</strong><small>{stats.bookings} room bookings</small></Card>
          <Card><span>Paid Revenue</span><strong>₹{stats.paidRevenue.toLocaleString('en-IN')}</strong><small>{stats.payments} transactions</small></Card>
        </section>
      )}

      <Card className="table-card">
        <h3>User Role Management</h3>
        <table>
          <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Change Role</th></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td><strong>{u.name}</strong></td>
                <td>{u.email}</td>
                <td><Badge>{u.role}</Badge></td>
                <td>
                  <select
                    className="native-select"
                    value={u.role}
                    onChange={(e) => void api.updateAdminUserRole(u.id, e.target.value as User['role']).then(load)}
                  >
                    <option value="student">student</option>
                    <option value="seller">seller</option>
                    <option value="hostel_owner">hostel_owner</option>
                    <option value="mess_owner">mess_owner</option>
                    <option value="admin">admin</option>
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card className="table-card">
        <h3>Hostel Verification</h3>
        <table>
          <thead><tr><th>Hostel</th><th>Area</th><th>Rent</th><th>Verified</th><th>Action</th></tr></thead>
          <tbody>
            {hostels.map((h) => (
              <tr key={h.id}>
                <td><strong>{h.name}</strong></td>
                <td>{h.area}</td>
                <td>₹{h.rent.toLocaleString('en-IN')}</td>
                <td><Badge appearance="tint" color={h.verified ? 'success' : 'warning'}>{h.verified ? 'Verified' : 'Unverified'}</Badge></td>
                <td><Button size="small" onClick={() => void api.toggleAdminHostelVerify(h.id).then(load)}>{h.verified ? 'Unverify' : 'Verify'}</Button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card className="table-card">
        <h3>Marketplace Moderation</h3>
        <table>
          <thead><tr><th>Product</th><th>Price</th><th>Stock</th><th>Status</th><th>Action</th></tr></thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id}>
                <td><strong>{p.title}</strong></td>
                <td>₹{p.price.toLocaleString('en-IN')}</td>
                <td>{p.stock}</td>
                <td><Badge appearance="tint" color={p.isActive ? 'success' : 'danger'}>{p.isActive ? 'Active' : 'Inactive'}</Badge></td>
                <td><Button size="small" onClick={() => void api.toggleAdminProduct(p.id).then(load)}>{p.isActive ? 'Disable' : 'Enable'}</Button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  )
}
