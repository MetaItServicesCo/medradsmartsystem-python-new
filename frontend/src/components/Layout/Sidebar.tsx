import { useState } from 'react'
import { Box, Tooltip, Menu, MenuItem, Typography } from '@mui/material'
import { useNavigate, useLocation } from 'react-router-dom'
import DashboardIcon from '@mui/icons-material/Dashboard'
import BusinessIcon from '@mui/icons-material/Business'
import BuildIcon from '@mui/icons-material/Build'
import AssignmentIcon from '@mui/icons-material/Assignment'
import ShoppingCartIcon from '@mui/icons-material/ShoppingCart'
import LocalShippingIcon from '@mui/icons-material/LocalShipping'
import InventoryIcon from '@mui/icons-material/Inventory'
import ScienceIcon from '@mui/icons-material/Science'
import AssessmentIcon from '@mui/icons-material/Assessment'
import PeopleIcon from '@mui/icons-material/People'
import ChatBubbleIcon from '@mui/icons-material/ChatBubble'
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth'
import AccessTimeIcon from '@mui/icons-material/AccessTime'
import TimerIcon from '@mui/icons-material/Timer'
import BeachAccessIcon from '@mui/icons-material/BeachAccess'
import PaymentIcon from '@mui/icons-material/Payment'
import GroupsIcon from '@mui/icons-material/Groups'
import LogoutIcon from '@mui/icons-material/Logout'
import { useAuthStore } from '@/stores/authStore'
import { getVisibleModules, type Module } from '@/config/permissions'

const allMenuItems: { text: string; icon: JSX.Element; path: string; module: Module; subItems?: { text: string; path: string }[] }[] = [
  { text: 'Dashboard', icon: <DashboardIcon />, path: '/dashboard', module: 'dashboard' },
  { text: 'Facilities', icon: <BusinessIcon />, path: '/facilities', module: 'facilities' },
  { text: 'Users', icon: <PeopleIcon />, path: '/users', module: 'users' },
  { 
    text: 'Services', 
    icon: <BuildIcon />, 
    path: '/service-requests', 
    module: 'service-requests',
  },
  { text: 'Inspections', icon: <AssignmentIcon />, path: '/inspections', module: 'inspections' },
  { 
    text: 'Sales', 
    icon: <ShoppingCartIcon />, 
    path: '/sales', 
    module: 'sales',
    subItems: [
      { text: 'Quotations', path: '/sales/quotations' },
      { text: 'Invoice', path: '/sales/invoices' },
      { text: 'In Progress', path: '/sales/in-progress' },
      { text: 'Completed', path: '/sales/completed' },
      { text: 'History', path: '/sales/history' },
    ]
  },
  { 
    text: 'Rentals', 
    icon: <LocalShippingIcon />, 
    path: '/rentals', 
    module: 'rentals',
    subItems: [
      { text: 'Agreements', path: '/rentals/agreements' },
      { text: 'Invoice', path: '/rentals/invoices' },
      { text: 'Products', path: '/rentals/products' },
      { text: 'History', path: '/rentals/history' },
    ]
  },
  { text: 'Inventory', icon: <InventoryIcon />, path: '/inventory', module: 'inventory' },
  { text: 'Test Equipment', icon: <ScienceIcon />, path: '/test-equipment', module: 'test-equipment' },
  { text: 'HR', icon: <GroupsIcon />, path: '/hr', module: 'hr' },
  { text: 'My Timesheets', icon: <TimerIcon />, path: '/my-timesheets', module: 'my-timesheets' },
  { text: 'My Leave', icon: <BeachAccessIcon />, path: '/my-leave', module: 'my-leave' },
  { text: 'Reports', icon: <AssessmentIcon />, path: '/reports', module: 'reports' },
  { text: 'Billing', icon: <PaymentIcon />, path: '/billing', module: 'billing' },
  { text: 'Attendance', icon: <AccessTimeIcon />, path: '/attendance', module: 'attendance' },
  { text: 'Chat', icon: <ChatBubbleIcon />, path: '/chat', module: 'chat' },
  { text: 'Calendar', icon: <CalendarMonthIcon />, path: '/calendar', module: 'calendar' },
]

