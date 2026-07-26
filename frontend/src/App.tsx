import { Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './stores/authStore'
import Layout from './components/Layout'
import { canAccessModule, getVisibleModules, type Module } from './config/permissions'
import { lazyWithReload } from './utils/lazyWithReload'

const Landing = lazyWithReload(() => import('./pages/Landing'))
const Login = lazyWithReload(() => import('./pages/Auth/Login'))
const Dashboard = lazyWithReload(() => import('./pages/Dashboard'))
const Facilities = lazyWithReload(() => import('./pages/Facilities'))
const ServiceRequests = lazyWithReload(() => import('./pages/ServiceRequests'))
const Inspections = lazyWithReload(() => import('./pages/Inspections'))
const Sales = lazyWithReload(() => import('./pages/Sales'))
const Rentals = lazyWithReload(() => import('./pages/Rentals'))
const Inventory = lazyWithReload(() => import('./pages/Inventory'))
const TestEquipment = lazyWithReload(() => import('./pages/TestEquipment'))
const HR = lazyWithReload(() => import('./pages/HR'))
const Reports = lazyWithReload(() => import('./pages/Reports'))
const Users = lazyWithReload(() => import('./pages/Users'))
const Chat = lazyWithReload(() => import('./pages/Chat'))
const Calendar = lazyWithReload(() => import('./pages/Calendar'))
const Profile = lazyWithReload(() => import('./pages/Profile'))
const Attendance = lazyWithReload(() => import('./pages/Attendance'))
const Billing = lazyWithReload(() => import('./pages/Sales/Billing'))
const MyTimesheets = lazyWithReload(() => import('./pages/MyTimesheets'))
const MyLeave = lazyWithReload(() => import('./pages/MyLeave'))

const RouteFallback = () => (
  <div
    role="status"
    aria-label="Loading page"
    style={{
      minHeight: 'calc(100vh - 96px)',
      display: 'grid',
      placeItems: 'center',
      background: '#F7F8FC',
    }}
  >
    <div
      style={{
        width: 38,
        height: 38,
        border: '4px solid #E9E4FF',
        borderTopColor: '#7C3AED',
        borderRadius: '50%',
        animation: 'medrad-route-spin 0.8s linear infinite',
      }}
    />
    <style>{'@keyframes medrad-route-spin { to { transform: rotate(360deg); } }'}</style>
  </div>
)

const modulePath: Record<Module, string> = {
  dashboard: '/dashboard',
  facilities: '/facilities',
  users: '/users',
  'service-requests': '/service-requests',
  inspections: '/inspections',
  sales: '/sales',
  rentals: '/rentals',
  'facility-inventory': '/facilities',
  inventory: '/inventory',
  'test-equipment': '/test-equipment',
  reports: '/reports',
  attendance: '/attendance',
  billing: '/billing',
  hr: '/hr',
  'my-timesheets': '/my-timesheets',
  'my-leave': '/my-leave',
  chat: '/chat',
  calendar: '/calendar',
}

const fallbackPathFor = (user: ReturnType<typeof useAuthStore.getState>['user'], currentModule: Module) => {
  const nextModule = getVisibleModules(user).find((module) => module !== currentModule)
  return nextModule ? modulePath[nextModule] : '/profile'
}

const ProtectedPage = ({ module, children }: { module: Module; children: JSX.Element }) => {
  const user = useAuthStore((state) => state.user)
  if (!canAccessModule(user, module)) {
    return <Navigate to={fallbackPathFor(user, module)} replace />
  }
  return children
}

function App() {
  const { isAuthenticated } = useAuthStore()

  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/landing" element={<Landing />} />
        <Route path="/" element={isAuthenticated ? <Navigate to="/dashboard" replace /> : <Landing />} />

        <Route
          path="/"
          element={
            isAuthenticated ? <Layout key={useAuthStore.getState().user?.id} /> : <Navigate to="/login" replace />
          }
        >
          <Route path="dashboard" element={<ProtectedPage module="dashboard"><Dashboard /></ProtectedPage>} />
          <Route path="facilities/*" element={<ProtectedPage module="facilities"><Facilities /></ProtectedPage>} />
          <Route path="users/*" element={<ProtectedPage module="users"><Users /></ProtectedPage>} />
          <Route path="chat/*" element={<ProtectedPage module="chat"><Chat /></ProtectedPage>} />
          <Route path="calendar" element={<ProtectedPage module="calendar"><Calendar /></ProtectedPage>} />
          <Route path="profile" element={<Profile />} />
          <Route path="service-requests/*" element={<ProtectedPage module="service-requests"><ServiceRequests /></ProtectedPage>} />
          <Route path="inspections/*" element={<ProtectedPage module="inspections"><Inspections /></ProtectedPage>} />
          <Route path="sales/*" element={<ProtectedPage module="sales"><Sales /></ProtectedPage>} />
          <Route path="rentals/*" element={<ProtectedPage module="rentals"><Rentals /></ProtectedPage>} />
          <Route path="inventory/*" element={<ProtectedPage module="inventory"><Inventory /></ProtectedPage>} />
          <Route path="test-equipment/*" element={<ProtectedPage module="test-equipment"><TestEquipment /></ProtectedPage>} />
          <Route path="hr/*" element={<ProtectedPage module="hr"><HR /></ProtectedPage>} />
          <Route path="reports/*" element={<ProtectedPage module="reports"><Reports /></ProtectedPage>} />
          <Route path="attendance/*" element={<ProtectedPage module="attendance"><Attendance /></ProtectedPage>} />
          <Route path="my-timesheets" element={<ProtectedPage module="my-timesheets"><MyTimesheets /></ProtectedPage>} />
          <Route path="my-leave" element={<ProtectedPage module="my-leave"><MyLeave /></ProtectedPage>} />
          <Route path="billing/*" element={<ProtectedPage module="billing"><Billing /></ProtectedPage>} />
        </Route>
      </Routes>
    </Suspense>
  )
}

export default App
