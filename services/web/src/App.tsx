import { useCallback, useEffect, useState } from 'react'
import {
  Avatar,
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
  Tab,
  TabList,
  Textarea,
  Toolbar,
  ToolbarButton,
} from '@fluentui/react-components'
import {
  AlertRegular,
  BookmarkRegular,
  BuildingRegular,
  CalendarRegular,
  ChatRegular,
  CheckmarkCircleRegular,
  DismissRegular,
  FoodRegular,
  HatGraduationRegular,
  HomeRegular,
  MailRegular,
  PeopleRegular,
  SearchRegular,
  ShoppingBagRegular,
  SignOutRegular,
} from '@fluentui/react-icons'
import QRCode from 'qrcode'
import { LiveCampusWidget } from './LiveCampusWidget'
import { api } from './api'
import { MarketplaceView } from './components/MarketplaceView'
import { RoomsView } from './components/RoomsView'
import {
  AdminDashboard,
  BookingsPage,
  OwnerDashboard,
  PaymentsPage,
  ProfilePage,
  SavedListingsPage,
} from './components/StudentPages'
import type {
  Conversation,
  Hostel,
  Listing,
  LivingCombination,
  Meal,
  NotificationItem,
  Roommate,
  User,
} from './types/entities'
import { runRazorpayFlow } from './utils/razorpay'
import {
  encodeComplaintPayload,
  generateComplaintCode,
  loadLocalComplaints,
  mergeComplaintRecords,
  saveLocalComplaints,
  saveStatusOverride,
  type ComplaintRecord,
  type ComplaintStatus,
} from './utils/complaints'
import {
  FALLBACK_MEAL_IMAGE,
  FALLBACK_PRODUCT_IMAGE,
  FALLBACK_ROOM_IMAGE,
  formatLocalDate,
  formatLocalTime,
  getGreeting,
  handleImageError,
  resolveImageUrl,
} from './utils/time'
import './App.css'

const routes = [
  { path: '/', label: 'Dashboard', icon: <HomeRegular /> },
  { path: '/hostels', label: 'Find Rooms', icon: <BuildingRegular /> },
  { path: '/roommates', label: 'Find Roommates', icon: <PeopleRegular /> },
  { path: '/mess', label: 'Find Mess', icon: <FoodRegular /> },
  { path: '/marketplace', label: 'Marketplace', icon: <ShoppingBagRegular /> },
  { path: '/bookings', label: 'My Bookings', icon: <CalendarRegular /> },
  { path: '/saved', label: 'Saved Listings', icon: <BookmarkRegular /> },
  { path: '/payments', label: 'Payments', icon: <ChatRegular /> },
  { path: '/owner', label: 'Owner Dashboard', icon: <BuildingRegular /> },
  { path: '/admin', label: 'Admin Console', icon: <BuildingRegular /> },
  { path: '/profile', label: 'Profile', icon: <PeopleRegular /> },
  { path: '/settings', label: 'Settings', icon: <SearchRegular /> },
  { path: '/messages', label: 'Messages', icon: <MailRegular /> },
  { path: '/ai', label: 'AI Assistant', icon: <ChatRegular /> },
]

function usePath(): [string, (path: string) => void] {
  const [path, setPath] = useState(window.location.pathname)
  const navigate = useCallback((next: string) => {
    window.history.pushState({}, '', next)
    setPath(next)
  }, [])
  useEffect(() => {
    const pop = () => setPath(window.location.pathname)
    window.addEventListener('popstate', pop)
    return () => window.removeEventListener('popstate', pop)
  }, [])
  return [path, navigate]
}

function LoadingGrid() {
  return (
    <div className="content-grid">
      {[1, 2, 3].map((item) => (
        <Card key={item}>
          <Skeleton>
            <SkeletonItem size={128} />
            <SkeletonItem />
            <SkeletonItem />
          </Skeleton>
        </Card>
      ))}
    </div>
  )
}

function EmptyState({ title, action, onAction }: { title: string; action: string; onAction?: () => void }) {
  return (
    <Card className="empty-state">
      <SearchRegular />
      <h3>{title}</h3>
      <p>Try another filter or check back soon.</p>
      <Button appearance="primary" onClick={onAction}>
        {action}
      </Button>
    </Card>
  )
}

function ErrorState({ retry }: { retry: () => void }) {
  return (
    <MessageBar intent="error">
      <MessageBarBody>Student services are temporarily unavailable.</MessageBarBody>
      <Button appearance="secondary" onClick={retry}>
        Retry
      </Button>
    </MessageBar>
  )
}

function App() {
  const [path, navigate] = usePath()
  const [user, setUser] = useState<User | null>(null)
  const [authView, setAuthView] = useState<'app' | 'login' | 'create'>('app')
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [notifOpen, setNotifOpen] = useState(false)

  const refreshNotifications = useCallback(() => {
    void api
      .listNotifications()
      .then((res) => {
        setNotifications(res.notifications)
        setUnreadCount(res.unreadCount)
      })
      .catch(() => undefined)
  }, [])

  useEffect(() => {
    api
      .getCurrentUser()
      .then((next) => {
        setUser(next)
        if (next.role === 'admin' && window.location.pathname === '/') navigate('/admin')
        else if (next.role !== 'student' && window.location.pathname === '/') navigate('/owner')
        refreshNotifications()
      })
      .catch(() => setAuthView('login'))
  }, [navigate, refreshNotifications])

  useEffect(() => {
    if (path === '/ai') window.setTimeout(() => window.dispatchEvent(new CustomEvent('studenthub-ai-open')), 100)
    if (user) refreshNotifications()
  }, [path, user, refreshNotifications])

  if (authView === 'login') {
    return (
      <LoginView
        onLogin={async (email, password) => {
          const next = await api.login({ email, password })
          setUser(next)
          setAuthView('app')
          if (next.role === 'admin') navigate('/admin')
          else if (next.role !== 'student') navigate('/owner')
          else navigate('/')
          window.dispatchEvent(new CustomEvent('studenthub-thank', { detail: `Welcome back, ${next.name}.` }))
        }}
        onCreate={() => setAuthView('create')}
      />
    )
  }

  if (authView === 'create') {
    return (
      <CreateAccountView
        onCreated={async (created) => {
          setUser(created)
          setAuthView('app')
          if (created.role !== 'student') navigate('/owner')
          else navigate('/')
          window.dispatchEvent(new CustomEvent('studenthub-thank', { detail: `Thank you, ${created.name}. Your account is ready!` }))
        }}
        onCancel={() => setAuthView('login')}
      />
    )
  }

  const visibleRoutes = routes.filter((route) => {
    if (route.path === '/owner') return user && user.role !== 'student'
    if (route.path === '/admin') return user?.role === 'admin'
    return true
  })

  return (
    <div className="app-shell">
      <header className="app-header">
        <button className="brand" onClick={() => navigate('/')}>
          <span className="brand-mark">
            <HatGraduationRegular />
          </span>
          <span>StudentHub</span>
        </button>
        <Toolbar>
          <div className="notif-wrapper">
            <ToolbarButton
              aria-label="Notifications"
              icon={<AlertRegular />}
              onClick={() => {
                setNotifOpen((o) => !o)
                refreshNotifications()
              }}
            />
            {unreadCount > 0 && <span className="notif-dot">{unreadCount}</span>}
            {notifOpen && (
              <Card className="notif-popover">
                <div className="section-heading">
                  <strong>Notifications</strong>
                  <Button
                    size="small"
                    appearance="subtle"
                    onClick={() => void api.markAllNotificationsRead().then(refreshNotifications)}
                  >
                    Mark all read
                  </Button>
                </div>
                {notifications.length === 0 ? (
                  <p className="eyebrow">No notifications yet.</p>
                ) : (
                  <div className="notif-list">
                    {notifications.slice(0, 8).map((n) => (
                      <button
                        type="button"
                        key={n.id}
                        className={`notif-item ${n.isRead ? 'read' : 'unread'}`}
                        onClick={() => {
                          void api.markNotificationRead(n.id).then(refreshNotifications)
                          if (n.link) navigate(n.link)
                          setNotifOpen(false)
                        }}
                      >
                        <strong>{n.title}</strong>
                        <span>{n.message}</span>
                      </button>
                    ))}
                  </div>
                )}
              </Card>
            )}
          </div>
          <ToolbarButton aria-label="Messages" icon={<ChatRegular />} onClick={() => navigate('/messages')} />
          <Avatar
            name={user?.name ?? 'Student'}
            initials={
              user?.name
                ?.split(' ')
                .map((part) => part[0])
                .join('')
                .slice(0, 2)
                .toUpperCase() ?? 'ST'
            }
          />
          <div className="user-identity">
            <span className="user-name">{user?.name ?? 'Student'}</span>
            {user && user.role !== 'student' && (
              <Badge appearance="tint" color="informative">
                {user.role === 'hostel_owner'
                  ? 'Room owner'
                  : user.role === 'mess_owner'
                    ? 'Mess owner'
                    : user.role === 'admin'
                      ? 'Admin'
                      : 'Seller'}
              </Badge>
            )}
          </div>
          <ToolbarButton
            aria-label="Sign out"
            icon={<SignOutRegular />}
            onClick={async () => {
              await api.logout()
              setUser(null)
              setAuthView('login')
            }}
          />
        </Toolbar>
      </header>

      <ThankYouToast />

      <div className="app-body">
        <aside className="sidebar">
          <div className="sidebar-label">Student services</div>
          <TabList vertical selectedValue={path} onTabSelect={(_, data) => navigate(String(data.value))}>
            {visibleRoutes.map((route) => (
              <Tab key={route.path} value={route.path} icon={route.icon}>
                {route.label}
              </Tab>
            ))}
          </TabList>
        </aside>

        <main className="main-content">
          {path === '/' && (
            <>
              <LiveCampusWidget />
              <StudentFeatureMarquee />
              <Dashboard navigate={navigate} user={user} />
            </>
          )}
          {path === '/hostels' && <RoomsView user={user} />}
          {path === '/roommates' && <RoommatesPage />}
          {path === '/mess' && <MessPage user={user} />}
          {path === '/marketplace' && <MarketplaceView user={user} />}
          {path === '/bookings' && <BookingsPage user={user} navigate={navigate} />}
          {path === '/saved' && <SavedListingsPage navigate={navigate} />}
          {path === '/payments' && <PaymentsPage navigate={navigate} />}
          {path === '/owner' && <OwnerDashboard user={user} navigate={navigate} />}
          {path === '/admin' && <AdminDashboard user={user} />}
          {path === '/profile' && <ProfilePage user={user} onUpdated={setUser} />}
          {path === '/settings' && <UtilityPage key="settings" title="Settings" eyebrow="Campus, privacy and notifications" navigate={navigate} />}
          {path === '/ai' && <UtilityPage key="ai" title="StudentHub AI" eyebrow="Ask, compare and decide" navigate={navigate} />}
          {path === '/messages' && <MessagesPage />}
        </main>
      </div>

      <StudentSafetyFooter navigate={navigate} />
      <AIChatWidget />
    </div>
  )
}

