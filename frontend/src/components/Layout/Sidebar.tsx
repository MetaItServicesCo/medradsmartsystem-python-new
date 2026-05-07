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
import AssessmentIcon from '@mui/icons-material/Assessment'
import PeopleIcon from '@mui/icons-material/People'
import ChatBubbleIcon from '@mui/icons-material/ChatBubble'
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth'
import PrecisionManufacturingIcon from '@mui/icons-material/PrecisionManufacturing'
import LogoutIcon from '@mui/icons-material/Logout'
import { useAuthStore } from '@/stores/authStore'
import { getVisibleModules, type Module } from '@/config/permissions'

const allMenuItems: { text: string; icon: JSX.Element; path: string; module: Module; subItems?: { text: string; path: string }[] }[] = [
  { text: 'Dashboard', icon: <DashboardIcon />, path: '/', module: 'dashboard' },
  { text: 'Facilities', icon: <BusinessIcon />, path: '/facilities', module: 'facilities' },
  { text: 'Users', icon: <PeopleIcon />, path: '/users', module: 'users' },
  { 
    text: 'Services', 
    icon: <BuildIcon />, 
    path: '/service-requests', 
    module: 'service-requests',
    subItems: [
      { text: 'All Requests', path: '/service-requests' },
      { text: 'Quotations', path: '/service-requests/quotations' }
    ]
  },
  { text: 'Inspections', icon: <AssignmentIcon />, path: '/inspections', module: 'inspections' },
  { 
    text: 'Sales', 
    icon: <ShoppingCartIcon />, 
    path: '/sales', 
    module: 'sales',
    subItems: [
      { text: 'Sales Home', path: '/sales' },
      { text: 'Billing', path: '/sales/billing' },
    ]
  },
  { text: 'Rentals', icon: <LocalShippingIcon />, path: '/rentals', module: 'rentals' },
  { text: 'Equipment', icon: <PrecisionManufacturingIcon />, path: '/equipment', module: 'equipment' },
  { text: 'Inventory', icon: <InventoryIcon />, path: '/inventory', module: 'inventory' },
  { text: 'Reports', icon: <AssessmentIcon />, path: '/reports', module: 'reports' },
  { text: 'Chat', icon: <ChatBubbleIcon />, path: '/chat', module: 'chat' },
  { text: 'Calendar', icon: <CalendarMonthIcon />, path: '/calendar', module: 'chat' || 'dashboard' },
]

const Sidebar = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const logout = useAuthStore((s) => s.logout)
  const user = useAuthStore((s) => s.user)

  const visibleModules = getVisibleModules(user?.role)
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
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #4F46E5 0%, #3730A3 100%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        py: 3,
        gap: 1,
        flexShrink: 0,
        boxShadow: '10px 0 30px rgba(79,70,229,0.15)',
        position: 'relative',
        zIndex: 10,
      }}
    >
      {/* Logo mark */}
      <Box
        sx={{
          width: 48,
          height: 48,
          borderRadius: '16px',
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
          boxShadow: '0 8px 20px rgba(0,0,0,0.1)',
        }}
      >
        M
      </Box>

      {/* Nav items */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, flex: 1, width: '100%', px: 1.5 }}>
        {menuItems.map((item) => {
          const active = isActive(item.path, item.subItems)
          return (
            <Tooltip key={item.text} title={item.subItems && anchorEl ? "" : item.text} placement="right" arrow>
              <Box
                onClick={(e) => handleMenuClick(e, item)}
                sx={{
                  width: '100%',
                  height: 48,
                  borderRadius: '14px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  position: 'relative',
                  color: active ? '#fff' : 'rgba(255,255,255,0.6)',
                  backgroundColor: active ? 'rgba(255,255,255,0.15)' : 'transparent',
                  border: active ? '1px solid rgba(255,255,255,0.2)' : '1px solid transparent',
                  backdropFilter: active ? 'blur(8px)' : 'none',
                  transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                  '&:hover': {
                    backgroundColor: active ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.08)',
                    color: '#fff',
                    transform: 'translateX(2px)',
                  },
                  '& svg': { fontSize: '1.4rem' },
                  // Active indicator
                  '&::after': active ? {
                    content: '""',
                    position: 'absolute',
                    left: -12,
                    width: 4,
                    height: 24,
                    backgroundColor: '#F472B6',
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
