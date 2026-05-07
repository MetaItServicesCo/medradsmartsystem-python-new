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
  '/sales/billing': 'Billing',
  '/sales': 'Sales',
  '/rentals': 'Rentals',
  '/inventory': 'Inventory',
  '/reports': 'Reports',
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
      backgroundColor: '#F9FAFB',
    }}>
      <Sidebar />
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
        <Header title={title} />
        <Box
          component="main"
          sx={{
            flex: 1,
            p: 3,
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
