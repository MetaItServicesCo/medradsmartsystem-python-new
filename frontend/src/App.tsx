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
import HR from './pages/HR'
import Reports from './pages/Reports'
import Users from './pages/Users'
import Chat from './pages/Chat'
import Calendar from './pages/Calendar'
import Profile from './pages/Profile'
import Attendance from './pages/Attendance'
import Billing from './pages/Sales/Billing'
import MyTimesheets from './pages/MyTimesheets'

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
        <Route index element={<Dashboard />} />
        <Route path="facilities/*" element={<Facilities />} />
        <Route path="users/*" element={<Users />} />
        <Route path="chat/*" element={<Chat />} />
        <Route path="calendar" element={<Calendar />} />
        <Route path="profile" element={<Profile />} />
        <Route path="service-requests/*" element={<ServiceRequests />} />
        <Route path="inspections/*" element={<Inspections />} />
        <Route path="sales/*" element={<Sales />} />
        <Route path="rentals/*" element={<Rentals />} />
        <Route path="inventory/*" element={<Inventory />} />
        <Route path="hr/*" element={<HR />} />
        <Route path="reports/*" element={<Reports />} />
        <Route path="attendance/*" element={<Attendance />} />
        <Route path="my-timesheets" element={<MyTimesheets />} />
        <Route path="billing/*" element={<Billing />} />
      </Route>
    </Routes>
  )
}

export default App