function StudentFeatureMarquee() {
  const features = ['Zero-broker living', 'Verified student community', 'Roommate compatibility', 'Mess comparisons', 'Campus essentials', 'Safety resources', 'Owner-managed listings']
  return (
    <section className="student-marquee" aria-label="StudentHub features">
      <div className="student-marquee__track">
        {[...features, ...features].map((feature, index) => (
          <span key={`${feature}-${index}`}>
            <b>0{(index % features.length) + 1}</b>
            {feature}
          </span>
        ))}
      </div>
    </section>
  )
}

function HowItWorks() {
  const steps = [
    { number: '01', title: 'Discover', text: 'Search rooms, mess services and student listings by location, budget and facilities.' },
    { number: '02', title: 'Compare', text: 'Review monthly costs, preferences, amenities and the details that matter to you.' },
    { number: '03', title: 'Book & Buy', text: 'Check real-time room availability, add essentials to cart, and checkout securely.' },
    { number: '04', title: 'Track live', text: 'Follow booking approvals, order fulfillment, and verified payments from one dashboard.' },
  ]
  return (
    <section className="how-it-works">
      <div className="how-it-works__heading">
        <span className="eyebrow">How StudentHub works</span>
        <h2>From search to a student-ready plan</h2>
        <p>Four clear steps for finding, comparing, booking, and paying for student services.</p>
      </div>
      <div className="how-it-works__grid">
        {steps.map((step) => (
          <article key={step.number}>
            <span>{step.number}</span>
            <h3>{step.title}</h3>
            <p>{step.text}</p>
          </article>
        ))}
      </div>
    </section>
  )
}

function UtilityPage({ title, eyebrow, navigate }: { title: string; eyebrow: string; navigate: (path: string) => void }) {
  const isAI = title === 'StudentHub AI'
  const [selectedCampus, setSelectedCampus] = useState(() => localStorage.getItem('studenthub.campus') || 'AITD Kanpur, Uttar Pradesh')
  return (
    <>
      <PageHeader title={title} eyebrow={eyebrow} />
      <div className="utility-grid">
        <Card className="utility-feature">
          {isAI ? (
            <>
              <h2>AI campus assistant</h2>
              <p>The assistant compares rooms, roommate profiles, mess options and marketplace products using live StudentHub data.</p>
              <Button
                appearance="primary"
                onClick={() =>
                  window.dispatchEvent(new CustomEvent('studenthub-ai-open', { detail: 'Help me plan an affordable student living setup' }))
                }
              >
                Open assistant
              </Button>
            </>
          ) : (
            <>
              <h2>Campus &amp; notification preferences</h2>
              <p>Choose your default campus for location-aware room and marketplace discovery.</p>
              <Field label="Default Campus">
                <Input value={selectedCampus} onChange={(_, d) => setSelectedCampus(d.value)} />
              </Field>
              <div className="header-actions-row">
                <Button
                  appearance="primary"
                  onClick={() => {
                    localStorage.setItem('studenthub.campus', selectedCampus)
                    window.dispatchEvent(new CustomEvent('studenthub-thank', { detail: 'Campus preference saved.' }))
                  }}
                >
                  Save preference
                </Button>
                <Button appearance="secondary" onClick={() => navigate('/')}>
                  Return to dashboard
                </Button>
              </div>
            </>
          )}
        </Card>
      </div>
    </>
  )
}

function PageHeader({ title, eyebrow, action, onAction }: { title: string; eyebrow?: string; action?: string; onAction?: () => void }) {
  return (
    <div className="page-header">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
      </div>
      {action && (
        <Button appearance="primary" icon={<SearchRegular />} onClick={onAction}>
          {action}
        </Button>
      )}
    </div>
  )
}

