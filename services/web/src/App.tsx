import { useEffect, useState } from 'react'
import {
  Avatar, Badge, Button, Card, CardFooter, CardHeader, CardPreview, Field, Input,
  MessageBar, MessageBarBody, Skeleton, SkeletonItem, Tab, TabList, Textarea, Toolbar,
  ToolbarButton
} from '@fluentui/react-components'
import {
  BookmarkRegular, BuildingRegular, CalendarRegular, ChatRegular, CheckmarkCircleRegular,
  DismissRegular, HatGraduationRegular, HomeRegular, MailRegular, PeopleRegular, SearchRegular,
  ShoppingBagRegular, SignOutRegular, FoodRegular
} from '@fluentui/react-icons'
import QRCode from 'qrcode'
import { LiveCampusWidget } from './LiveCampusWidget'
import { api } from './api'
import type { Conversation, Hostel, Listing, LivingCombination, Meal, Roommate, RoomComparison, User } from './types/entities'
import './App.css'

const routes = [
  { path: '/', label: 'Dashboard', icon: <HomeRegular /> },
  { path: '/hostels', label: 'Find Rooms', icon: <BuildingRegular /> },
  { path: '/roommates', label: 'Find Roommates', icon: <PeopleRegular /> },
  { path: '/mess', label: 'Find Mess', icon: <FoodRegular /> },
  { path: '/marketplace', label: 'Marketplace', icon: <ShoppingBagRegular /> },
  { path: '/ai', label: 'AI Assistant', icon: <ChatRegular /> },
  { path: '/bookings', label: 'My Bookings', icon: <CalendarRegular /> },
  { path: '/saved', label: 'Saved Listings', icon: <BookmarkRegular /> },
  { path: '/payments', label: 'Payments', icon: <ChatRegular /> },
  { path: '/owner', label: 'Owner Dashboard', icon: <BuildingRegular /> },
  { path: '/profile', label: 'Profile', icon: <PeopleRegular /> },
  { path: '/settings', label: 'Settings', icon: <SearchRegular /> },
  { path: '/messages', label: 'Messages', icon: <MailRegular /> }
]

function usePath(): [string, (path: string) => void] {
  const [path, setPath] = useState(window.location.pathname)
  const navigate = (next: string) => {
    window.history.pushState({}, '', next)
    setPath(next)
  }
  useEffect(() => {
    const pop = () => setPath(window.location.pathname)
    window.addEventListener('popstate', pop)
    return () => window.removeEventListener('popstate', pop)
  }, [])
  return [path, navigate]
}

function LoadingGrid() {
  return <div className="content-grid">{[1,2,3].map((item) => <Card key={item}><Skeleton><SkeletonItem size={128} /><SkeletonItem /><SkeletonItem /></Skeleton></Card>)}</div>
}

function EmptyState({ title, action }: { title: string, action: string }) {
  return <Card className="empty-state"><SearchRegular /><h3>{title}</h3><p>Try another filter or check back soon.</p><Button appearance="primary">{action}</Button></Card>
}

function ErrorState({ retry }: { retry: () => void }) {
  return <MessageBar intent="error"><MessageBarBody>Student services are temporarily unavailable.</MessageBarBody><Button appearance="secondary" onClick={retry}>Retry</Button></MessageBar>
}

function App() {
  const [path, navigate] = usePath()
  const [user, setUser] = useState<User | null>(null)
  const [authView, setAuthView] = useState<'app' | 'login' | 'create'>('app')

  useEffect(() => { api.getCurrentUser().then(next => { setUser(next); if (next.role !== 'student') navigate('/owner') }).catch(() => setAuthView('login')) }, [])
  useEffect(() => {
    if (path === '/ai') window.setTimeout(() => window.dispatchEvent(new CustomEvent('studenthub-ai-open')), 100)
  }, [path])

  if (authView === 'login') return <LoginView onLogin={async (email, password) => { const next = await api.login({ email, password }); setUser(next); setAuthView('app'); if (next.role !== 'student') navigate('/owner'); window.dispatchEvent(new CustomEvent('studenthub-thank', { detail: `Welcome back, ${next.name}. Thank you for signing in!` })) }} onCreate={() => setAuthView('create')} />
  if (authView === 'create') return <CreateAccountView onCreated={async (created) => { setUser(created); setAuthView('app'); if (created.role !== 'student') navigate('/owner'); window.dispatchEvent(new CustomEvent('studenthub-thank', { detail: `Thank you, ${created.name}. Your account is ready!` })) }} onCancel={() => setAuthView('login')} />

  return <div className="app-shell">
    <header className="app-header">
      <button className="brand" onClick={() => navigate('/')}><span className="brand-mark"><HatGraduationRegular /></span><span>StudentHub</span></button>
      <Toolbar><ToolbarButton aria-label="Messages" icon={<ChatRegular />} onClick={() => navigate('/messages')} /><Avatar name={user?.name ?? 'Student'} initials={user?.name?.split(' ').map(part => part[0]).join('').slice(0, 2).toUpperCase() ?? 'ST'} /><div className="user-identity"><span className="user-name">{user?.name ?? 'Student'}</span>{user && user.role !== 'student' && <Badge appearance="tint" color="informative">{user.role === 'hostel_owner' ? 'Room owner' : user.role === 'mess_owner' ? 'Mess owner' : 'Seller'}</Badge>}</div><ToolbarButton aria-label="Sign out" icon={<SignOutRegular />} onClick={async () => { await api.logout(); setUser(null); setAuthView('login') }} /></Toolbar>
    </header>
    <ThankYouToast />
    <div className="app-body">
      <aside className="sidebar"><div className="sidebar-label">Student services</div><TabList vertical selectedValue={path} onTabSelect={(_, data) => navigate(String(data.value))}>{routes.filter(route => route.path !== '/owner' || (user && user.role !== 'student')).map((route) => <Tab key={route.path} value={route.path} icon={route.icon}>{route.label}</Tab>)}</TabList></aside>
      <main className="main-content">
        {path === '/' && <><LiveCampusWidget /><StudentFeatureMarquee /><Dashboard navigate={navigate} user={user} /></>}
        {path === '/hostels' && <HostelsPage user={user} />}
        {path === '/roommates' && <RoommatesPage />}
        {path === '/mess' && <MessPage user={user} />}
        {path === '/marketplace' && <MarketplacePage user={user} />}
        {path === '/ai' && <UtilityPage key="ai" title="StudentHub AI" eyebrow="Ask, compare and decide" navigate={navigate} />}
        {path === '/bookings' && <UtilityPage key="bookings" title="My bookings" eyebrow="Stay and service requests" navigate={navigate} />}
        {path === '/saved' && <UtilityPage key="saved" title="Saved listings" eyebrow="Rooms and products you saved" navigate={navigate} />}
        {path === '/payments' && <UtilityPage key="payments" title="Payments" eyebrow="Payment history and pending activity" navigate={navigate} />}
        {path === '/owner' && (user && user.role !== 'student' ? <OwnerDashboard user={user} /> : <Card className="owner-locked"><div className="owner-locked__icon"><BuildingRegular /></div><h2>Owner access required</h2><p>Only room owners, mess owners, and sellers can manage listings, approvals, and payment history.</p><Button appearance="primary" onClick={() => navigate('/')}>Return to dashboard</Button></Card>)}
        {path === '/profile' && <UtilityPage key="profile" title="Profile" eyebrow="Student preferences and account" navigate={navigate} />}
        {path === '/settings' && <UtilityPage key="settings" title="Settings" eyebrow="Campus, privacy and notifications" navigate={navigate} />}
        {path === '/messages' && <MessagesPage />}
      </main>
    </div>
    <StudentSafetyFooter />
    <AIChatWidget />
  </div>
}

function StudentFeatureMarquee() {
  const features = ['Zero-broker living', 'Verified student community', 'Roommate compatibility', 'Mess comparisons', 'Campus essentials', 'Safety resources', 'Owner-managed listings']
  return <section className="student-marquee" aria-label="StudentHub features"><div className="student-marquee__track">{[...features, ...features].map((feature, index) => <span key={`${feature}-${index}`}><b>0{(index % features.length) + 1}</b>{feature}</span>)}</div></section>
}

function HowItWorks() {
  const steps = [
    { number: '01', title: 'Discover', text: 'Search rooms, mess services and student listings by location, budget and facilities.' },
    { number: '02', title: 'Compare', text: 'Review monthly costs, preferences, amenities and the details that matter to you.' },
    { number: '03', title: 'Connect', text: 'Contact an owner or seller and keep messages and requests in StudentHub.' },
    { number: '04', title: 'Move with clarity', text: 'Track requests and manage student living decisions from one dashboard.' },
  ]
  return <section className="how-it-works"><div className="how-it-works__heading"><span className="eyebrow">How StudentHub works</span><h2>From search to a student-ready plan</h2><p>Four clear steps for finding, comparing and connecting with student services.</p></div><div className="how-it-works__grid">{steps.map(step => <article key={step.number}><span>{step.number}</span><h3>{step.title}</h3><p>{step.text}</p></article>)}</div></section>
}