const Sidebar = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const logout = useAuthStore((s) => s.logout)
  const user = useAuthStore((s) => s.user)

  const visibleModules = getVisibleModules(user)
  const menuItems = allMenuItems.filter((item) => visibleModules.includes(item.module))

  const isActive = (path: string, subItems?: any[]) => {
    if (path === '/') return location.pathname === '/'
    if (subItems) return subItems.some(sub => location.pathname === sub.path || location.pathname.startsWith(sub.path + '/'))
    return location.pathname.startsWith(path)
  }

  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null)
  const [activeSubMenu, setActiveSubMenu] = useState<{ text: string; path: string }[] | null>(null)

  const handleMenuClick = (event: React.MouseEvent<HTMLElement>, item: any) => {
    if (item.subItems) {
      setAnchorEl(event.currentTarget)
      setActiveSubMenu(item.subItems)
    } else {
      navigate(item.path)
    }
  }

  const handleClose = () => {
    setAnchorEl(null)
    setActiveSubMenu(null)
  }

  return (
    <Box
      sx={{
        width: 72,
        height: { xs: '100vh', md: 'calc(100vh - 24px)' },
        background: 'linear-gradient(180deg, #7161D8 0%, #5C4BBC 100%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        py: 3,
        gap: 1,
        flexShrink: 0,
        overflow: 'hidden',
        boxShadow: '0 24px 60px rgba(89,76,190,0.22)',
        position: 'relative',
        zIndex: 10,
        borderRadius: { xs: 0, md: '28px' },
      }}
    >
      {/* Logo mark */}
      <Box
        sx={{
          width: 48,
          height: 48,
          borderRadius: '18px',
          background: 'rgba(255,255,255,0.15)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          mb: 4,
          border: '1px solid rgba(255,255,255,0.25)',
          backdropFilter: 'blur(10px)',
          fontWeight: 900,
          fontSize: '1.2rem',
          color: '#fff',
          boxShadow: '0 12px 28px rgba(35,28,97,0.18)',
        }}
      >
        M
      </Box>

      {/* Nav items */}
      <Box sx={{
        display: 'flex', flexDirection: 'column', gap: 1, flex: 1, width: '100%', px: 1.5,
        overflowY: 'auto', minHeight: 0,
        scrollbarWidth: 'thin',
        scrollbarColor: 'rgba(255,255,255,0.2) transparent',
        '&::-webkit-scrollbar': { width: '3px' },
        '&::-webkit-scrollbar-track': { background: 'transparent' },
        '&::-webkit-scrollbar-thumb': { background: 'rgba(255,255,255,0.2)', borderRadius: '3px' },
      }}>
        {menuItems.map((item) => {
          const active = isActive(item.path, item.subItems)
          return (
            <Tooltip key={item.text} title={item.subItems && anchorEl ? "" : item.text} placement="right" arrow>
              <Box
                onClick={(e) => handleMenuClick(e, item)}
                sx={{
                  width: '100%',
                  height: 48,
                  borderRadius: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  position: 'relative',
                  color: active ? '#fff' : 'rgba(255,255,255,0.68)',
                  backgroundColor: active ? 'rgba(255,255,255,0.18)' : 'transparent',
                  border: active ? '1px solid rgba(255,255,255,0.24)' : '1px solid transparent',
                  backdropFilter: active ? 'blur(8px)' : 'none',
                  transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                  '&:hover': {
                    backgroundColor: active ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.08)',
                    color: '#fff',
                    transform: 'translateY(-1px)',
                  },
                  '& svg': { fontSize: '1.4rem' },
                  // Active indicator
                  '&::after': active ? {
                    content: '""',
                    position: 'absolute',
                    left: -12,
                    width: 4,
                    height: 24,
                    backgroundColor: '#FF7AAE',
                    borderRadius: '0 4px 4px 0',
                    boxShadow: '0 0 15px #F472B6',
                  } : {},
                }}
              >
                {item.icon}
              </Box>
            </Tooltip>
          )
        })}

        <Menu
          anchorEl={anchorEl}
          open={Boolean(anchorEl)}
          onClose={handleClose}
          anchorOrigin={{ vertical: 'center', horizontal: 'right' }}
          transformOrigin={{ vertical: 'center', horizontal: 'left' }}
          PaperProps={{
            elevation: 4,
            sx: {
              ml: 1.5,
              borderRadius: '12px',
              minWidth: 160,
              overflow: 'visible',
              filter: 'drop-shadow(0px 4px 20px rgba(0,0,0,0.15))',
              '&::before': {
                content: '""', display: 'block', position: 'absolute',
                top: '50%', left: -5, width: 10, height: 10,
                backgroundColor: 'background.paper',
                transform: 'translateY(-50%) rotate(45deg)', zIndex: 0,
              },
            }
          }}
        >
          {activeSubMenu?.map(sub => (
            <MenuItem 
              key={sub.path} 
              onClick={() => { navigate(sub.path); handleClose(); }}
              selected={location.pathname === sub.path}
              sx={{ 
                py: 1.2, px: 2, mx: 1, borderRadius: '8px',
                mb: 0.5,
                '&.Mui-selected': {
                  backgroundColor: 'rgba(124,58,237,0.1)',
                  color: '#7C3AED',
                  fontWeight: 700,
                  '&:hover': { backgroundColor: 'rgba(124,58,237,0.15)' }
                }
              }}
            >
              <Typography variant="body2" sx={{ fontWeight: location.pathname === sub.path ? 700 : 500 }}>
                {sub.text}
              </Typography>
            </MenuItem>
          ))}
        </Menu>
      </Box>

      {/* Logout */}
      <Tooltip title="Logout" placement="right" arrow>
        <Box
          onClick={() => { logout(); navigate('/login') }}
          sx={{
            width: 48,
            height: 48,
            borderRadius: '14px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            color: 'rgba(255,255,255,0.6)',
            transition: 'all 0.3s ease',
            mb: 1,
            '&:hover': {
              backgroundColor: 'rgba(239,68,68,0.15)',
              color: '#EF4444',
            },
            '& svg': { fontSize: '1.4rem' },
          }}
        >
          <LogoutIcon />
        </Box>
      </Tooltip>
    </Box>
  )
}

export default Sidebar