function Dashboard({ navigate, user }: { navigate: (path: string) => void; user: User | null }) {
  const [now, setNow] = useState(() => new Date())
  const [hostels, setHostels] = useState<Hostel[]>([])
  const [roommates, setRoommates] = useState<Roommate[]>([])
  const [meals, setMeals] = useState<Meal[]>([])
  const [listings, setListings] = useState<Listing[]>([])
  const [combinations, setCombinations] = useState<LivingCombination[]>([])
  const [monthlyBudget, setMonthlyBudget] = useState('')
  const [error, setError] = useState(false)

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  const load = useCallback(() => {
    setError(false)
    void Promise.allSettled([
      api.listHostels(),
      api.listRoommates(),
      api.getMessMenu(),
      api.listProducts(),
      api.getCombinations(monthlyBudget ? Number(monthlyBudget) : undefined),
    ]).then((results) => {
      const [hostelResult, roommateResult, mealResult, listingResult, combinationResult] = results
      if (hostelResult.status === 'fulfilled') setHostels(hostelResult.value)
      if (roommateResult.status === 'fulfilled') setRoommates(roommateResult.value)
      if (mealResult.status === 'fulfilled') setMeals(mealResult.value)
      if (listingResult.status === 'fulfilled') setListings(listingResult.value)
      if (combinationResult.status === 'fulfilled') setCombinations(combinationResult.value.combinations)
      if (results.every((result) => result.status === 'rejected')) setError(true)
    })
  }, [monthlyBudget])

  useEffect(() => {
    load()
  }, [load])

  const firstName = user?.name?.split(' ')[0] ?? 'Student'
  const greeting = getGreeting(now)
  const formattedDate = formatLocalDate(now)
  const formattedTime = formatLocalTime(now, false)

  if (error) {
    return (
      <>
        <PageHeader title={`${greeting}, ${firstName}`} />
        <ErrorState retry={load} />
      </>
    )
  }

  return (
    <>
      <section className="dashboard-hero">
        <div className="dashboard-hero__content">
          <div className="eyebrow dashboard-hero__eyebrow">One platform for student living</div>
          <h1>
            <span className="hero-highlight">{greeting}</span>, {firstName}!
          </h1>
          <p>
            Welcome back to StudentHub. Discover verified rooms, compatible roommates, campus mess plans, and essential supplies in one calm, transparent workspace.
          </p>
          <div className="dashboard-hero__actions">
            <Button appearance="primary" size="large" icon={<SearchRegular />} onClick={() => navigate('/hostels')}>
              Find a room
            </Button>
            <Button appearance="secondary" size="large" onClick={() => navigate('/marketplace')}>
              Browse essentials
            </Button>
          </div>
          <div className="dashboard-hero__trust">
            <span><strong>{hostels.filter((item) => item.verified).length}</strong> verified stays</span>
            <span><strong>{listings.filter((item) => item.inStock).length}</strong> essentials ready</span>
            <span><strong>0%</strong> brokerage fee</span>
          </div>
        </div>
        <div className="dashboard-hero__visual">
          <img
            className="dashboard-hero__photo"
            src="https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=1000"
            onError={handleImageError(FALLBACK_ROOM_IMAGE)}
            alt="Campus living and student housing"
          />
          <div className="dashboard-hero__summary">
            <span>Local date &amp; time</span>
            <strong>{formattedTime}</strong>
            <div>
              <CalendarRegular /> {formattedDate}
            </div>
          </div>
          <div className="dashboard-hero__floating-badge">
            <Badge appearance="tint" color="success">Verified Campus Network</Badge>
            <small>Rooms · Mess · Essentials</small>
          </div>
        </div>
      </section>

      <section className="kpi-grid">
        <Card className="kpi">
          <div className="kpi-label"><span>Available rooms</span><BuildingRegular /></div>
          <strong>{hostels.length} hostels listed</strong>
          <Badge appearance="tint" color="success">{hostels.filter((item) => item.verified).length} verified</Badge>
        </Card>
        <Card className="kpi">
          <div className="kpi-label"><span>Mess services</span><FoodRegular /></div>
          <strong>{meals.length ? `${meals.length} meal options` : 'No menu loaded'}</strong>
          <span>{meals.find((item) => item.state === 'Serving')?.menu ?? "View today's menu"}</span>
        </Card>
        <Card className="kpi">
          <div className="kpi-label"><span>Roommate matches</span><PeopleRegular /></div>
          <strong>{roommates.length} compatible profiles</strong>
          <Badge appearance="tint" color="warning">{roommates.filter((item) => item.match >= 90).length} high confidence</Badge>
        </Card>
        <Card className="kpi">
          <div className="kpi-label"><span>Marketplace</span><BookmarkRegular /></div>
          <strong>{listings.length} active products</strong>
          <span>{listings.filter((item) => item.inStock).length} in stock right now</span>
        </Card>
      </section>

      <section className="decision-engine">
        <div className="section-heading">
          <div><span className="eyebrow">Recommended StudentHub package</span><h2>Best complete living combination</h2></div>
          <div className="budget-picker">
            <Field label="Monthly living budget">
              <Input type="number" value={monthlyBudget} onChange={(_, data) => setMonthlyBudget(data.value)} placeholder="15000" />
            </Field>
            <Button appearance="primary" onClick={load}>Recalculate</Button>
          </div>
        </div>
        {combinations[0] ? (
          <Card className="decision-card">
            <div className="decision-card__main">
              <Badge appearance="tint" color="success">Decision score {combinations[0].decisionScore}/100</Badge>
              <h3>{combinations[0].room.name} + {combinations[0].roommate.name} + {combinations[0].mess.name}</h3>
              <p>{combinations[0].room.area} · Roommate match {combinations[0].roommate.match}% · Safety {combinations[0].safetyScore}/100</p>
              <div className="freshness-row">
                <Badge>{combinations[0].availability}</Badge>
                <Badge>{combinations[0].freshness}</Badge>
                <Badge>{combinations[0].room.verified ? 'Verified housing' : 'Not verified'}</Badge>
              </div>
            </div>
            <div className="cost-breakdown">
              <strong>₹{combinations[0].monthlyCost.total.toLocaleString('en-IN')} / month</strong>
              {[
                ['Room', combinations[0].monthlyCost.room],
                ['Mess', combinations[0].monthlyCost.mess],
                ['Transport', combinations[0].monthlyCost.transport],
                ['Essentials', combinations[0].monthlyCost.essentials],
              ].map(([label, amount]) => (
                <div key={String(label)}>
                  <span>{label}</span>
                  <b>₹{Number(amount).toLocaleString('en-IN')}</b>
                </div>
              ))}
            </div>
          </Card>
        ) : (
          <Card className="decision-card">
            <div className="decision-card__main">
              <Badge appearance="tint" color="warning">Budget too low</Badge>
              <h3>No package fits ₹{monthlyBudget ? Number(monthlyBudget).toLocaleString('en-IN') : '0'} per month</h3>
              <p>Try ₹14,000 or more, or recalculate after listings are updated.</p>
            </div>
          </Card>
        )}
      </section>

      <section className="assistant-banner">
        <div>
          <span className="eyebrow">StudentHub AI</span>
          <h2>Find the right option at the lowest price</h2>
          <p>Compare rooms, roommates, mess plans, and essentials in one conversation.</p>
        </div>
        <div className="assistant-banner__actions">
          <Button appearance="primary" onClick={() => window.dispatchEvent(new CustomEvent('studenthub-ai-open', { detail: 'Find me the lowest price room with good safety and amenities' }))}>
            Ask for the best room
          </Button>
          <Button appearance="secondary" onClick={() => window.dispatchEvent(new CustomEvent('studenthub-ai-open', { detail: 'Find me a roommate matching my sleep, study, diet and hobbies' }))}>
            Find my roommate
          </Button>
        </div>
      </section>

      <HowItWorks />

      <section>
        <div className="section-heading"><h2>Your next steps</h2><span>Updated just now</span></div>
        <div className="content-grid">
          {hostels.slice(0, 1).map((hostel) => (
            <Card key={hostel.id}>
              <CardHeader header={<strong>{hostel.name}</strong>} action={<Badge appearance="tint" color={hostel.verified ? 'success' : 'warning'}>{hostel.verified ? 'Verified' : 'Listed'}</Badge>} />
              <CardPreview>
                <img
                  className="card-image"
                  src={resolveImageUrl(hostel.image, FALLBACK_ROOM_IMAGE)}
                  onError={handleImageError(FALLBACK_ROOM_IMAGE)}
                  alt={hostel.name}
                />
              </CardPreview>
              <CardFooter><Button appearance="primary" onClick={() => navigate('/hostels')}>View &amp; book room</Button></CardFooter>
            </Card>
          ))}
          {meals.slice(2, 3).map((meal) => (
            <Card key={meal.id}>
              <CardHeader header={<strong>Dinner tonight</strong>} action={<Badge appearance="tint" color="warning">Upcoming</Badge>} />
              <CardPreview>
                <img
                  className="card-image"
                  src={resolveImageUrl(
                    meal.name === 'Dinner' ? 'https://images.unsplash.com/photo-1585937421612-70a008356fbe?w=900' : meal.image,
                    FALLBACK_MEAL_IMAGE,
                  )}
                  onError={handleImageError(FALLBACK_MEAL_IMAGE)}
                  alt={meal.name ?? 'Dinner tonight'}
                />
              </CardPreview>
              <div className="card-copy"><h3>North Campus Mess</h3><p>{meal.menu}</p><span>7:30–9:30 PM</span></div>
              <CardFooter><Button appearance="secondary" onClick={() => navigate('/mess')}>View mess plan</Button></CardFooter>
            </Card>
          ))}
          {roommates.slice(0, 1).map((match) => (
            <Card key={match.id}>
              <CardHeader header={<strong>Top roommate match</strong>} action={<Badge appearance="tint" color="warning">{match.match}%</Badge>} />
              <div className="person-row"><Avatar name={match.name} image={match.avatar ? { src: match.avatar } : undefined} /><div><strong>{match.name}</strong><p>{match.course} · {match.budget}</p></div></div>
              <CardFooter><Button appearance="primary" onClick={() => navigate('/roommates')}>Review match</Button></CardFooter>
            </Card>
          ))}
          {listings.slice(0, 1).map((listing) => (
            <Card key={listing.id}>
              <CardHeader header={<strong>Marketplace highlight</strong>} action={<Badge>{listing.condition}</Badge>} />
              <CardPreview>
                <img
                  className="card-image"
                  src={resolveImageUrl(listing.image, FALLBACK_PRODUCT_IMAGE)}
                  onError={handleImageError(FALLBACK_PRODUCT_IMAGE)}
                  alt={listing.title}
                />
              </CardPreview>
              <div className="card-copy"><h3>{listing.title}</h3><p>{listing.seller} · ₹{listing.price.toLocaleString('en-IN')}</p><Badge appearance="tint" color="success">{listing.stock} in stock</Badge></div>
              <CardFooter><Button appearance="secondary" onClick={() => navigate('/marketplace')}>Open marketplace</Button></CardFooter>
            </Card>
          ))}
        </div>
      </section>

      <StudentDropdownTools navigate={navigate} />
      <FeatureStatus />
    </>
  )
}