function OwnerDashboard({ user }: { user: User | null }) {
  type OwnerRequest = { id: string; studentId: string; targetName: string; moveIn: string; duration: string; status: 'Pending' | 'Approved' | 'Declined' }
  const [requests, setRequests] = useState<OwnerRequest[]>([])
  const [listings, setListings] = useState<Hostel[]>([])
  const [messPlans, setMessPlans] = useState<{ id: string; title: string; meal: string; price: number }[]>([])
  const [marketListings, setMarketListings] = useState<{ id: string; title: string; price: number }[]>([])
  const [payments, setPayments] = useState<{ purpose: string; amount: number; status: string }[]>([])
  const role = user?.role
  const load = () => {
    void api.getOwnerDashboard().then(data => {
      const mapped: OwnerRequest[] = []
      for (const request of data.requests) {
        mapped.push({
          id: request.id,
          studentId: request.studentId,
          targetName: request.targetName,
          moveIn: request.moveIn,
          duration: request.duration,
          status: request.status === 'Approved' ? 'Approved' : request.status === 'Declined' ? 'Declined' : 'Pending',
        })
      }
      setRequests(mapped)
      setListings(data.roomListings.map(item => ({ id: item.id, name: item.title, area: item.area, rent: item.price, rating: 0, verified: false })) as Hostel[])
      setMessPlans(data.messListings)
      setMarketListings(data.marketListings)
      setPayments(data.payments)
    }).catch(() => {
      setRequests([])
      setListings([])
      setMessPlans([])
      setMarketListings([])
      setPayments([])
    })
  }
  useEffect(load, [])

  const updateRequest = (id: string, status: OwnerRequest['status']) => {
    void api.updateOwnerRequest(id, status.toLowerCase() as 'pending' | 'approved' | 'declined').then(load).catch(() => undefined)
  }

  const pending = requests.filter(request => request.status === 'Pending').length
  const approved = requests.filter(request => request.status === 'Approved').length
  const title = role === 'mess_owner' ? 'Mess business overview' : role === 'seller' ? 'Marketplace seller overview' : 'Room owner overview'
  const activeListings = role === 'mess_owner' ? messPlans.length : role === 'seller' ? marketListings.length : listings.length
  const completedValue = payments.filter(payment => payment.status === 'completed').reduce((sum, payment) => sum + payment.amount, 0)
  if (role === 'student') return <Card className="owner-locked"><div className="owner-locked__icon"><BuildingRegular /></div><h2>Owner access required</h2><p>This workspace is available only to room owners, mess owners, and sellers.</p></Card>
  return <div className="owner-dashboard"><div className="owner-dashboard__header"><div><span className="eyebrow">{role === 'mess_owner' ? 'Mess owner workspace' : role === 'seller' ? 'Seller workspace' : 'Room owner workspace'}</span><h1>{title}</h1><p>Listings, requests, approvals and account activity in one place.</p></div><Button appearance="primary" icon={<BuildingRegular />} onClick={() => window.location.pathname = role === 'mess_owner' ? '/mess' : role === 'seller' ? '/marketplace' : '/hostels'}>Manage listings</Button></div>
    <section className="owner-stat-grid"><Card><span>Active listings</span><strong>{activeListings}</strong><small>Published in StudentHub</small></Card><Card><span>Pending requests</span><strong>{pending}</strong><small>Waiting for your response</small></Card><Card><span>Approved</span><strong>{approved}</strong><small>Confirmed student requests</small></Card><Card><span>Request volume</span><strong>{requests.length}</strong><small>All recorded requests</small></Card></section>
    <section className="owner-request-panel"><div className="section-heading"><div><span className="eyebrow">Student requests</span><h2>Recent booking requests</h2></div><Badge appearance="tint" color="warning">{pending} pending</Badge></div><div className="owner-request-list">{requests.map(request => <article className="owner-request-row" key={request.id}><Avatar name={`Student ${request.studentId}`} /><div className="owner-request__student"><strong>Student #{request.studentId}</strong><span>{request.targetName}</span></div><div><span>Move-in</span><strong>{request.moveIn}</strong></div><div><span>Duration</span><strong>{request.duration}</strong></div><Badge appearance="tint" color={request.status === 'Approved' ? 'success' : request.status === 'Declined' ? 'danger' : 'warning'}>{request.status}</Badge><div className="owner-request__actions">{request.status === 'Pending' ? <><Button appearance="primary" onClick={() => updateRequest(request.id, 'Approved')}>Approve</Button><Button appearance="subtle" onClick={() => updateRequest(request.id, 'Declined')}>Decline</Button></> : <Button appearance="subtle" onClick={() => updateRequest(request.id, 'Pending')}>Reset</Button>}</div></article>)}</div></section>
    <section className="owner-payment-panel"><div className="section-heading"><div><span className="eyebrow">Payment activity</span><h2>Payment history</h2></div><div className="owner-payment-summary"><span>Collected</span><strong>₹{completedValue.toLocaleString('en-IN')}</strong></div></div>{payments.length ? <div className="owner-payment-list">{payments.map((payment, index) => <article key={`${payment.purpose}-${index}`}><div><strong>{payment.purpose}</strong><span>StudentHub transaction</span></div><strong>₹{payment.amount.toLocaleString('en-IN')}</strong><Badge appearance="tint" color={payment.status === 'completed' ? 'success' : 'warning'}>{payment.status}</Badge></article>)}</div> : <Card className="owner-empty-payments">No payment activity yet. Completed and pending transactions appear here.</Card>}</section>
  </div>
}

function UtilityPage({ title, eyebrow, navigate }: { title: string, eyebrow: string, navigate: (path: string) => void }) {
  const isPayments = title === 'Payments'
  const isSaved = title === 'Saved listings'
  const isProfile = title === 'Profile'
  const isSettings = title === 'Settings'
  const isBookings = title === 'My bookings'
  const isAI = title === 'StudentHub AI'
  return <><PageHeader title={title} eyebrow={eyebrow} />
    <div className="utility-grid">
      <Card className="utility-feature">
        {isPayments && <><h2>Payment overview</h2><p>Review checkout attempts, pending requests and completed activity.</p><Button appearance="primary" onClick={() => navigate('/mess')}>View mess plans</Button></>}
        {isSaved && <><h2>Your saved shortlist</h2><p>Compare saved rooms and marketplace items without losing your place in the search.</p><Button appearance="primary" onClick={() => navigate('/hostels')}>Find rooms</Button></>}
        {isProfile && <><h2>Student profile</h2><p>Keep your course, budget and living preferences current to improve recommendations.</p><Button appearance="primary" onClick={() => navigate('/roommates')}>Update match preferences</Button></>}
        {isSettings && <><h2>Experience preferences</h2><p>Campus selection, privacy choices and notification preferences are stored locally in this prototype.</p><Button appearance="primary" onClick={() => navigate('/')}>Choose campus</Button></>}
        {isBookings && <><h2>Active requests</h2><p>Booking and service-request history will appear here as workflows are completed.</p><Button appearance="primary" onClick={() => navigate('/hostels')}>Browse rooms</Button></>}
        {isAI && <><h2>AI campus assistant</h2><p>The assistant compares rooms, roommate profiles, mess options and marketplace data using StudentHub&apos;s available information.</p><Button appearance="primary" onClick={() => window.dispatchEvent(new CustomEvent('studenthub-ai-open', { detail: 'Help me plan an affordable student living setup' }))}>Open assistant</Button></>}
      </Card>
    </div>
  </>
}

function PageHeader({ title, eyebrow, action, onAction }: { title: string, eyebrow?: string, action?: string, onAction?: () => void }) {
  return <div className="page-header"><div>{eyebrow && <div className="eyebrow">{eyebrow}</div>}<h1>{title}</h1></div>{action && <Button appearance="primary" icon={<SearchRegular />} onClick={onAction}>{action}</Button>}</div>
}

function Dashboard({ navigate, user }: { navigate: (path: string) => void, user: User | null }) {
  const [hostels, setHostels] = useState<Hostel[]>([])
  const [roommates, setRoommates] = useState<Roommate[]>([])
  const [meals, setMeals] = useState<Meal[]>([])
  const [listings, setListings] = useState<Listing[]>([])
  const [combinations, setCombinations] = useState<LivingCombination[]>([])
  const [monthlyBudget, setMonthlyBudget] = useState('')
  const [, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const load = () => {
    setLoading(true)
    setError(false)
    void Promise.allSettled([
      api.listHostels(),
      api.listRoommates(),
      api.getMessMenu(),
      api.listListings(),
      api.getCombinations(monthlyBudget ? Number(monthlyBudget) : undefined),
    ]).then(results => {
      const [hostelResult, roommateResult, mealResult, listingResult, combinationResult] = results
      if (hostelResult.status === 'fulfilled') setHostels(hostelResult.value)
      if (roommateResult.status === 'fulfilled') setRoommates(roommateResult.value)
      if (mealResult.status === 'fulfilled') setMeals(mealResult.value)
      if (listingResult.status === 'fulfilled') setListings(listingResult.value)
      if (combinationResult.status === 'fulfilled') setCombinations(combinationResult.value.combinations)
      setLoading(false)
      if (results.every(result => result.status === 'rejected')) setError(true)
    })
  }
  useEffect(load, [])
  const firstName = user?.name?.split(' ')[0] ?? 'Student'
  if (error) return <><PageHeader title={`Good morning, ${firstName}`} /><ErrorState retry={load} /></>
  return <>
    <section className="dashboard-hero">
      <div className="dashboard-hero__mesh" aria-hidden="true" />
      <div className="dashboard-hero__content">
        <div className="eyebrow dashboard-hero__eyebrow">AITD Kanpur · One platform for student living</div>
        <h1>Good morning, {firstName}</h1>
        <p>Your room search is progressing, dinner is planned, and there are new people worth meeting.</p>
        <div className="dashboard-hero__actions">
          <Button appearance="primary" icon={<SearchRegular />} onClick={() => navigate('/hostels')}>Find a room</Button>
          <Button appearance="secondary" onClick={() => navigate('/roommates')}>Review matches</Button>
        </div>
      </div>
      <div className="dashboard-hero__summary">
        <span>Today&apos;s plan</span>
        <strong>3 tasks ready</strong>
        <div><CalendarRegular /> Dinner · 7:30 PM</div>
      </div>
    </section>
    <section className="kpi-grid">
      <Card className="kpi"><div className="kpi-label"><span>Available rooms</span><BuildingRegular /></div><strong>{hostels.length} rooms listed</strong><Badge appearance="tint" color="success">{hostels.filter(item => item.verified).length} verified</Badge></Card>
      <Card className="kpi"><div className="kpi-label"><span>Mess services</span><FoodRegular /></div><strong>{meals.length ? `${meals.length} meal options` : 'No menu loaded'}</strong><span>{meals.find(item => item.state === 'Serving')?.menu ?? 'View today&apos;s menu'}</span></Card>
      <Card className="kpi"><div className="kpi-label"><span>Roommate matches</span><PeopleRegular /></div><strong>{roommates.length} compatible profiles</strong><Badge appearance="tint" color="warning">{roommates.filter(item => item.match >= 90).length} high confidence</Badge></Card>
      <Card className="kpi"><div className="kpi-label"><span>Marketplace</span><BookmarkRegular /></div><strong>{listings.length} listings</strong><span>{Math.max(0, Number(JSON.parse(localStorage.getItem('studenthub.savedStays') ?? '[]').length))} saved stays</span></Card>
    </section>
    <section className="decision-engine"><div className="section-heading"><div><span className="eyebrow">Recommended StudentHub package</span><h2>Best complete living combination</h2></div><div className="budget-picker"><Field label="Monthly living budget"><Input type="number" value={monthlyBudget} onChange={(_, data) => setMonthlyBudget(data.value)} placeholder="15000" /></Field><Button appearance="primary" onClick={load}>Recalculate</Button></div></div>{combinations[0] ? <Card className="decision-card"><div className="decision-card__main"><Badge appearance="tint" color="success">Decision score {combinations[0].decisionScore}/100</Badge><h3>{combinations[0].room.name} + {combinations[0].roommate.name} + {combinations[0].mess.name}</h3><p>{combinations[0].room.area} · Roommate match {combinations[0].roommate.match}% · Safety {combinations[0].safetyScore}/100</p><div className="freshness-row"><Badge>{combinations[0].availability}</Badge><Badge>{combinations[0].freshness}</Badge><Badge>{combinations[0].room.verified ? 'Verified housing' : 'Not verified'}</Badge></div></div><div className="cost-breakdown"><strong>₹{combinations[0].monthlyCost.total.toLocaleString('en-IN')} / month</strong>{[['Room', combinations[0].monthlyCost.room], ['Mess', combinations[0].monthlyCost.mess], ['Transport', combinations[0].monthlyCost.transport], ['Essentials', combinations[0].monthlyCost.essentials]].map(([label, amount]) => <div key={String(label)}><span>{label}</span><b>₹{Number(amount).toLocaleString('en-IN')}</b></div>)}</div></Card> : <Card className="decision-card"><div className="decision-card__main"><Badge appearance="tint" color="warning">Budget too low</Badge><h3>No package fits ₹{monthlyBudget ? Number(monthlyBudget).toLocaleString('en-IN') : '0'} per month</h3><p>The cheapest complete package currently costs ₹14,000 per month. Try ₹14,000 or more, or recalculate after listings are updated.</p></div></Card>}</section>
    <section className="assistant-banner"><div><span className="eyebrow">StudentHub AI</span><h2>Find the right option at the lowest price</h2><p>Compare rooms, roommates, mess plans, and essentials in one conversation.</p></div><div className="assistant-banner__actions"><Button appearance="primary" onClick={() => window.dispatchEvent(new CustomEvent('studenthub-ai-open', { detail: 'Find me the lowest price room with good safety and amenities' }))}>Ask for the best room</Button><Button appearance="secondary" onClick={() => window.dispatchEvent(new CustomEvent('studenthub-ai-open', { detail: 'Find me a roommate matching my sleep, study, diet and hobbies' }))}>Find my roommate</Button></div></section>
    <HowItWorks />
    <section><div className="section-heading"><h2>Your next steps</h2><span>Updated just now</span></div><div className="content-grid">
      {hostels.slice(0,1).map((hostel) => <Card key={hostel.id}><CardHeader header={<strong>{hostel.name}</strong>} action={<Badge appearance="tint" color={hostel.verified ? 'success' : 'warning'}>{hostel.verified ? 'Listed' : 'Owner listed'}</Badge>} /><CardPreview><img className="card-image" src={hostel.image} alt={hostel.name} /></CardPreview><CardFooter><Button appearance="primary" onClick={() => navigate('/hostels')}>View room</Button><Button icon={<BookmarkRegular />} aria-label="Save listing" /></CardFooter></Card>)}
      {meals.slice(2,3).map((meal) => <Card key={meal.id}><CardHeader header={<strong>Dinner tonight</strong>} action={<Badge appearance="tint" color="warning">Upcoming</Badge>} /><div className="card-copy"><h3>North Campus Mess</h3><p>{meal.menu}</p><span>7:30–9:30 PM</span></div><CardFooter><Button appearance="secondary" onClick={() => navigate('/mess')}>View mess plan</Button></CardFooter></Card>)}
      {roommates.slice(0,1).map((match) => <Card key={match.id}><CardHeader header={<strong>Top roommate match</strong>} action={<Badge appearance="tint" color="warning">{match.match}%</Badge>} /><div className="person-row"><Avatar name={match.name} image={{ src: match.avatar }} /><div><strong>{match.name}</strong><p>{match.course} · {match.budget}</p></div></div><CardFooter><Button appearance="primary" onClick={() => navigate('/roommates')}>Review match</Button></CardFooter></Card>)}
      {listings.slice(0,1).map((listing) => <Card key={listing.id}><CardHeader header={<strong>Marketplace listing</strong>} action={<Badge>{listing.condition}</Badge>} /><div className="card-copy"><h3>{listing.title}</h3><p>{listing.seller} · ₹{listing.price.toLocaleString('en-IN')}</p><Badge appearance="tint" color="success">Student listing</Badge></div><CardFooter><Button appearance="secondary" onClick={() => navigate('/marketplace')}>Open marketplace</Button></CardFooter></Card>)}
    </div></section>
    <StudentDropdownTools />
    <FeatureStatus />
  </>
}

function StudentDropdownTools() {
  const [expense, setExpense] = useState('')
  const [amount, setAmount] = useState('')
  const [people, setPeople] = useState('2')
  const [distance, setDistance] = useState('5')
  const [movingEstimate, setMovingEstimate] = useState<number | null>(null)
  const [verificationEmail, setVerificationEmail] = useState('')
  const [complaint, setComplaint] = useState('')
  const [payments, setPayments] = useState<{ id: string; purpose: string; amount: number; method: string; status: string }[]>([])
  const [supportRequests, setSupportRequests] = useState<{ id: string; subject: string; status: string }[]>([])

  useEffect(() => {
    api.listPayments().then(setPayments).catch(() => setPayments([]))
    api.listSupport().then(setSupportRequests).catch(() => setSupportRequests([]))
  }, [])

  const splitAmount = amount && people ? Number(amount) / Number(people) : 0
  const complaintText = complaint.trim()

  const submitComplaint = () => {
    if (!complaintText) return
    void api.addSupport({ subject: 'Student service assistance', description: complaintText }).then(() => {
      setComplaint('')
      api.listSupport().then(setSupportRequests).catch(() => undefined)
      window.dispatchEvent(new CustomEvent('studenthub-thank', { detail: 'Your complaint request was recorded.' }))
    }).catch(() => window.dispatchEvent(new CustomEvent('studenthub-thank', { detail: 'Sign in to submit a complaint request.' })))
  }

  const verificationStatus = verificationEmail.toLowerCase().includes('.edu') || verificationEmail.toLowerCase().includes('.ac.') || verificationEmail.toLowerCase().includes('@college.')

  return <section className="dropdown-tools"><div className="section-heading"><div><span className="eyebrow">Student tools</span><h2>Everything you need after choosing a stay</h2></div><span>Expandable assistant panels</span></div><div className="dropdown-tools__grid">
    <details className="tool-dropdown" open><summary><span className="tool-dropdown__icon">LC</span><span><strong>Lifestyle compatibility</strong><small>Sleep, study, diet and habits</small></span></summary><div className="tool-dropdown__body"><div className="compatibility-list"><div><span>Sleep schedule</span><b>Matched</b></div><div><span>Study style</span><b>Matched</b></div><div><span>Food preference</span><b>Review</b></div><div><span>Shared hobbies</span><b>Possible match</b></div></div><Button appearance="primary" onClick={() => window.location.pathname = '/roommates'}>Open roommate matching</Button></div></details>
    <details className="tool-dropdown"><summary><span className="tool-dropdown__icon">EN</span><span><strong>Emergency student network</strong><small>Campus and trusted personal contacts</small></span></summary><div className="tool-dropdown__body"><div className="emergency-links"><a href="tel:112"><span>National emergency</span><strong>112</strong></a><a href="tel:1091"><span>Women helpline</span><strong>1091</strong></a><a href="tel:1098"><span>Child helpline</span><strong>1098</strong></a></div><Field label="Trusted contact name"><Input placeholder="Parent or friend" /></Field><Field label="Contact number"><Input type="tel" placeholder="+91" /></Field><Button appearance="primary">Add trusted contact</Button></div></details>
    <details className="tool-dropdown"><summary><span className="tool-dropdown__icon">SE</span><span><strong>Shared expenses</strong><small>Split rent and mess costs clearly</small></span></summary><div className="tool-dropdown__body"><div className="split-expense-form"><Field label="Expense"><Input value={expense} onChange={(_, data) => setExpense(data.value)} placeholder="Rent or groceries" /></Field><Field label="Amount"><Input type="number" value={amount} onChange={(_, data) => setAmount(data.value)} placeholder="2400" /></Field><Field label="People"><Input type="number" value={people} onChange={(_, data) => setPeople(data.value)} /></Field></div>{amount && people && <div className="expense-result"><span>Each person pays</span><strong>₹{splitAmount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</strong></div>}</div></details>
    <details className="tool-dropdown"><summary><span className="tool-dropdown__icon">CA</span><span><strong>Complaint assistant</strong><small>Draft and record a clear request</small></span></summary><div className="tool-dropdown__body"><Field label="Describe the issue"><Textarea value={complaint} onChange={(_, data) => setComplaint(data.value)} placeholder="Water, safety, mess quality or landlord issue" /></Field><Button appearance="primary" onClick={submitComplaint} disabled={!complaintText}>Submit complaint</Button>{supportRequests.slice(0, 3).map(item => <div className="support-request-row" key={item.id}><strong>{item.subject}</strong><Badge>{item.status}</Badge></div>)}</div></details>
    <details className="tool-dropdown"><summary><span className="tool-dropdown__icon">SM</span><span><strong>Smart moving assistant</strong><small>Estimate a basic local move</small></span></summary><div className="tool-dropdown__body"><Field label="Distance in km"><Input type="number" value={distance} onChange={(_, data) => setDistance(data.value)} /></Field><Button appearance="primary" onClick={() => setMovingEstimate(Math.round(800 + Number(distance || 0) * 160))}>Calculate estimate</Button>{movingEstimate !== null && <div className="expense-result"><span>Estimated local moving cost</span><strong>₹{movingEstimate.toLocaleString('en-IN')}</strong></div>}</div></details>
    <details className="tool-dropdown"><summary><span className="tool-dropdown__icon">CV</span><span><strong>College community check</strong><small>Format check only, not official verification</small></span></summary><div className="tool-dropdown__body"><Field label="Institutional email"><Input type="email" value={verificationEmail} onChange={(_, data) => setVerificationEmail(data.value)} placeholder="name@college.edu" /></Field>{verificationEmail && <Badge appearance="tint" color={verificationStatus ? 'success' : 'warning'}>{verificationStatus ? 'Recognized format · Not officially verified' : 'Format not recognized · No official claim'}</Badge>}</div></details>
    <details className="tool-dropdown"><summary><span className="tool-dropdown__icon">PY</span><span><strong>Payment account</strong><small>UPI request and account share</small></span></summary><div className="tool-dropdown__body"><Field label="Account name"><Input placeholder="Your name or business" /></Field><Field label="UPI ID"><Input placeholder="name@bank" /></Field><Button appearance="primary" onClick={() => window.location.pathname = '/mess'}>Open payment page</Button></div></details>
    <details className="tool-dropdown"><summary><span className="tool-dropdown__icon">HH</span><span><strong>Payment and booking history</strong><small>{payments.length} payments · recent requests</small></span></summary><div className="tool-dropdown__body">{payments.length ? payments.slice(0, 5).map(payment => <div className="history-row" key={payment.id}><div><strong>{payment.purpose}</strong><span>{payment.method.toUpperCase()} · {payment.status}</span></div><b>₹{payment.amount.toLocaleString('en-IN')}</b></div>) : <div className="tool-empty">No payment history yet.</div>}<div className="history-row"><div><strong>Room request examples</strong><span>Owner approval workflow</span></div><b>Draft</b></div><Button appearance="secondary" onClick={() => window.location.pathname = '/owner'}>Open owner dashboard</Button></div></details>
  </div></section>
}

export function StudentCommandCenter() {
  const storageKey = 'studenthub.commandCenter'
  const [verificationEmail, setVerificationEmail] = useState(() => localStorage.getItem(`${storageKey}.verification`) ?? '')
  const [verified, setVerified] = useState(() => Boolean(localStorage.getItem(`${storageKey}.verified`)))
  const [emergencyName, setEmergencyName] = useState('')
  const [emergencyPhone, setEmergencyPhone] = useState('')
  const [contacts, setContacts] = useState<{ name: string; phone: string }[]>(() => JSON.parse(localStorage.getItem(`${storageKey}.contacts`) ?? '[]'))
  const [expenseText, setExpenseText] = useState('')
  const [expenseAmount, setExpenseAmount] = useState('')
  const [peopleCount, setPeopleCount] = useState('2')
  const [complaint, setComplaint] = useState('')
  const [movingDistance, setMovingDistance] = useState('5')
  const [movingEstimate, setMovingEstimate] = useState<number | null>(null)
  const [paymentAccountName, setPaymentAccountName] = useState(() => localStorage.getItem(`${storageKey}.paymentName`) ?? '')
  const [paymentVpa, setPaymentVpa] = useState(() => localStorage.getItem(`${storageKey}.paymentVpa`) ?? '')
  const [paymentRequestAmount, setPaymentRequestAmount] = useState('')
  const [paymentRequestIntent, setPaymentRequestIntent] = useState('')
  const [paymentRequestQr, setPaymentRequestQr] = useState('')
  const addContact = () => { if (!emergencyName || !emergencyPhone) return; const next = [...contacts, { name: emergencyName, phone: emergencyPhone }]; setContacts(next); localStorage.setItem(`${storageKey}.contacts`, JSON.stringify(next)); setEmergencyName(''); setEmergencyPhone('') }
  const submitVerification = () => { const approved = verificationEmail.toLowerCase().includes('.edu') || verificationEmail.toLowerCase().includes('.ac.') || verificationEmail.toLowerCase().includes('@college.'); localStorage.setItem(`${storageKey}.verification`, verificationEmail); localStorage.setItem(`${storageKey}.verified`, approved ? 'true' : ''); setVerified(approved); window.dispatchEvent(new CustomEvent('studenthub-thank', { detail: approved ? 'Institutional email format verified in MVP.' : 'Official college verification requires administrator approval.' })) }
  const calculateMoving = () => setMovingEstimate(Math.round(800 + Number(movingDistance) * 160))
  const categorizedExpense = expenseText.toLowerCase().includes('rent') || expenseText.toLowerCase().includes('room') ? 'Room' : expenseText.toLowerCase().includes('mess') || expenseText.toLowerCase().includes('food') ? 'Mess' : expenseText.toLowerCase().includes('bus') || expenseText.toLowerCase().includes('transport') ? 'Transport' : 'Essentials'
  const splitAmount = expenseAmount && peopleCount ? Number(expenseAmount) / Number(peopleCount) : 0
  const generatePaymentRequest = async () => {
    if (!paymentAccountName || !paymentVpa || !paymentRequestAmount) return
    const amount = Number(paymentRequestAmount)
    if (!amount || amount <= 0) return
    localStorage.setItem(`${storageKey}.paymentName`, paymentAccountName)
    localStorage.setItem(`${storageKey}.paymentVpa`, paymentVpa)
    const params = new URLSearchParams({ pa: paymentVpa, pn: paymentAccountName, am: amount.toFixed(2), cu: 'INR', tn: 'StudentHub payment request' })
    const intent = `upi://pay?${params.toString()}`
    setPaymentRequestIntent(intent)
    setPaymentRequestQr(await QRCode.toDataURL(intent, { width: 220, margin: 1 }))
  }
  const sharePaymentAccount = async () => {
    const text = `${paymentAccountName}\nUPI ID: ${paymentVpa}`
    if (navigator.share) await navigator.share({ title: 'My StudentHub payment account', text })
    else await navigator.clipboard.writeText(text)
  }

  return <section className="command-center"><div className="section-heading"><div><span className="eyebrow">Student living command center</span><h2>Plan, protect, and improve your stay</h2></div></div><div className="command-grid"><Card className="command-card"><h3>Lifestyle conflict check</h3><p>Sleep, study, diet and hobby differences are shown before roommate matching.</p><div className="risk-row"><span>Sleep</span><b>Matched</b></div><div className="risk-row"><span>Study</span><b>Matched</b></div><div className="risk-row"><span>Diet</span><b>Low conflict</b></div><div className="risk-row"><span>Hobbies</span><b>Review</b></div></Card><Card className="command-card"><h3>Emergency student network</h3><div className="emergency-row"><strong>Campus emergency</strong><a href="tel:112">112</a></div>{contacts.map((contact, index) => <div className="emergency-row" key={index}><strong>{contact.name}</strong><a href={`tel:${contact.phone}`}>{contact.phone}</a></div>)}<Field label="Contact name"><Input value={emergencyName} onChange={(_, data) => setEmergencyName(data.value)} /></Field><Field label="Phone"><Input value={emergencyPhone} onChange={(_, data) => setEmergencyPhone(data.value)} /></Field><Button appearance="primary" onClick={addContact}>Add emergency contact</Button></Card><Card className="command-card"><h3>Shared expense AI</h3><Field label="Expense"><Input value={expenseText} onChange={(_, data) => setExpenseText(data.value)} placeholder="Mess dinner or rent" /></Field><Field label="Amount"><Input type="number" value={expenseAmount} onChange={(_, data) => setExpenseAmount(data.value)} /></Field><Field label="People"><Input type="number" value={peopleCount} onChange={(_, data) => setPeopleCount(data.value)} /></Field>{expenseText && expenseAmount && <p>Category: <b>{categorizedExpense}</b>. Split: <b>₹{splitAmount.toLocaleString('en-IN')} per person</b></p>}</Card><Card className="command-card"><h3>AI complaint assistant</h3><Textarea value={complaint} onChange={(_, data) => setComplaint(data.value)} placeholder="Describe landlord, mess or service issue" /><Button appearance="primary" onClick={() => setComplaint(value => value ? `Polite follow-up: Dear provider, ${value} Please confirm a resolution date and keep me updated.` : 'Please describe the issue first.')}>Draft complaint</Button></Card><Card className="command-card"><h3>Smart moving assistant</h3><Field label="Distance (km)"><Input type="number" value={movingDistance} onChange={(_, data) => setMovingDistance(data.value)} /></Field><Button appearance="primary" onClick={calculateMoving}>Estimate moving cost</Button>{movingEstimate !== null && <p><b>Estimated ₹{movingEstimate.toLocaleString('en-IN')}</b> for packing and local transport.</p>}</Card><Card className="command-card"><h3>College community verification</h3><Field label="Institutional email"><Input type="email" value={verificationEmail} onChange={(_, data) => setVerificationEmail(data.value)} placeholder="name@college.edu" /></Field><Badge appearance="tint" color={verified ? 'success' : 'warning'}>{verified ? 'MVP verified format' : 'Pending official approval'}</Badge><Button appearance="primary" onClick={submitVerification}>Check verification</Button></Card><Card className="command-card"><h3>My payment account</h3><p>Share this account so another student or seller can pay you through any UPI app.</p><Field label="Account / business name"><Input value={paymentAccountName} onChange={(_, data) => setPaymentAccountName(data.value)} placeholder="Student name or shop name" /></Field><Field label="UPI ID"><Input value={paymentVpa} onChange={(_, data) => setPaymentVpa(data.value)} placeholder="name@okaxis" /></Field><Field label="Payment request amount"><Input type="number" value={paymentRequestAmount} onChange={(_, data) => setPaymentRequestAmount(data.value)} placeholder="1000" /></Field><div className="payment-account-actions"><Button appearance="primary" onClick={generatePaymentRequest} disabled={!paymentAccountName || !paymentVpa || !paymentRequestAmount}>Generate QR</Button><Button appearance="secondary" onClick={sharePaymentAccount} disabled={!paymentAccountName || !paymentVpa}>Share account</Button></div>{paymentRequestQr && <div className="upi-actions"><img className="upi-qr" src={paymentRequestQr} alt="Shareable UPI payment QR" /><Button appearance="primary" onClick={() => { window.location.href = paymentRequestIntent }}>Open UPI app</Button></div>}<span className="payment-account-note">Do not share passwords or bank PINs. Keep the UPI ID verified by your bank or app.</span></Card></div></section>
}

export function DecisionSupport() {
  const [expenseTitle, setExpenseTitle] = useState('')
  const [expenseAmount, setExpenseAmount] = useState('')
  const [expenseCategory, setExpenseCategory] = useState('essentials')
  const [expenses, setExpenses] = useState<{ id: string; title: string; amount: number; category: string }[]>([])
  const [subject, setSubject] = useState('')
  const [description, setDescription] = useState('')
  const [requests, setRequests] = useState<{ id: string; subject: string; description: string; status: string }[]>([])
  const [rating, setRating] = useState(5)
  const [feedback, setFeedback] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => { api.listExpenses().then(setExpenses).catch(() => setExpenses([])); api.listSupport().then(setRequests).catch(() => setRequests([])) }, [])
  const addExpense = async () => { if (!expenseTitle || !expenseAmount) return; await api.addExpense({ title: expenseTitle, amount: Number(expenseAmount), category: expenseCategory }); setExpenseTitle(''); setExpenseAmount(''); setExpenses(await api.listExpenses()) }
  const addSupport = async () => { if (!subject || !description) return; await api.addSupport({ subject, description }); setSubject(''); setDescription(''); setRequests(await api.listSupport()) }
  const saveFeedback = async () => { await api.submitFeedback({ category: 'recommendation', rating, comment: feedback }); setFeedback(''); setMessage('Thank you. Your feedback will improve future recommendations.') }

  return <section className="post-move-grid"><Card className="post-move-card"><h2>Post-move-in support</h2><Field label="Complaint or request"><Input value={subject} onChange={(_, data) => setSubject(data.value)} placeholder="Water, safety, mess, landlord" /></Field><Field label="Details"><Textarea value={description} onChange={(_, data) => setDescription(data.value)} placeholder="Describe the issue" /></Field><Button appearance="primary" onClick={addSupport}>Submit complaint</Button>{requests.slice(0, 3).map(item => <div className="support-item" key={item.id}><strong>{item.subject}</strong><Badge>{item.status}</Badge></div>)}</Card><Card className="post-move-card"><h2>Shared living expenses</h2><div className="expense-form"><Field label="Expense"><Input value={expenseTitle} onChange={(_, data) => setExpenseTitle(data.value)} /></Field><Field label="Amount"><Input type="number" value={expenseAmount} onChange={(_, data) => setExpenseAmount(data.value)} /></Field><Field label="Category"><select className="native-select" value={expenseCategory} onChange={event => setExpenseCategory(event.target.value)}><option value="essentials">Essentials</option><option value="room">Room</option><option value="mess">Mess</option><option value="transport">Transport</option></select></Field><Button appearance="primary" onClick={addExpense}>Add expense</Button></div><div className="expense-total"><span>Total logged</span><strong>₹{expenses.reduce((sum, item) => sum + item.amount, 0).toLocaleString('en-IN')}</strong></div></Card><Card className="post-move-card"><h2>Improve recommendations</h2><p>How useful was your latest match?</p><div className="rating-buttons">{[1,2,3,4,5].map(value => <button key={value} className={rating === value ? 'active' : ''} onClick={() => setRating(value)}>{value}</button>)}</div><Field label="Feedback"><Textarea value={feedback} onChange={(_, data) => setFeedback(data.value)} /></Field><Button appearance="primary" onClick={saveFeedback}>Send feedback</Button>{message && <span className="feedback-message">{message}</span>}</Card></section>
}

function FeatureStatus() {
  const live = [['Room discovery and filters', 'Available'], ['Roommate profile matching', 'Available'], ['Mess and marketplace browsing', 'Available'], ['Shared expense categorization', 'Available'], ['Support request logging', 'Available'], ['Moving cost estimate', 'Available'], ['Institutional email format check', 'MVP']]
  const gaps = [['Real college database verification', 'Requires registrar or college identity API'], ['Live payment gateway', 'Requires gateway credentials'], ['Verified emergency provider network', 'Requires verified provider onboarding']]
  return <section className="platform-status"><div className="section-heading"><h2>Platform capability status</h2><span>Running platform view</span></div><div className="status-columns"><Card><h3>Available now</h3>{live.map(([name, state]) => <div className="status-row" key={name}><span>{name}</span><Badge appearance="tint" color="success">{state}</Badge></div>)}</Card><Card><h3>Not live yet</h3>{gaps.map(([name, detail]) => <div className="status-row status-row--gap" key={name}><strong>{name}</strong><span>{detail}</span></div>)}</Card></div></section>
}

function HostelsPage({ user }: { user: User | null }) {
  const [hostels, setHostels] = useState<Hostel[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [area, setArea] = useState('')
  const [maxRent, setMaxRent] = useState('')
  const [amenities, setAmenities] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [newRoom, setNewRoom] = useState({ name: '', area: '', rent: '', amenities: '', imageUrl: '' })
  const [roomImage, setRoomImage] = useState<File | null>(null)
  const [selectedRooms, setSelectedRooms] = useState<string[]>([])
  const [comparisons, setComparisons] = useState<RoomComparison[]>([])
  const [addError, setAddError] = useState('')
  const load = (filters?: { area?: string; maxRent?: number; amenities?: string }) => { setLoading(true); setError(false); api.listHostels(filters).then(setHostels).catch(() => setError(true)).finally(() => setLoading(false)) }
  useEffect(() => load(), [])
  const applyFilters = () => load({ area: area.trim() || undefined, maxRent: maxRent ? Number(maxRent) : undefined, amenities: amenities.trim() || undefined })
  const compareSelected = async () => { if (selectedRooms.length >= 2) setComparisons((await api.compareRooms(selectedRooms)).rooms) }
  const addRoom = async () => {
    setAddError('')
    try {
      let imageUrl = newRoom.imageUrl || undefined
      if (roomImage) imageUrl = (await api.uploadImage(roomImage)).objectUrl
      await api.createHostel({ name: newRoom.name, area: newRoom.area, rent: Number(newRoom.rent), amenities: newRoom.amenities.split(',').map(item => item.trim()).filter(Boolean), imageUrl })
      setShowAdd(false)
      setNewRoom({ name: '', area: '', rent: '', amenities: '', imageUrl: '' })
      setRoomImage(null)
      applyFilters()
      window.dispatchEvent(new CustomEvent('studenthub-thank', { detail: 'Thank you. Your room listing was added successfully.' }))
    } catch (err) { setAddError(err instanceof Error ? err.message : 'Room could not be added') }
  }
  if (loading) return <><PageHeader title="Hostels" /><LoadingGrid /></>
  if (error) return <><PageHeader title="Hostels" /><ErrorState retry={() => load()} /></>
  const canManage = user?.role === 'hostel_owner' || user?.role === 'admin'
  return <><PageHeader title="Find rooms" eyebrow={`${hostels.length} rooms matching this search`} {...(canManage ? { action: 'Add room', onAction: () => setShowAdd(true) } : {})} /><div className="split-layout"><Card className="filters"><h3>Filters</h3><Field label="Area"><Input value={area} onChange={(_, data) => setArea(data.value)} placeholder="North Campus" /></Field><Field label="Monthly budget"><Input type="number" value={maxRent} onChange={(_, data) => setMaxRent(data.value)} placeholder="8000" /></Field><Field label="Amenities"><Textarea value={amenities} onChange={(_, data) => setAmenities(data.value)} placeholder="Wi-Fi, meals, study room" /></Field><Button appearance="primary" onClick={applyFilters}>Apply filters</Button><Button appearance="subtle" onClick={() => { setArea(''); setMaxRent(''); setAmenities(''); load() }}>Clear filters</Button></Card><div>{selectedRooms.length >= 2 && <Button appearance="primary" onClick={compareSelected}>Compare {selectedRooms.length} rooms</Button>}{comparisons.length >= 2 && <Card className="comparison-card"><h3>Room comparison</h3><table><thead><tr><th>Room</th><th>Price</th><th>Safety</th><th>Value</th><th>Amenities</th></tr></thead><tbody>{comparisons.map(room => <tr key={room.id}><td><strong>{room.name}</strong><br />{room.area}</td><td>₹{room.rent.toLocaleString('en-IN')}/month</td><td>{room.safetyScore}/100</td><td>{room.valueScore}/100</td><td>{room.amenities.join(' · ')}</td></tr>)}</tbody></table></Card>}{showAdd && <Card className="add-room"><h3>Add a room</h3><div className="form-grid"><Field label="Property name"><Input value={newRoom.name} onChange={(_, data) => setNewRoom({ ...newRoom, name: data.value })} /></Field><Field label="Area"><Input value={newRoom.area} onChange={(_, data) => setNewRoom({ ...newRoom, area: data.value })} /></Field><Field label="Monthly rent"><Input type="number" value={newRoom.rent} onChange={(_, data) => setNewRoom({ ...newRoom, rent: data.value })} /></Field><Field label="Amenities"><Input value={newRoom.amenities} onChange={(_, data) => setNewRoom({ ...newRoom, amenities: data.value })} placeholder="Wi-Fi, Meals" /></Field><Field label="Room image"><input className="native-file" type="file" accept="image/*" onChange={(event) => setRoomImage((event.target as HTMLInputElement).files?.[0] ?? null)} /></Field></div>{addError && <MessageBar intent="error"><MessageBarBody>{addError}</MessageBarBody></MessageBar>}<div className="form-actions"><Button appearance="primary" onClick={addRoom} disabled={!newRoom.name || !newRoom.area || !newRoom.rent}>Save room</Button><Button appearance="subtle" onClick={() => setShowAdd(false)}>Cancel</Button></div></Card>}<div className="content-grid">{hostels.map((hostel) => <Card key={hostel.id}><CardPreview>{hostel.image ? <img className="card-image" src={hostel.image.startsWith('/uploads/') ? `${window.location.origin.replace(':5173', ':8000')}${hostel.image}` : hostel.image} alt={hostel.name} /> : <div className="card-image card-image--empty">No room image</div>}</CardPreview><CardHeader header={<strong>{hostel.name}</strong>} action={<Badge appearance="tint" color="success">Verified</Badge>} /><div className="card-copy"><p>{hostel.area}</p><strong>₹{hostel.rent.toLocaleString('en-IN')}/month</strong><span>Rating {hostel.rating}</span><span>{hostel.amenities?.join(' · ')}</span></div><CardFooter><Button appearance="primary">View room</Button><Button appearance={selectedRooms.includes(hostel.id) ? 'primary' : 'secondary'} onClick={() => setSelectedRooms(current => current.includes(hostel.id) ? current.filter(id => id !== hostel.id) : [...current, hostel.id])}>{selectedRooms.includes(hostel.id) ? 'Selected' : 'Compare'}</Button></CardFooter></Card>)}</div></div></div></>
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
  const load = (filters?: { course?: string; budgetMax?: number; preference?: string; sleep?: string; study?: string; diet?: string; hobby?: string }) => { setLoading(true); api.listRoommates(filters).then(setMatches).finally(() => setLoading(false)) }
  useEffect(() => load(), [])
  const apply = () => load({ course: course.trim() || undefined, budgetMax: budgetMax ? Number(budgetMax) : undefined, preference: preference.trim() || undefined, sleep: sleep.trim() || undefined, study: study.trim() || undefined, diet: diet.trim() || undefined, hobby: hobby.trim() || undefined })
  if (loading) return <><PageHeader title="Roommate Matches" /><LoadingGrid /></>
  return <><PageHeader title="Roommate Matches" eyebrow="Compatibility-ranked suggestions" /><div className="split-layout"><Card className="filters"><h3>Search preferences</h3><Field label="Course"><Input value={course} onChange={(_, data) => setCourse(data.value)} placeholder="Computer Science" /></Field><Field label="Maximum budget"><Input type="number" value={budgetMax} onChange={(_, data) => setBudgetMax(data.value)} placeholder="9000" /></Field><Field label="Lifestyle"><Input value={preference} onChange={(_, data) => setPreference(data.value)} placeholder="Clean, Vegetarian" /></Field><Field label="Sleeping schedule"><Input value={sleep} onChange={(_, data) => setSleep(data.value)} placeholder="Early riser or night owl" /></Field><Field label="Study style"><Input value={study} onChange={(_, data) => setStudy(data.value)} placeholder="Quiet study or group study" /></Field><Field label="Diet"><Input value={diet} onChange={(_, data) => setDiet(data.value)} placeholder="Vegetarian" /></Field><Field label="Hobbies"><Input value={hobby} onChange={(_, data) => setHobby(data.value)} placeholder="Chess, music, sports" /></Field><Button appearance="primary" onClick={apply}>Find roommates</Button><Button appearance="subtle" onClick={() => { setCourse(''); setBudgetMax(''); setPreference(''); load() }}>Clear</Button></Card>{matches.length === 0 ? <EmptyState title="No compatible matches yet" action="Update preferences" /> : <Card className="table-card"><table><thead><tr><th>Student</th><th>Course</th><th>Budget</th><th>Preferences</th><th>Match</th><th></th></tr></thead><tbody>{matches.map((match) => <tr key={match.id}><td><div className="person-row"><Avatar name={match.name} image={match.avatar ? { src: match.avatar } : undefined} /><strong>{match.name}</strong></div></td><td>{match.course}</td><td>{match.budget}</td><td>{match.preferences?.join(' · ') ?? 'Open to preferences'}</td><td><Badge appearance="tint" color="warning">{match.match}%</Badge></td><td><Button appearance="primary">Connect</Button></td></tr>)}</tbody></table></Card>}</div></>
}

function MessPage({ user }: { user: User | null }) {
  const [meals, setMeals] = useState<Meal[]>([])
  const [loading, setLoading] = useState(true)
  const [payMethod, setPayMethod] = useState<'upi' | 'card' | 'cash'>('upi')
  const [paymentMessage, setPaymentMessage] = useState('')
  const [upiIntent, setUpiIntent] = useState('')
  const [upiQr, setUpiQr] = useState('')
  const [upiError, setUpiError] = useState('')
  const [showPlanForm, setShowPlanForm] = useState(false)
  const [plan, setPlan] = useState({ name: '', meal: '', menu: '', time: '', price: '', imageUrl: '' })
  const [planImage, setPlanImage] = useState<File | null>(null)
  const load = () => { setLoading(true); api.getMessMenu().then(setMeals).finally(() => setLoading(false)) }
  useEffect(load, [])
  if (loading) return <><PageHeader title="Mess Dining" /><LoadingGrid /></>
  if (meals.length === 0) return <><PageHeader title="Mess Dining" /><EmptyState title="No menu published" action="View meal plan" /></>
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
    } catch (error) { window.dispatchEvent(new CustomEvent('studenthub-thank', { detail: error instanceof Error ? error.message : 'Mess plan could not be published.' })) }
  }
  const renew = async () => { try {
    const result = await api.checkoutPayment({ purpose: 'November meal plan', amount: 2800, method: payMethod })
    setUpiIntent(result.upiIntent ?? '')
    setUpiError(result.upiError ?? '')
    setUpiQr(result.upiQrData ? await QRCode.toDataURL(result.upiQrData, { width: 220, margin: 1 }) : '')
    if (payMethod === 'upi') {
      setPaymentMessage(`UPI payment ${result.paymentId} is pending until gateway verification confirms it.`)
    } else {
      setPaymentMessage(`Payment ${result.paymentId} completed via ${payMethod.toUpperCase()}.`)
      window.dispatchEvent(new CustomEvent('studenthub-thank', { detail: `Thank you. Your ${payMethod.toUpperCase()} payment was completed successfully.` }))
    }
  } catch (err) { setPaymentMessage(err instanceof Error ? err.message : 'Payment could not be completed.') } }
  const canManage = user?.role === 'mess_owner' || user?.role === 'admin'
  return <><PageHeader title="Mess Dining" eyebrow="North Campus Mess" {...(canManage ? { action: 'Add meal plan', onAction: () => setShowPlanForm(true) } : {})} />{showPlanForm && canManage && <Card className="owner-publish-form"><h3>Publish a mess plan</h3><div className="form-grid"><Field label="Mess name"><Input value={plan.name} onChange={(_, data) => setPlan({...plan, name: data.value})} /></Field><Field label="Meal name"><Input value={plan.meal} onChange={(_, data) => setPlan({...plan, meal: data.value})} /></Field><Field label="Menu"><Input value={plan.menu} onChange={(_, data) => setPlan({...plan, menu: data.value})} /></Field><Field label="Serving time"><Input value={plan.time} onChange={(_, data) => setPlan({...plan, time: data.value})} /></Field><Field label="Price"><Input type="number" value={plan.price} onChange={(_, data) => setPlan({...plan, price: data.value})} /></Field><Field label="Meal image"><input className="native-file" type="file" accept="image/*" onChange={(event) => setPlanImage((event.target as HTMLInputElement).files?.[0] ?? null)} /></Field></div><div className="form-actions"><Button appearance="primary" onClick={addPlan} disabled={!plan.name || !plan.meal || !plan.menu || !plan.price}>Publish plan</Button><Button appearance="subtle" onClick={() => setShowPlanForm(false)}>Cancel</Button></div></Card>}<div className="mess-layout"><section className="meal-list">{meals.map((meal) => <Card key={meal.id} className="meal-row"><img className="meal-row__image" src={meal.image} alt={meal.name ?? meal.meal ?? 'Mess meal'} /><div><span className="meal-time"><CalendarRegular /> {meal.time}</span><h3>{meal.name ?? meal.meal}</h3><p>{meal.menu}</p></div><div className="meal-row__meta"><strong>₹{meal.price ?? 0}</strong><Badge appearance="tint" color="informative">★ {meal.rating ?? 4.5}</Badge><Badge appearance="tint" color={meal.state === 'Serving' ? 'success' : meal.state === 'Upcoming' ? 'warning' : 'informative'}>{meal.state}</Badge></div></Card>)}</section><Card className="mess-plan"><h3>November meal plan</h3><p>Vegetarian · 22 meals</p><strong>₹2,800/month</strong><Field label="Payment method"><select className="native-select" value={payMethod} onChange={(event) => setPayMethod(event.target.value as 'upi' | 'card' | 'cash')}><option value="upi">UPI</option><option value="card">Card</option><option value="cash">Cash</option></select></Field><Button appearance="primary" onClick={renew}>Pay & renew</Button>{payMethod === 'upi' && upiIntent && <div className="upi-actions"><Button appearance="primary" onClick={() => { window.location.href = upiIntent }}>Open UPI app</Button>{upiQr && <img className="upi-qr" src={upiQr} alt="UPI payment QR code" />}<span>Scan with Google Pay, PhonePe, Paytm or any UPI app.</span></div>}{payMethod === 'upi' && upiError && <MessageBar intent="warning"><MessageBarBody>{upiError}. Set UPI_MERCHANT_VPA and restart the API.</MessageBarBody></MessageBar>}{paymentMessage && <MessageBar intent="success"><MessageBarBody><CheckmarkCircleRegular /> {paymentMessage}</MessageBarBody></MessageBar>}</Card></div></>
}

function MarketplacePage({ user }: { user: User | null }) {
  const [listings, setListings] = useState<Listing[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showListingForm, setShowListingForm] = useState(false)
  const [listingForm, setListingForm] = useState({ title: '', price: '', condition: 'Good', category: 'essentials', contactName: '', contactPhone: '', imageUrl: '' })
  const [listingImage, setListingImage] = useState<File | null>(null)
  const [reviewListingId, setReviewListingId] = useState<string | null>(null)
  const [reviewRating, setReviewRating] = useState(5)
  const [reviewComment, setReviewComment] = useState('')
  const [listingFeedback, setListingFeedback] = useState<Record<string, { id: string; rating: number; category: string; comment: string }[]>>({})
  const [savedListingIds, setSavedListingIds] = useState<string[]>(() => JSON.parse(localStorage.getItem('studenthub.savedListings') ?? '[]'))
  const load = () => { setLoading(true); api.listListings().then(setListings).finally(() => setLoading(false)) }
  useEffect(load, [])
  useEffect(() => {
    void Promise.all(listings.map(listing => api.listFeedback(`listing-${listing.id}`))).then(results => {
      const next: Record<string, { id: string; rating: number; category: string; comment: string }[]> = {}
      listings.forEach((listing, index) => { next[listing.id] = results[index] })
      setListingFeedback(next)
    }).catch(() => setListingFeedback({}))
  }, [listings])
  if (loading) return <><PageHeader title="Marketplace" /><LoadingGrid /></>
  if (listings.length === 0) return <><PageHeader title="Marketplace" /><EmptyState title="No listings available" action="Post a listing" /></>
  const visible = listings.filter(item => `${item.title} ${item.seller} ${item.condition}`.toLowerCase().includes(search.toLowerCase()))
  const usedBooks = visible.filter(item => item.category === 'books' && item.listingType === 'used_senior')
  const newBooks = visible.filter(item => item.category === 'books' && item.listingType === 'new_seller')
  const essentials = visible.filter(item => item.category !== 'books')
  const addListing = async () => {
    try {
      let imageUrl = listingForm.imageUrl || undefined
      if (listingImage) imageUrl = (await api.uploadImage(listingImage)).objectUrl
      await api.createMarketplaceListing({ title: listingForm.title, price: Number(listingForm.price), condition: listingForm.condition, category: listingForm.category, contactName: listingForm.contactName, contactPhone: listingForm.contactPhone, imageUrl })
      setShowListingForm(false)
      setListingForm({ title: '', price: '', condition: 'Good', category: 'essentials', contactName: '', contactPhone: '', imageUrl: '' })
      setListingImage(null)
      load()
      window.dispatchEvent(new CustomEvent('studenthub-thank', { detail: 'Your marketplace listing was published.' }))
    } catch (error) { window.dispatchEvent(new CustomEvent('studenthub-thank', { detail: error instanceof Error ? error.message : 'Listing could not be published.' })) }
  }
  const buyListing = async (listing: Listing) => {
    if (user?.role !== 'student') return
    try {
      await api.checkoutPayment({ purpose: `Marketplace: ${listing.title}`, amount: listing.price, method: 'upi' })
      await api.createBookingRequest({ targetType: 'listing', targetId: listing.id, targetName: listing.title, duration: 'Purchase request', message: `Student is interested in buying ${listing.title}` })
      window.dispatchEvent(new CustomEvent('studenthub-thank', { detail: `Purchase request for ${listing.title} submitted. Payment is recorded in demo mode.` }))
    } catch (error) {
      window.dispatchEvent(new CustomEvent('studenthub-thank', { detail: error instanceof Error ? error.message : 'Purchase could not be submitted.' }))
    }
  }
  const submitListingReview = async (listing: Listing) => {
    if (user?.role !== 'student') return
    try {
      await api.submitFeedback({ category: `listing-${listing.id}`, rating: reviewRating, comment: reviewComment || `${listing.title} marketplace review` })
      setReviewListingId(null)
      setReviewComment('')
      void api.listFeedback(`listing-${listing.id}`).then(rows => setListingFeedback(current => ({ ...current, [listing.id]: rows })))
      window.dispatchEvent(new CustomEvent('studenthub-thank', { detail: `Thank you. Your review for ${listing.title} was submitted.` }))
    } catch (error) {
      window.dispatchEvent(new CustomEvent('studenthub-thank', { detail: error instanceof Error ? error.message : 'Review could not be submitted.' }))
    }
  }
  const listingCard = (listing: Listing) => <Card key={listing.id}><CardPreview><img className="card-image" src={listing.image?.startsWith('/uploads/') ? `${window.location.protocol}//${window.location.hostname}:8000${listing.image}` : (listing.image || 'https://images.unsplash.com/photo-1496181133206-80ce9b88a853?w=900')} alt={listing.title} /></CardPreview><CardHeader header={<strong>{listing.title}</strong>} action={<Badge appearance="tint" color={listing.listingType === 'used_senior' ? 'warning' : 'success'}>{listing.listingType === 'used_senior' ? 'Used · Senior' : 'New · Seller'}</Badge>} /><div className="card-copy"><p>{listing.contactName ?? listing.seller} · {listing.condition}</p>{listing.contactPhone && <p className="listing-contact">Contact: {listing.contactPhone}</p>}<div className="listing-price"><strong>₹{listing.price.toLocaleString('en-IN')}</strong><Badge appearance="tint" color="informative">★ {listingFeedback[listing.id]?.length ? (listingFeedback[listing.id].reduce((sum, row) => sum + row.rating, 0) / listingFeedback[listing.id].length).toFixed(1) : (listing.rating ?? 4.5)}</Badge></div>{listingFeedback[listing.id]?.slice(0, 2).map(row => <p className="listing-review-copy" key={row.id}>“{row.comment}” · {row.rating}/5</p>)}</div><CardFooter>{user?.role === 'student' && <><Button appearance="primary" onClick={() => buyListing(listing)}>Buy / contact</Button><Button appearance="secondary" onClick={() => { setReviewListingId(reviewListingId === listing.id ? null : listing.id); setReviewRating(5) }}>Review</Button></>}<Button icon={<BookmarkRegular />} aria-label={savedListingIds.includes(listing.id) ? 'Remove saved listing' : 'Save listing'} appearance={savedListingIds.includes(listing.id) ? 'primary' : 'secondary'} onClick={() => { const next = savedListingIds.includes(listing.id) ? savedListingIds.filter(id => id !== listing.id) : [...savedListingIds, listing.id]; setSavedListingIds(next); localStorage.setItem('studenthub.savedListings', JSON.stringify(next)) }} /></CardFooter>{reviewListingId === listing.id && user?.role === 'student' && <div className="listing-review"><div className="rating-buttons">{[1,2,3,4,5].map(value => <button key={value} className={reviewRating === value ? 'active' : ''} onClick={() => setReviewRating(value)} aria-label={`${value} star review`}>{value}★</button>)}</div><Field label="Review"><Input value={reviewComment} onChange={(_, data) => setReviewComment(data.value)} placeholder="Share your experience" /></Field><Button appearance="primary" onClick={() => submitListingReview(listing)}>Submit review</Button></div>}</Card>
  const canManage = user?.role === 'seller' || user?.role === 'admin'
  return <><PageHeader title="Essentials & books marketplace" eyebrow="Books, electronics and student essentials" {...(canManage ? { action: 'Add listing', onAction: () => setShowListingForm(true) } : {})} />{showListingForm && canManage && <Card className="owner-publish-form"><h3>Publish a marketplace listing</h3><div className="form-grid"><Field label="Item name"><Input value={listingForm.title} onChange={(_, data) => setListingForm({...listingForm, title: data.value})} /></Field><Field label="Price"><Input type="number" value={listingForm.price} onChange={(_, data) => setListingForm({...listingForm, price: data.value})} /></Field><Field label="Condition"><select className="native-select" value={listingForm.condition} onChange={event => setListingForm({...listingForm, condition: event.target.value})}><option>New</option><option>Like new</option><option>Excellent</option><option>Good</option><option>Fair</option></select></Field><Field label="Category"><select className="native-select" value={listingForm.category} onChange={event => setListingForm({...listingForm, category: event.target.value})}><option value="electronics">Electronics</option><option value="books">Books</option><option value="furniture">Furniture</option><option value="cycles">Cycles</option><option value="essentials">Essentials</option></select></Field><Field label="Contact name"><Input value={listingForm.contactName} onChange={(_, data) => setListingForm({...listingForm, contactName: data.value})} /></Field><Field label="Contact phone"><Input type="tel" value={listingForm.contactPhone} onChange={(_, data) => setListingForm({...listingForm, contactPhone: data.value})} /></Field><Field label="Listing image"><input className="native-file" type="file" accept="image/*" onChange={(event) => setListingImage((event.target as HTMLInputElement).files?.[0] ?? null)} /></Field></div><div className="form-actions"><Button appearance="primary" onClick={addListing} disabled={!listingForm.title || !listingForm.price || !listingForm.contactName}>Publish listing</Button><Button appearance="subtle" onClick={() => setShowListingForm(false)}>Cancel</Button></div></Card>}<Card className="marketplace-search"><Field label="Search books, electronics, furniture and essentials"><Input value={search} onChange={(_, data) => setSearch(data.value)} placeholder="Search essentials" /></Field></Card><section className="catalog-section"><div className="section-heading"><h2>Used books from seniors</h2><Badge appearance="tint" color="warning">Best second-hand value</Badge></div><div className="content-grid">{usedBooks.map(listingCard)}</div></section><section className="catalog-section"><div className="section-heading"><h2>New books from sellers</h2><Badge appearance="tint" color="success">Brand new</Badge></div><div className="content-grid">{newBooks.map(listingCard)}</div></section><section className="catalog-section"><div className="section-heading"><h2>Student essentials</h2><Badge>Furniture · Electronics</Badge></div><div className="content-grid">{essentials.map(listingCard)}</div></section></>
}

function MessagesPage() {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<string>('c1')
  const load = () => { setLoading(true); api.listConversations().then(setConversations).finally(() => setLoading(false)) }
  useEffect(load, [])
  if (loading) return <><PageHeader title="Messages" /><LoadingGrid /></>
  if (conversations.length === 0) return <><PageHeader title="Messages" /><EmptyState title="No conversations" action="Start a message" /></>
  const active = conversations.find((conversation) => conversation.id === selected) ?? conversations[0]
  return <><PageHeader title="Messages" eyebrow="Conversations and support" action="New message" /><div className="message-layout"><Card className="conversation-list">{conversations.map((conversation) => <button key={conversation.id} className={`conversation ${selected === conversation.id ? 'active' : ''}`} onClick={() => setSelected(conversation.id)}><Avatar name={conversation.contact} /><div><strong>{conversation.contact}</strong><p>{conversation.subject}</p><span>{conversation.lastMessage}</span></div>{conversation.state === 'Unread' && <Badge appearance="filled" color="danger">Unread</Badge>}</button>)}</Card><Card className="thread"><div className="thread-header"><Avatar name={active?.contact ?? 'Support'} /><div><strong>{active?.contact}</strong><p>{active?.subject}</p></div></div><div className="thread-body"><div className="bubble incoming">Hello Aarav, the 4 PM room inspection is confirmed.</div><div className="bubble outgoing">Thank you. I’ll see you there.</div></div><div className="thread-input"><Input placeholder="Write a message" /><Button appearance="primary">Send</Button></div></Card></div></>
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

function StudentSafetyFooter() {
  const links = [
    { label: 'National Emergency', value: '112', href: 'tel:112' },
    { label: 'Police', value: '100', href: 'tel:100' },
    { label: 'Women Helpline', value: '1091', href: 'tel:1091' },
    { label: 'Child Helpline', value: '1098', href: 'tel:1098' },
  ]
  return <footer className="student-safety-footer"><div className="student-safety-footer__brand"><span className="brand-mark"><HatGraduationRegular /></span><div><strong>StudentHub</strong><p>Student living, support and safety in one campus ecosystem.</p></div></div><div className="student-safety-footer__grid"><section><h3>Explore</h3><a href="/hostels">Find rooms</a><a href="/roommates">Find roommates</a><a href="/mess">Mess and dining</a><a href="/marketplace">Student marketplace</a></section><section><h3>Safety resources</h3><a href="https://cybercrime.gov.in" target="_blank" rel="noreferrer">National Cyber Crime Portal</a><a href="https://www.ncw.gov.in" target="_blank" rel="noreferrer">National Commission for Women</a><a href="https://www.indiacode.nic.in" target="_blank" rel="noreferrer">India Code and citizen resources</a></section><section><h3>Human help</h3>{links.map(link => <a key={link.value} href={link.href}><span>{link.label}</span><strong>{link.value}</strong></a>)}</section></div><div className="student-safety-footer__bottom"><span>© 2026 StudentHub · Hackathon prototype</span><span>For emergencies, call 112 or contact local authorities.</span></div></footer>
}

function AIChatWidget() {
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [messages, setMessages] = useState<{ role: 'user' | 'bot'; text: string }[]>([{ role: 'bot', text: 'Tell me your room budget, preferred area, safety needs, sleep schedule, study style, diet, or hobbies.' }])

  useEffect(() => {
    const openAssistant = (event: Event) => {
      setOpen(true)
      const prompt = (event as CustomEvent<string>).detail
      if (prompt) {
        setMessage(prompt)
        void api.aiChat(prompt).then(reply => setMessages(current => [...current, { role: 'user', text: prompt }, { role: 'bot', text: reply }])).catch(() => setMessages(current => [...current, { role: 'bot', text: 'The assistant is temporarily unavailable.' }]))
      }
    }
    window.addEventListener('studenthub-ai-open', openAssistant)
    return () => window.removeEventListener('studenthub-ai-open', openAssistant)
  }, [])

  const send = async () => {
    const text = message.trim()
    if (!text) return
    setMessage('')
    setMessages(current => [...current, { role: 'user', text }])
    try {
      const reply = await api.aiChat(text)
      setMessages(current => [...current, { role: 'bot', text: reply }])
    } catch {
      setMessages(current => [...current, { role: 'bot', text: 'The assistant is temporarily unavailable.' }])
    }
  }

  return <div className="ai-bot"><button className="ai-bot__toggle" onClick={() => setOpen(value => !value)} aria-label="Open AI assistant"><span>AI</span><small>Ask</small></button>{open && <Card className="ai-bot__panel"><div className="ai-bot__header"><div><span className="ai-bot__status"></span><strong>StudentHub AI</strong><small>Campus assistant</small></div><Button appearance="subtle" onClick={() => setOpen(false)}>Close</Button></div><div className="ai-bot__prompts"><button type="button" onClick={() => setMessage('Find an affordable room near my campus')}>Affordable room</button><button type="button" onClick={() => setMessage('Find a compatible roommate')}>Find roommate</button><button type="button" onClick={() => setMessage('Compare mess plans')}>Compare mess</button></div><div className="ai-bot__messages">{messages.map((item, index) => <div key={index} className={`bubble ${item.role === 'bot' ? 'incoming' : 'outgoing'}`}>{item.text}</div>)}</div><div className="ai-bot__input"><Input value={message} onChange={(_, data) => setMessage(data.value)} onKeyDown={(event) => { if (event.key === 'Enter') void send() }} placeholder="Ask about rooms, mess or safety" /><Button appearance="primary" onClick={send}>Send</Button></div></Card>}</div>
}

function LoginView({ onLogin, onCreate }: { onLogin: (email: string, password: string) => Promise<void>, onCreate: () => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const submit = async () => { setBusy(true); setError(''); try { await onLogin(email, password) } catch { setError('Unable to sign in.') } finally { setBusy(false) } }
  return <div className="auth-page"><Card className="auth-card"><div className="brand auth-brand"><span className="brand-mark"><HatGraduationRegular /></span><strong>StudentHub</strong></div><h1>Welcome back</h1><p>Sign in to your student services account.</p><Field label="Email"><Input type="email" value={email} onChange={(_, data) => setEmail(data.value)} /></Field><Field label="Password"><Input type="password" value={password} onChange={(_, data) => setPassword(data.value)} /></Field>{error && <MessageBar intent="error"><MessageBarBody>{error}</MessageBarBody></MessageBar>}<Button appearance="primary" disabled={busy || !email || password.length < 6} onClick={submit}>{busy ? 'Signing in…' : 'Sign in'}</Button><Button appearance="subtle" onClick={onCreate}>Create account</Button></Card></div>
}

function CreateAccountView({ onCreated, onCancel }: { onCreated: (user: User) => Promise<void>, onCancel: () => void }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<User['role']>('student')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const submit = async () => { if (!name || !email.includes('@') || password.length < 6) { setError('Enter a name, valid email, and password of at least 6 characters.'); return } setBusy(true); setError(''); try { const created = await api.createAccount({ name, email, password, role }); await onCreated(created) } catch { setError('This account could not be created.') } finally { setBusy(false) } }
  return <div className="auth-page"><Card className="auth-card"><h1>Create account</h1><p>Join StudentHub as a student or service owner.</p><Field label="Account type"><select className="native-select" value={role} onChange={event => setRole(event.target.value as User['role'])}><option value="student">Student</option><option value="hostel_owner">Room / hostel owner</option><option value="mess_owner">Mess owner</option><option value="seller">Seller</option></select></Field><Field label="Full name" validationState={name ? 'none' : 'warning'} validationMessage={name ? undefined : 'Full name is required'}><Input value={name} onChange={(_, data) => setName(data.value)} /></Field><Field label="Email"><Input type="email" value={email} onChange={(_, data) => setEmail(data.value)} /></Field><Field label="Password"><Input type="password" value={password} onChange={(_, data) => setPassword(data.value)} /></Field>{error && <MessageBar intent="error"><MessageBarBody>{error}</MessageBarBody></MessageBar>}<Button appearance="primary" disabled={busy} onClick={submit}>{busy ? 'Creating…' : 'Create account'}</Button><Button appearance="subtle" icon={<DismissRegular />} onClick={onCancel}>Back to sign in</Button></Card></div>
}

export default App
