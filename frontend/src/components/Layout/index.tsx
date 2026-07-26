import { useEffect } from 'react'
import { Box } from '@mui/material'
import { Outlet, useLocation } from 'react-router-dom'
import Sidebar from './Sidebar'
import Header from './Header'

// Safety net for a known class of MUI bug: a Menu/Select/Popover whose anchor or
// parent re-renders while it is open can be left "orphaned" — its component still
// thinks it is open, so an invisible full-screen MuiModal-backdrop stays in the
// DOM and silently swallows every click/scroll, freezing the whole page. This
// clears any such lingering overlay on first paint and on every route change.
function useDismissOrphanedOverlays(pathname: string) {
  useEffect(() => {
    const dismiss = () => {
      // A stuck menu/select/popover closes on Escape via MUI's own handler.
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      // Belt-and-suspenders: click the invisible backdrop of any lingering
      // menu/popover/select, which fires MUI's own onClose so React unmounts it
      // cleanly. Never touch real dialogs, and never rip nodes out of the DOM
      // directly (that would crash React's later cleanup with removeChild).
      document.querySelectorAll<HTMLElement>('.MuiBackdrop-root.MuiModal-backdrop').forEach(backdrop => {
        const modal = backdrop.closest<HTMLElement>('.MuiModal-root')
        if (modal && modal.querySelector('.MuiPopover-paper, .MuiMenu-paper') && !modal.querySelector('.MuiDialog-paper')) {
          backdrop.click()
        }
      })
    }
    const raf = window.requestAnimationFrame(dismiss)
    const timer = window.setTimeout(dismiss, 200)
    return () => {
      window.cancelAnimationFrame(raf)
      window.clearTimeout(timer)
    }
  }, [pathname])
}

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
  '/inventory': 'Parts Inventory',
  '/reports': 'Reports',
  '/billing': 'Billing & Payments',
  '/attendance': 'Smart Attendance',
  '/profile': 'Profile Settings',
}

const Layout = () => {
  const location = useLocation()
  useDismissOrphanedOverlays(location.pathname)
  const title = Object.entries(pageTitles).find(([path]) =>
    path === '/' ? location.pathname === '/' : location.pathname.startsWith(path)
  )?.[1] ?? 'Medrad'

  return (
    <Box sx={{
      display: 'flex',
      height: '100vh',
      minHeight: '100vh',
      overflow: 'hidden',
      background: 'linear-gradient(135deg, #E9EEFA 0%, #F4F7FC 52%, #E8EEFA 100%)',
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
          isolation: 'isolate',
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
            scrollBehavior: 'smooth',
          }}
          className="app-main-scroll page-enter"
        >
          <Outlet />
        </Box>
      </Box>
    </Box>
  )
}

export default Layout