function StudentDropdownTools({ navigate }: { navigate: (path: string) => void }) {
  const [expense, setExpense] = useState('')
  const [amount, setAmount] = useState('')
  const [people, setPeople] = useState('2')
  const [distance, setDistance] = useState('5')
  const [movingEstimate, setMovingEstimate] = useState<number | null>(null)
  const [verificationEmail, setVerificationEmail] = useState('')
  const [complaintTitle, setComplaintTitle] = useState('')
  const [complaintCategory, setComplaintCategory] = useState('Accommodation / Hostel')
  const [complaintProperty, setComplaintProperty] = useState('')
  const [complaintDate, setComplaintDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [complaintDescription, setComplaintDescription] = useState('')
  const [complaintError, setComplaintError] = useState('')
  const [complaintBusy, setComplaintBusy] = useState(false)
  const [selectedComplaint, setSelectedComplaint] = useState<ComplaintRecord | null>(null)
  const [payments, setPayments] = useState<{ id: string; purpose: string; amount: number; method: string; status: string }[]>([])
  const [complaints, setComplaints] = useState<ComplaintRecord[]>(() => loadLocalComplaints())

  const refreshComplaints = useCallback(async () => {
    const local = loadLocalComplaints()
    try {
      const serverRows = await api.listSupport()
      const merged = mergeComplaintRecords(serverRows, local)
      setComplaints(merged)
      saveLocalComplaints(merged)
    } catch {
      setComplaints(local)
    }
  }, [])

  useEffect(() => {
    api.listPayments().then(setPayments).catch(() => setPayments([]))
    void refreshComplaints()
  }, [refreshComplaints])

  const splitAmount = amount && people ? Number(amount) / Number(people) : 0

  const submitComplaint = async () => {
    const title = complaintTitle.trim()
    const desc = complaintDescription.trim()
    if (title.length < 2) {
      setComplaintError('Please enter a complaint title (at least 2 characters).')
      return
    }
    if (desc.length < 3) {
      setComplaintError('Please enter a detailed description of the issue (at least 3 characters).')
      return
    }
    if (complaintBusy) return
    setComplaintBusy(true)
    setComplaintError('')

    const complaintCode = generateComplaintCode()
    const related = complaintProperty.trim() || 'General StudentHub Service'
    const newRecord: ComplaintRecord = {
      id: `local-${complaintCode}`,
      complaintCode,
      title,
      category: complaintCategory,
      description: desc,
      relatedService: related,
      complaintDate: complaintDate || new Date().toISOString().slice(0, 10),
      status: 'Submitted',
    }

    try {
      await api.addSupport({
        subject: title,
        description: encodeComplaintPayload({
          complaintCode,
          category: complaintCategory,
          relatedService: related,
          complaintDate: newRecord.complaintDate,
          description: desc,
        }),
      })
      await refreshComplaints()
    } catch {
      const next = [newRecord, ...loadLocalComplaints()]
      saveLocalComplaints(next)
      setComplaints(next)
    } finally {
      setComplaintTitle('')
      setComplaintProperty('')
      setComplaintDescription('')
      setComplaintBusy(false)
      window.dispatchEvent(new CustomEvent('studenthub-thank', { detail: `Complaint ${complaintCode} submitted successfully.` }))
    }
  }

  const updateComplaintStatus = (record: ComplaintRecord, status: ComplaintStatus) => {
    saveStatusOverride(record.complaintCode, status)
    const updatedList = complaints.map((item) =>
      item.complaintCode === record.complaintCode ? { ...item, status } : item,
    )
    setComplaints(updatedList)
    saveLocalComplaints(updatedList)
    setSelectedComplaint({ ...record, status })
  }

  const verificationStatus = verificationEmail.toLowerCase().includes('.edu') || verificationEmail.toLowerCase().includes('.ac.') || verificationEmail.toLowerCase().includes('@college.')

  const statusColor = (status: ComplaintStatus) =>
    status === 'Resolved' ? 'success' : status === 'In Progress' || status === 'Under Review' ? 'warning' : 'informative'

  return (
    <section className="dropdown-tools">
      <div className="section-heading"><div><span className="eyebrow">Student tools</span><h2>Everything you need after choosing a stay</h2></div><span>Expandable assistant panels</span></div>

      {selectedComplaint && (
        <div className="complaint-modal-backdrop" role="dialog" aria-modal="true" aria-label="Complaint details" onClick={() => setSelectedComplaint(null)}>
          <Card className="complaint-modal" onClick={(e) => e.stopPropagation()}>
            <div className="detail-modal__header">
              <div>
                <div className="order-badges">
                  <Badge appearance="tint" color="informative">{selectedComplaint.complaintCode}</Badge>
                  <Badge appearance="tint" color={statusColor(selectedComplaint.status)}>{selectedComplaint.status}</Badge>
                </div>
                <h2>{selectedComplaint.title}</h2>
                <span className="eyebrow">{selectedComplaint.category} · Submitted on {selectedComplaint.complaintDate}</span>
              </div>
              <Button appearance="subtle" icon={<DismissRegular />} onClick={() => setSelectedComplaint(null)}>
                Close
              </Button>
            </div>
            <div className="detail-meta-list">
              <div><span>Complaint ID</span><strong>{selectedComplaint.complaintCode}</strong></div>
              <div><span>Category</span><strong>{selectedComplaint.category}</strong></div>
              <div><span>Related Property / Service</span><strong>{selectedComplaint.relatedService}</strong></div>
              <div><span>Date of Complaint</span><strong>{selectedComplaint.complaintDate}</strong></div>
            </div>
            <div className="complaint-modal__body">
              <h4>Issue Description</h4>
              <p>{selectedComplaint.description}</p>
            </div>
            <div className="complaint-modal__footer">
              <Field label="Status">
                <select
                  className="native-select"
                  value={selectedComplaint.status}
                  onChange={(e) => updateComplaintStatus(selectedComplaint, e.target.value as ComplaintStatus)}
                >
                  <option value="Submitted">Submitted</option>
                  <option value="Under Review">Under Review</option>
                  <option value="In Progress">In Progress</option>
                  <option value="Resolved">Resolved</option>
                </select>
              </Field>
              <Button appearance="primary" onClick={() => setSelectedComplaint(null)}>Done</Button>
            </div>
          </Card>
        </div>
      )}

      <div className="dropdown-tools__grid">
        <details className="tool-dropdown" open>
          <summary><span className="tool-dropdown__icon">LC</span><span><strong>Lifestyle compatibility</strong><small>Sleep, study, diet and habits</small></span></summary>
          <div className="tool-dropdown__body">
            <div className="compatibility-list"><div><span>Sleep schedule</span><b>Matched</b></div><div><span>Study style</span><b>Matched</b></div><div><span>Food preference</span><b>Review</b></div><div><span>Shared hobbies</span><b>Possible match</b></div></div>
            <Button appearance="primary" onClick={() => navigate('/roommates')}>Open roommate matching</Button>
          </div>
        </details>
        <details className="tool-dropdown">
          <summary><span className="tool-dropdown__icon">EN</span><span><strong>Emergency student network</strong><small>Campus and trusted personal contacts</small></span></summary>
          <div className="tool-dropdown__body">
            <div className="emergency-links"><a href="tel:112"><span>National emergency</span><strong>112</strong></a><a href="tel:1091"><span>Women helpline</span><strong>1091</strong></a><a href="tel:1098"><span>Child helpline</span><strong>1098</strong></a></div>
          </div>
        </details>
        <details className="tool-dropdown">
          <summary><span className="tool-dropdown__icon">SE</span><span><strong>Shared expenses</strong><small>Split rent and mess costs clearly</small></span></summary>
          <div className="tool-dropdown__body">
            <div className="split-expense-form">
              <Field label="Expense"><Input value={expense} onChange={(_, data) => setExpense(data.value)} placeholder="Rent or groceries" /></Field>
              <Field label="Amount"><Input type="number" value={amount} onChange={(_, data) => setAmount(data.value)} placeholder="2400" /></Field>
              <Field label="People"><Input type="number" value={people} onChange={(_, data) => setPeople(data.value)} /></Field>
            </div>
            {amount && people && <div className="expense-result"><span>Each person pays</span><strong>₹{splitAmount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</strong></div>}
          </div>
        </details>
        <details className="tool-dropdown" open>
          <summary><span className="tool-dropdown__icon">CA</span><span><strong>Complaint assistant</strong><small>{complaints.length} recorded issue{complaints.length === 1 ? '' : 's'} · click to view details</small></span></summary>
          <div className="tool-dropdown__body">
            <div className="complaint-form-grid">
              <Field label="Complaint Title" required>
                <Input value={complaintTitle} onChange={(_, data) => setComplaintTitle(data.value)} placeholder="e.g., Water supply disruption" />
              </Field>
              <Field label="Category">
                <select className="native-select" value={complaintCategory} onChange={(e) => setComplaintCategory(e.target.value)}>
                  <option value="Accommodation / Hostel">Accommodation / Hostel</option>
                  <option value="Mess & Food">Mess &amp; Food</option>
                  <option value="Maintenance & Water">Maintenance &amp; Water</option>
                  <option value="Safety & Security">Safety &amp; Security</option>
                  <option value="Billing & Payment">Billing &amp; Payment</option>
                  <option value="Marketplace">Marketplace</option>
                  <option value="Other">Other</option>
                </select>
              </Field>
              <Field label="Related Property or Service">
                <Input value={complaintProperty} onChange={(_, data) => setComplaintProperty(data.value)} placeholder="e.g., The Scholar House" />
              </Field>
              <Field label="Date of Complaint">
                <Input type="date" value={complaintDate} onChange={(_, data) => setComplaintDate(data.value)} />
              </Field>
            </div>
            <Field label="Description of the Issue" required>
              <Textarea value={complaintDescription} onChange={(_, data) => setComplaintDescription(data.value)} placeholder="Describe the issue clearly including room number or service details..." />
            </Field>
            {complaintError && (
              <MessageBar intent="error"><MessageBarBody>{complaintError}</MessageBarBody></MessageBar>
            )}
            <Button appearance="primary" onClick={() => void submitComplaint()} disabled={complaintBusy}>
              {complaintBusy ? 'Submitting…' : 'Submit Complaint'}
            </Button>
            {complaints.length > 0 && (
              <div className="complaint-list">
                {complaints.map((item) => (
                  <div
                    className="support-request-row support-request-row--clickable"
                    key={item.complaintCode}
                    onClick={() => setSelectedComplaint(item)}
                  >
                    <div className="support-request-meta">
                      <strong>{item.title}</strong>
                      <small>{item.complaintCode} · {item.category} · {item.complaintDate}</small>
                    </div>
                    <div className="support-request-actions">
                      <Badge appearance="tint" color={statusColor(item.status)}>{item.status}</Badge>
                      <Button
                        size="small"
                        appearance="secondary"
                        onClick={(e) => {
                          e.stopPropagation()
                          setSelectedComplaint(item)
                        }}
                      >
                        View Details
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </details>
        <details className="tool-dropdown">
          <summary><span className="tool-dropdown__icon">SM</span><span><strong>Smart moving assistant</strong><small>Estimate a basic local move</small></span></summary>
          <div className="tool-dropdown__body">
            <Field label="Distance in km"><Input type="number" value={distance} onChange={(_, data) => setDistance(data.value)} /></Field>
            <Button appearance="primary" onClick={() => setMovingEstimate(Math.round(800 + Number(distance || 0) * 160))}>Calculate estimate</Button>
            {movingEstimate !== null && <div className="expense-result"><span>Estimated local moving cost</span><strong>₹{movingEstimate.toLocaleString('en-IN')}</strong></div>}
          </div>
        </details>
        <details className="tool-dropdown">
          <summary><span className="tool-dropdown__icon">CV</span><span><strong>College community check</strong><small>Format check only, not official verification</small></span></summary>
          <div className="tool-dropdown__body">
            <Field label="Institutional email"><Input type="email" value={verificationEmail} onChange={(_, data) => setVerificationEmail(data.value)} placeholder="name@college.edu" /></Field>
            {verificationEmail && <Badge appearance="tint" color={verificationStatus ? 'success' : 'warning'}>{verificationStatus ? 'Recognized format' : 'Format not recognized'}</Badge>}
          </div>
        </details>
        <details className="tool-dropdown">
          <summary><span className="tool-dropdown__icon">PY</span><span><strong>Payments &amp; bookings</strong><small>View transactions and reservations</small></span></summary>
          <div className="tool-dropdown__body">
            <div className="header-actions-row">
              <Button appearance="primary" onClick={() => navigate('/payments')}>View Payments</Button>
              <Button appearance="secondary" onClick={() => navigate('/bookings')}>My Bookings</Button>
            </div>
          </div>
        </details>
        <details className="tool-dropdown">
          <summary><span className="tool-dropdown__icon">HH</span><span><strong>Recent payment activity</strong><small>{payments.length} recorded transactions</small></span></summary>
          <div className="tool-dropdown__body">
            {payments.length ? (
              payments.slice(0, 5).map((payment) => (
                <div className="history-row" key={payment.id}>
                  <div><strong>{payment.purpose}</strong><span>{payment.method.toUpperCase()} · {payment.status}</span></div>
                  <b>₹{payment.amount.toLocaleString('en-IN')}</b>
                </div>
              ))
            ) : (
              <div className="tool-empty">No payment history yet.</div>
            )}
          </div>
        </details>
      </div>
    </section>
  )
}

function FeatureStatus() {
  const live = [
    ['Room discovery, availability & booking', 'Available'],
    ['Marketplace cart, stock & order flow', 'Available'],
    ['Seller & property owner dashboards', 'Available'],
    ['Razorpay order + signature verification', 'Gateway ready'],
    ['Real-time dashboard clock & greeting', 'Available'],
    ['Role-based auth & notifications', 'Available'],
  ]
  const gaps = [
    ['Real college database verification', 'Requires registrar or college identity API'],
    ['Live payment gateway capture', 'Requires RAZORPAY_KEY_ID & RAZORPAY_KEY_SECRET in .env'],
    ['Verified emergency provider network', 'Requires verified provider onboarding'],
  ]
  return (
    <section className="platform-status">
      <div className="section-heading"><h2>Platform capability status</h2><span>Running platform view</span></div>
      <div className="status-columns">
        <Card><h3>Available now</h3>{live.map(([name, state]) => <div className="status-row" key={name}><span>{name}</span><Badge appearance="tint" color="success">{state}</Badge></div>)}</Card>
        <Card><h3>Configuration / External APIs</h3>{gaps.map(([name, detail]) => <div className="status-row status-row--gap" key={name}><strong>{name}</strong><span>{detail}</span></div>)}</Card>
      </div>
    </section>
  )
}

function RoommatesPage() {
  const [matches, setMatches] = useState<Roommate[]>([])
  const [loading, setLoading] = useState(true)
  const [course, setCourse] = useState('')
  const [budgetMax, setBudgetMax] = useState('')
  const [preference, setPreference] = useState('')
  const [sleep, setSleep] = useState('')
  const [study, setStudy] = useState('')
  const [diet, setDiet] = useState('')
  const [hobby, setHobby] = useState('')

  const load = useCallback(
    (filters?: { course?: string; budgetMax?: number; preference?: string; sleep?: string; study?: string; diet?: string; hobby?: string }) => {
      void api.listRoommates(filters).then(setMatches).finally(() => setLoading(false))
    },
    [],
  )
  useEffect(() => {
    load()
  }, [load])
  const apply = () =>
    load({
      course: course.trim() || undefined,
      budgetMax: budgetMax ? Number(budgetMax) : undefined,
      preference: preference.trim() || undefined,
      sleep: sleep.trim() || undefined,
      study: study.trim() || undefined,
      diet: diet.trim() || undefined,
      hobby: hobby.trim() || undefined,
    })

  if (loading) return <><PageHeader title="Roommate Matches" /><LoadingGrid /></>
  return (
    <>
      <PageHeader title="Roommate Matches" eyebrow="Compatibility-ranked suggestions" />
      <div className="split-layout">
        <Card className="filters">
          <h3>Search preferences</h3>
          <Field label="Course"><Input value={course} onChange={(_, data) => setCourse(data.value)} placeholder="Computer Science" /></Field>
          <Field label="Maximum budget"><Input type="number" value={budgetMax} onChange={(_, data) => setBudgetMax(data.value)} placeholder="9000" /></Field>
          <Field label="Lifestyle"><Input value={preference} onChange={(_, data) => setPreference(data.value)} placeholder="Clean, Vegetarian" /></Field>
          <Field label="Sleeping schedule"><Input value={sleep} onChange={(_, data) => setSleep(data.value)} placeholder="Early riser or night owl" /></Field>
          <Field label="Study style"><Input value={study} onChange={(_, data) => setStudy(data.value)} placeholder="Quiet study or group study" /></Field>
          <Field label="Diet"><Input value={diet} onChange={(_, data) => setDiet(data.value)} placeholder="Vegetarian" /></Field>
          <Field label="Hobbies"><Input value={hobby} onChange={(_, data) => setHobby(data.value)} placeholder="Chess, music, sports" /></Field>
          <Button appearance="primary" onClick={apply}>Find roommates</Button>
          <Button
            appearance="subtle"
            onClick={() => {
              setCourse(''); setBudgetMax(''); setPreference(''); setSleep(''); setStudy(''); setDiet(''); setHobby('')
              load()
            }}
          >
            Clear
          </Button>
        </Card>
        {matches.length === 0 ? (
          <EmptyState title="No compatible matches yet" action="Reset filters" onAction={() => load()} />
        ) : (
          <Card className="table-card">
            <table>
              <thead><tr><th>Student</th><th>Course</th><th>Budget</th><th>Preferences</th><th>Match</th><th></th></tr></thead>
              <tbody>
                {matches.map((match) => (
                  <tr key={match.id}>
                    <td><div className="person-row"><Avatar name={match.name} image={match.avatar ? { src: match.avatar } : undefined} /><strong>{match.name}</strong></div></td>
                    <td>{match.course}</td>
                    <td>{match.budget}</td>
                    <td>{match.preferences?.join(' · ') ?? 'Open to preferences'}</td>
                    <td><Badge appearance="tint" color="warning">{match.match}%</Badge></td>
                    <td>
                      <Button
                        appearance="primary"
                        onClick={() => window.dispatchEvent(new CustomEvent('studenthub-thank', { detail: `Connection request sent to ${match.name}.` }))}
                      >
                        Connect
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </div>
    </>
  )
}

function MessPage({ user }: { user: User | null }) {
  const [meals, setMeals] = useState<Meal[]>([])
  const [loading, setLoading] = useState(true)
  const [payMethod, setPayMethod] = useState<'razorpay' | 'upi'>('razorpay')
  const [paymentMessage, setPaymentMessage] = useState('')
  const [upiIntent, setUpiIntent] = useState('')
  const [upiQr, setUpiQr] = useState('')
  const [upiError, setUpiError] = useState('')
  const [showPlanForm, setShowPlanForm] = useState(false)
  const [plan, setPlan] = useState({ name: '', meal: '', menu: '', time: '', price: '', imageUrl: '' })
  const [planImage, setPlanImage] = useState<File | null>(null)

  const load = useCallback(() => {
    void api.getMessMenu().then(setMeals).finally(() => setLoading(false))
  }, [])
  useEffect(() => {
    load()
  }, [load])

  if (loading) return <><PageHeader title="Mess Dining" /><LoadingGrid /></>
  if (meals.length === 0) return <><PageHeader title="Mess Dining" /><EmptyState title="No menu published" action="Refresh" onAction={load} /></>

  const addPlan = async () => {
    try {
      let imageUrl = plan.imageUrl || undefined
      if (planImage) imageUrl = (await api.uploadImage(planImage)).objectUrl
      await api.createMessPlan({ name: plan.name, meal: plan.meal, menu: plan.menu, time: plan.time, price: Number(plan.price), imageUrl })
      setShowPlanForm(false)
      setPlan({ name: '', meal: '', menu: '', time: '', price: '', imageUrl: '' })
      setPlanImage(null)
      load()
      window.dispatchEvent(new CustomEvent('studenthub-thank', { detail: 'Your mess plan was published.' }))
    } catch (error) {
      window.dispatchEvent(new CustomEvent('studenthub-thank', { detail: error instanceof Error ? error.message : 'Mess plan could not be published.' }))
    }
  }

  const renew = async () => {
    setPaymentMessage('')
    setUpiError('')
    setUpiIntent('')
    setUpiQr('')
    try {
      if (payMethod === 'razorpay') {
        const payOrder = await api.createPaymentOrder({ paymentType: 'mess', referenceId: 1 })
        const outcome = await runRazorpayFlow(payOrder, user, 'Monthly Mess Plan')
        setPaymentMessage(outcome.message)
      } else {
        const result = await api.checkoutPayment({ purpose: 'November meal plan', amount: 2800, method: 'upi' })
        setUpiIntent(result.upiIntent ?? '')
        setUpiError(result.upiError ?? '')
        setUpiQr(result.upiQrData ? await QRCode.toDataURL(result.upiQrData, { width: 220, margin: 1 }) : '')
        setPaymentMessage(`UPI payment ${result.paymentId} is pending until gateway verification confirms it.`)
      }
    } catch (err) {
      setPaymentMessage(err instanceof Error ? err.message : 'Payment could not be initiated.')
    }
  }

  const canManage = user?.role === 'mess_owner' || user?.role === 'admin'
  return (
    <>
      <PageHeader title="Mess Dining" eyebrow="North Campus Mess" {...(canManage ? { action: 'Add meal plan', onAction: () => setShowPlanForm(true) } : {})} />
      {showPlanForm && canManage && (
        <Card className="owner-publish-form">
          <h3>Publish a mess plan</h3>
          <div className="form-grid">
            <Field label="Mess name"><Input value={plan.name} onChange={(_, data) => setPlan({ ...plan, name: data.value })} /></Field>
            <Field label="Meal name"><Input value={plan.meal} onChange={(_, data) => setPlan({ ...plan, meal: data.value })} /></Field>
            <Field label="Menu"><Input value={plan.menu} onChange={(_, data) => setPlan({ ...plan, menu: data.value })} /></Field>
            <Field label="Serving time"><Input value={plan.time} onChange={(_, data) => setPlan({ ...plan, time: data.value })} /></Field>
            <Field label="Price"><Input type="number" value={plan.price} onChange={(_, data) => setPlan({ ...plan, price: data.value })} /></Field>
            <Field label="Meal image"><input className="native-file" type="file" accept="image/*" onChange={(event) => setPlanImage((event.target as HTMLInputElement).files?.[0] ?? null)} /></Field>
          </div>
          <div className="form-actions">
            <Button appearance="primary" onClick={addPlan} disabled={!plan.name || !plan.meal || !plan.menu || !plan.price}>Publish plan</Button>
            <Button appearance="subtle" onClick={() => setShowPlanForm(false)}>Cancel</Button>
          </div>
        </Card>
      )}
      <div className="mess-layout">
        <section className="meal-list">
          {meals.map((meal) => (
            <Card key={meal.id} className="meal-row">
              <img
                className="meal-row__image"
                src={resolveImageUrl(
                  meal.name === 'Dinner' && meal.image === 'https://images.unsplash.com/photo-1547592180-85f173990554?w=900'
                    ? 'https://images.unsplash.com/photo-1585937421612-70a008356fbe?w=900'
                    : meal.image,
                  FALLBACK_MEAL_IMAGE,
                )}
                onError={handleImageError(FALLBACK_MEAL_IMAGE)}
                alt={meal.name ?? meal.meal ?? 'Mess meal'}
              />
              <div>
                <span className="meal-time"><CalendarRegular /> {meal.time}</span>
                <h3>{meal.name ?? meal.meal}</h3>
                <p>{meal.menu}</p>
              </div>
              <div className="meal-row__meta">
                <strong>₹{meal.price ?? 0}</strong>
                <Badge appearance="tint" color="informative">★ {meal.rating ?? 4.5}</Badge>
                <Badge appearance="tint" color={meal.state === 'Serving' ? 'success' : meal.state === 'Upcoming' ? 'warning' : 'informative'}>{meal.state}</Badge>
              </div>
            </Card>
          ))}
        </section>
        <Card className="mess-plan">
          <h3>November meal plan</h3>
          <p>Vegetarian · 22 meals</p>
          <strong>₹2,800/month</strong>
          <Field label="Payment gateway">
            <select className="native-select" value={payMethod} onChange={(event) => setPayMethod(event.target.value as 'razorpay' | 'upi')}>
              <option value="razorpay">Razorpay Checkout</option>
              <option value="upi">Direct UPI QR</option>
            </select>
          </Field>
          <Button appearance="primary" disabled={user?.role !== 'student'} onClick={renew}>
            {user?.role === 'student' ? 'Pay & renew' : 'Students only'}
          </Button>
          {payMethod === 'upi' && upiIntent && (
            <div className="upi-actions">
              <Button appearance="primary" onClick={() => { window.location.href = upiIntent }}>Open UPI app</Button>
              {upiQr && <img className="upi-qr" src={upiQr} alt="UPI payment QR code" />}
              <span>Scan with Google Pay, PhonePe, Paytm or any UPI app.</span>
            </div>
          )}
          {payMethod === 'upi' && upiError && (
            <MessageBar intent="warning"><MessageBarBody>{upiError}. Set UPI_MERCHANT_VPA and restart the API.</MessageBarBody></MessageBar>
          )}
          {paymentMessage && (
            <MessageBar intent="info"><MessageBarBody>{paymentMessage}</MessageBarBody></MessageBar>
          )}
        </Card>
      </div>
    </>
  )
}

function MessagesPage() {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<string>('c1')
  const [draft, setDraft] = useState('')
  const [sentByThread, setSentByThread] = useState<Record<string, string[]>>({})

  const load = useCallback(() => {
    void api.listConversations().then(setConversations).finally(() => setLoading(false))
  }, [])
  useEffect(() => {
    load()
  }, [load])

  if (loading) return <><PageHeader title="Messages" /><LoadingGrid /></>
  if (conversations.length === 0) return <><PageHeader title="Messages" /><EmptyState title="No conversations" action="Refresh" onAction={load} /></>
  const active = conversations.find((conversation) => conversation.id === selected) ?? conversations[0]
  const sendMsg = () => {
    const text = draft.trim()
    if (!text || !active) return
    setSentByThread((cur) => ({ ...cur, [active.id]: [...(cur[active.id] ?? []), text] }))
    setDraft('')
  }

  return (
    <>
      <PageHeader title="Messages" eyebrow="Conversations and support" />
      <div className="message-layout">
        <Card className="conversation-list">
          {conversations.map((conversation) => (
            <button key={conversation.id} className={`conversation ${selected === conversation.id ? 'active' : ''}`} onClick={() => setSelected(conversation.id)}>
              <Avatar name={conversation.contact} />
              <div><strong>{conversation.contact}</strong><p>{conversation.subject}</p><span>{conversation.lastMessage}</span></div>
              {conversation.state === 'Unread' && <Badge appearance="filled" color="danger">Unread</Badge>}
            </button>
          ))}
        </Card>
        <Card className="thread">
          <div className="thread-header">
            <Avatar name={active?.contact ?? 'Support'} />
            <div><strong>{active?.contact}</strong><p>{active?.subject}</p></div>
          </div>
          <div className="thread-body">
            <div className="bubble incoming">{active?.lastMessage}</div>
            {(sentByThread[active.id] ?? []).map((msg, i) => (
              <div key={i} className="bubble outgoing">{msg}</div>
            ))}
          </div>
          <div className="thread-input">
            <Input
              value={draft}
              onChange={(_, d) => setDraft(d.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') sendMsg() }}
              placeholder="Write a message"
            />
            <Button appearance="primary" onClick={sendMsg}>Send</Button>
          </div>
        </Card>
      </div>
    </>
  )
}

function ThankYouToast() {
  const [message, setMessage] = useState('')
  useEffect(() => {
    const show = (event: Event) => {
      setMessage((event as CustomEvent<string>).detail || 'Thank you!')
      window.setTimeout(() => setMessage(''), 3500)
    }
    window.addEventListener('studenthub-thank', show)
    return () => window.removeEventListener('studenthub-thank', show)
  }, [])
  return message ? <div className="thank-toast"><CheckmarkCircleRegular /> <span>{message}</span></div> : null
}

function StudentSafetyFooter({ navigate }: { navigate: (path: string) => void }) {
  const links = [
    { label: 'National Emergency', value: '112', href: 'tel:112' },
    { label: 'Police', value: '100', href: 'tel:100' },
    { label: 'Women Helpline', value: '1091', href: 'tel:1091' },
    { label: 'Child Helpline', value: '1098', href: 'tel:1098' },
  ]
  return (
    <footer className="student-safety-footer">
      <div className="student-safety-footer__brand">
        <span className="brand-mark"><HatGraduationRegular /></span>
        <div><strong>StudentHub</strong><p>Student living, support and safety in one campus ecosystem.</p></div>
      </div>
      <div className="student-safety-footer__grid">
        <section>
          <h3>Explore</h3>
          <button type="button" className="footer-link-btn" onClick={() => navigate('/hostels')}>Find rooms</button>
          <button type="button" className="footer-link-btn" onClick={() => navigate('/roommates')}>Find roommates</button>
          <button type="button" className="footer-link-btn" onClick={() => navigate('/mess')}>Mess and dining</button>
          <button type="button" className="footer-link-btn" onClick={() => navigate('/marketplace')}>Student marketplace</button>
        </section>
        <section>
          <h3>Safety resources</h3>
          <a href="https://cybercrime.gov.in" target="_blank" rel="noreferrer">National Cyber Crime Portal</a>
          <a href="https://www.ncw.gov.in" target="_blank" rel="noreferrer">National Commission for Women</a>
          <a href="https://www.indiacode.nic.in" target="_blank" rel="noreferrer">India Code and citizen resources</a>
        </section>
        <section>
          <h3>Human help</h3>
          {links.map((link) => <a key={link.value} href={link.href}><span>{link.label}</span><strong>{link.value}</strong></a>)}
        </section>
      </div>
      <div className="student-safety-footer__bottom">
        <span>© 2026 StudentHub</span>
        <span>For emergencies, call 112 or contact local authorities.</span>
      </div>
    </footer>
  )
}

function AIChatWidget() {
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [messages, setMessages] = useState<{ role: 'user' | 'bot'; text: string }[]>([
    { role: 'bot', text: 'Tell me your room budget, preferred area, safety needs, sleep schedule, study style, diet, or hobbies.' },
  ])

  useEffect(() => {
    const openAssistant = (event: Event) => {
      setOpen(true)
      const prompt = (event as CustomEvent<string>).detail
      if (prompt) {
        setMessage(prompt)
        void api
          .aiChat(prompt)
          .then((reply) => setMessages((current) => [...current, { role: 'user', text: prompt }, { role: 'bot', text: reply }]))
          .catch(() => setMessages((current) => [...current, { role: 'bot', text: 'The assistant is temporarily unavailable.' }]))
      }
    }
    window.addEventListener('studenthub-ai-open', openAssistant)
    return () => window.removeEventListener('studenthub-ai-open', openAssistant)
  }, [])

  const send = async () => {
    const text = message.trim()
    if (!text) return
    setMessage('')
    setMessages((current) => [...current, { role: 'user', text }])
    try {
      const reply = await api.aiChat(text)
      setMessages((current) => [...current, { role: 'bot', text: reply }])
    } catch {
      setMessages((current) => [...current, { role: 'bot', text: 'The assistant is temporarily unavailable.' }])
    }
  }

  return (
    <div className="ai-bot">
      <button className="ai-bot__toggle" onClick={() => setOpen((value) => !value)} aria-label="Open AI assistant">
        <span>AI</span><small>Ask</small>
      </button>
      {open && (
        <Card className="ai-bot__panel">
          <div className="ai-bot__header">
            <div><span className="ai-bot__status"></span><strong>StudentHub AI</strong><small>Campus assistant</small></div>
            <Button appearance="subtle" onClick={() => setOpen(false)}>Close</Button>
          </div>
          <div className="ai-bot__prompts">
            <button type="button" onClick={() => setMessage('Find an affordable room near my campus')}>Affordable room</button>
            <button type="button" onClick={() => setMessage('Find a compatible roommate')}>Find roommate</button>
            <button type="button" onClick={() => setMessage('Compare mess plans')}>Compare mess</button>
          </div>
          <div className="ai-bot__messages">
            {messages.map((item, index) => <div key={index} className={`bubble ${item.role === 'bot' ? 'incoming' : 'outgoing'}`}>{item.text}</div>)}
          </div>
          <div className="ai-bot__input">
            <Input value={message} onChange={(_, data) => setMessage(data.value)} onKeyDown={(event) => { if (event.key === 'Enter') void send() }} placeholder="Ask about rooms, mess or safety" />
            <Button appearance="primary" onClick={send}>Send</Button>
          </div>
        </Card>
      )}
    </div>
  )
}

function LoginView({ onLogin, onCreate }: { onLogin: (email: string, password: string) => Promise<void>; onCreate: () => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const submit = async () => {
    setBusy(true)
    setError('')
    try {
      await onLogin(email, password)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to sign in.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="auth-page">
      <Card className="auth-card">
        <div className="brand auth-brand"><span className="brand-mark"><HatGraduationRegular /></span><strong>StudentHub</strong></div>
        <h1>Welcome back</h1>
        <p>Sign in to your student services account.</p>
        <Field label="Email"><Input type="email" value={email} onChange={(_, data) => setEmail(data.value)} /></Field>
        <Field label="Password"><Input type="password" value={password} onChange={(_, data) => setPassword(data.value)} onKeyDown={(e) => { if (e.key === 'Enter' && email && password.length >= 6) void submit() }} /></Field>
        {error && <MessageBar intent="error"><MessageBarBody>{error}</MessageBarBody></MessageBar>}
        <Button appearance="primary" disabled={busy || !email || password.length < 6} onClick={submit}>{busy ? 'Signing in…' : 'Sign in'}</Button>
        <Button appearance="subtle" onClick={onCreate}>Create account</Button>
      </Card>
    </div>
  )
}

function CreateAccountView({ onCreated, onCancel }: { onCreated: (user: User) => Promise<void>; onCancel: () => void }) {
  const [name, setName] = useState('')
  const [nameTouched, setNameTouched] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<User['role']>('student')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const submit = async () => {
    setNameTouched(true)
    if (!name || !email.includes('@') || password.length < 6) {
      setError('Enter a name, valid email, and password of at least 6 characters.')
      return
    }
    setBusy(true)
    setError('')
    try {
      const created = await api.createAccount({ name, email, password, role })
      await onCreated(created)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'This account could not be created.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="auth-page">
      <Card className="auth-card">
        <h1>Create account</h1>
        <p>Join StudentHub as a student, seller, or service owner.</p>
        <Field label="Account type">
          <select className="native-select" value={role} onChange={(event) => setRole(event.target.value as User['role'])}>
            <option value="student">Student</option>
            <option value="hostel_owner">Room / hostel owner</option>
            <option value="mess_owner">Mess owner</option>
            <option value="seller">Seller</option>
          </select>
        </Field>
        <Field label="Full name" validationState={nameTouched && !name ? 'warning' : 'none'} validationMessage={nameTouched && !name ? 'Full name is required' : undefined}>
          <Input value={name} onBlur={() => setNameTouched(true)} onChange={(_, data) => setName(data.value)} />
        </Field>
        <Field label="Email"><Input type="email" value={email} onChange={(_, data) => setEmail(data.value)} /></Field>
        <Field label="Password"><Input type="password" value={password} onChange={(_, data) => setPassword(data.value)} /></Field>
        {error && <MessageBar intent="error"><MessageBarBody>{error}</MessageBarBody></MessageBar>}
        <Button appearance="primary" disabled={busy} onClick={submit}>{busy ? 'Creating…' : 'Create account'}</Button>
        <Button appearance="subtle" icon={<DismissRegular />} onClick={onCancel}>Back to sign in</Button>
      </Card>
    </div>
  )
}

export default App
