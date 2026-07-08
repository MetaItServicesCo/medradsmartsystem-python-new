import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './stores/authStore'
import Layout from './components/Layout'
import Login from './pages/Auth/Login'
import Dashboard from './pages/Dashboard'
import Facilities from './pages/Facilities'
import ServiceRequests from './pages/ServiceRequests'
import Inspections from './pages/Inspections'
import Sales from './pages/Sales'
import Rentals from './pages/Rentals'
import Inventory from './pages/Inventory'
import TestEquipment from './pages/TestEquipment'
import HR from './pages/HR'
import Reports from './pages/Reports'
import Users from './pages/Users'
import Chat from './pages/Chat'
import Calendar from './pages/Calendar'
import Profile from './pages/Profile'
import Attendance from './pages/Attendance'
import Billing from './pages/Sales/Billing'
import MyTimesheets from './pages/MyTimesheets'
import MyLeave from './pages/MyLeave'
import { canAccessModule, getVisibleModules, type Module } from './config/permissions'

const modulePath: Record<Module, string> = {
  dashboard: '/',
  facilities: '/facilities',
  users: '/users',
  'service-requests': '/service-requests',
  inspections: '/inspections',
  sales: '/sales',
  rentals: '/rentals',
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
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route
        path="/"
        element={
          isAuthenticated ? <Layout key={useAuthStore.getState().user?.id} /> : <Navigate to="/login" replace />
        }
      >
        <Route index element={<ProtectedPage module="dashboard"><Dashboard /></ProtectedPage>} />
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
  )
}

export default App
