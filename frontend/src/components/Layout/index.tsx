import { Box } from '@mui/material'
import { Outlet, useLocation } from 'react-router-dom'
import Sidebar from './Sidebar'
import Header from './Header'

const pageTitles: Record<string, string> = {
  '/': 'Dashboard',
  '/facilities': 'Facilities',
  '/users': 'User Management',
  '/chat': 'Chat',
  '/service-requests': 'Service Requests',
  '/inspections': 'Inspections',
  '/sales/quotations': 'Sales Quotations',
  '/sales/invoices': 'Sales Invoices',
  '/sales/in-progress': 'Sales In Progress',
  '/sales/completed': 'Completed Sales',
  '/sales/history': 'Sales History',
  '/sales': 'Sales',
  '/rentals': 'Rentals',
  '/inventory': 'Inventory',
  '/reports': 'Reports',
  '/billing': 'Billing & Payments',
  '/attendance': 'Smart Attendance',
  '/profile': 'Profile Settings',
}

const Layout = () => {
  const location = useLocation()
  const title = Object.entries(pageTitles).find(([path]) =>
    path === '/' ? location.pathname === '/' : location.pathname.startsWith(path)
  )?.[1] ?? 'Medrad'

  return (
    <Box sx={{
      display: 'flex',
      minHeight: '100vh',
      background: '#E9EEFA',
      p: { xs: 0, md: 1.5 },
      gap: { xs: 0, md: 1.5 },
    }}>
      <Sidebar />
      <Box
        sx={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          minWidth: 0,
          overflow: 'hidden',
          bgcolor: '#F8FAFC',
          borderRadius: { xs: 0, md: '30px' },
          border: { xs: 0, md: '1px solid rgba(255,255,255,0.72)' },
          boxShadow: { xs: 'none', md: '0 24px 70px rgba(71,85,105,0.16)' },
        }}
      >
        <Header title={title} />
        <Box
          component="main"
          sx={{
            flex: 1,
            p: { xs: 2, md: 3 },
            overflowY: 'auto',
            overflowX: 'hidden',
          }}
          className="page-enter"
        >
          <Outlet />
        </Box>
      </Box>
    </Box>
  )
}

export default Layout
