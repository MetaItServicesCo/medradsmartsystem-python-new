import { useEffect, useMemo, useState } from 'react'
import { Box, InputBase, Tooltip, Typography } from '@mui/material'
import { useLocation, useNavigate } from 'react-router-dom'
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
import AppsRoundedIcon from '@mui/icons-material/AppsRounded'
import SearchRoundedIcon from '@mui/icons-material/SearchRounded'
import CloseRoundedIcon from '@mui/icons-material/CloseRounded'
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded'
import { useAuthStore } from '@/stores/authStore'
import { getVisibleModules, type Module } from '@/config/permissions'

type ModuleGroup = 'Overview' | 'Operations' | 'Commerce' | 'People' | 'Workspace'

interface SidebarItem {
  text: string
  description: string
  icon: JSX.Element
  path: string
  module: Module
  group: ModuleGroup
  subItems?: { text: string; path: string }[]
}

const groupOrder: ModuleGroup[] = ['Overview', 'Operations', 'Commerce', 'People', 'Workspace']

const allMenuItems: SidebarItem[] = [
  { text: 'Dashboard', description: 'Your operational overview', icon: <DashboardIcon />, path: '/dashboard', module: 'dashboard', group: 'Overview' },
  { text: 'Facilities', description: 'Facilities and asset records', icon: <BusinessIcon />, path: '/facilities', module: 'facilities', group: 'Operations' },
  { text: 'Services', description: 'Service requests and work orders', icon: <BuildIcon />, path: '/service-requests', module: 'service-requests', group: 'Operations' },
  { text: 'Inspections', description: 'Schedules, batches, and reports', icon: <AssignmentIcon />, path: '/inspections', module: 'inspections', group: 'Operations' },
  {
    text: 'Sales', description: 'Quotations, invoices, and sales', icon: <ShoppingCartIcon />, path: '/sales/quotations', module: 'sales', group: 'Commerce',
    subItems: [
      { text: 'Quotations', path: '/sales/quotations' },
      { text: 'Invoice', path: '/sales/invoices' },
      { text: 'In Progress', path: '/sales/in-progress' },
      { text: 'Completed', path: '/sales/completed' },
    ],
  },
  {
    text: 'Rentals', description: 'Agreements and recurring billing', icon: <LocalShippingIcon />, path: '/rentals/agreements', module: 'rentals', group: 'Commerce',
    subItems: [
      { text: 'Agreements', path: '/rentals/agreements' },
      { text: 'Invoice', path: '/rentals/invoices' },
      { text: 'Products', path: '/rentals/products' },
      { text: 'History', path: '/rentals/history' },
    ],
  },
  { text: 'Parts Inventory', description: 'Sales and rental parts', icon: <InventoryIcon />, path: '/inventory', module: 'inventory', group: 'Commerce' },
  { text: 'Test Equipment', description: 'Global test equipment library', icon: <ScienceIcon />, path: '/test-equipment', module: 'test-equipment', group: 'Commerce' },
  { text: 'Billing', description: 'Invoices, payments, and ledgers', icon: <PaymentIcon />, path: '/billing', module: 'billing', group: 'Commerce' },
  { text: 'Users', description: 'Users, roles, and permissions', icon: <PeopleIcon />, path: '/users', module: 'users', group: 'People' },
  { text: 'HR', description: 'Human resources management', icon: <GroupsIcon />, path: '/hr', module: 'hr', group: 'People' },
  { text: 'Attendance', description: 'Attendance and working hours', icon: <AccessTimeIcon />, path: '/attendance', module: 'attendance', group: 'People' },
  { text: 'My Timesheets', description: 'Personal time records', icon: <TimerIcon />, path: '/my-timesheets', module: 'my-timesheets', group: 'People' },
  { text: 'My Leave', description: 'Personal leave requests', icon: <BeachAccessIcon />, path: '/my-leave', module: 'my-leave', group: 'People' },
  { text: 'Reports', description: 'Service and inspection reporting', icon: <AssessmentIcon />, path: '/reports', module: 'reports', group: 'Workspace' },
  { text: 'Chat', description: 'Team and facility conversations', icon: <ChatBubbleIcon />, path: '/chat', module: 'chat', group: 'Workspace' },
  { text: 'Calendar', description: 'Schedules and shared events', icon: <CalendarMonthIcon />, path: '/calendar', module: 'calendar', group: 'Workspace' },
]

const Sidebar = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const logout = useAuthStore((state) => state.logout)
  const user = useAuthStore((state) => state.user)
  const [launcherOpen, setLauncherOpen] = useState(false)
  const [search, setSearch] = useState('')

  const visibleModules = getVisibleModules(user)
  const menuItems = useMemo(
    () => allMenuItems.filter((item) => visibleModules.includes(item.module)),
    [visibleModules],
  )

  const isActive = (item: SidebarItem) => {
    if (item.subItems) {
      return item.subItems.some((subItem) => (
        location.pathname === subItem.path || location.pathname.startsWith(`${subItem.path}/`)
      ))
    }
    return location.pathname === item.path || location.pathname.startsWith(`${item.path}/`)
  }

  const currentItem = menuItems.find(isActive)
  const normalizedSearch = search.trim().toLowerCase()
  const filteredItems = menuItems.filter((item) => (
    !normalizedSearch
    || item.text.toLowerCase().includes(normalizedSearch)
    || item.description.toLowerCase().includes(normalizedSearch)
    || item.group.toLowerCase().includes(normalizedSearch)
  ))
  const groupedItems = groupOrder
    .map((group) => ({ group, items: filteredItems.filter((item) => item.group === group) }))
    .filter(({ items }) => items.length > 0)

  const closeLauncher = () => {
    setLauncherOpen(false)
    setSearch('')
  }

  const openModule = (path: string) => {
    closeLauncher()
    navigate(path)
  }

  useEffect(() => {
    setLauncherOpen(false)
    setSearch('')
  }, [location.pathname])

  useEffect(() => {
    if (!launcherOpen) return undefined
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeLauncher()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [launcherOpen])

  return (
    <Box
      component="aside"
      sx={{
        width: 72,
        height: { xs: '100vh', md: 'calc(100vh - 24px)' },
        background: 'linear-gradient(180deg, #7161D8 0%, #5C4BBC 100%)',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        py: 3, gap: 1, flexShrink: 0, overflow: 'visible',
        boxShadow: '0 24px 60px rgba(89,76,190,0.22)',
        position: 'relative', zIndex: 20,
        borderRadius: { xs: 0, md: '28px' },
      }}
    >
      <Box
        aria-label="MedRad"
        sx={{
          width: 48, height: 48, borderRadius: '18px',
          background: 'rgba(255,255,255,0.15)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', mb: 3,
          border: '1px solid rgba(255,255,255,0.25)', backdropFilter: 'blur(10px)',
          fontWeight: 900, fontSize: '1.2rem', color: '#fff',
          boxShadow: '0 12px 28px rgba(35,28,97,0.18)',
        }}
      >
        M
      </Box>

      <Tooltip title={launcherOpen ? 'Close modules' : `Open modules${currentItem ? ` · ${currentItem.text}` : ''}`} placement="right" arrow>
        <Box
          component="button" type="button" aria-label="Open module navigation"
          aria-expanded={launcherOpen} aria-controls={launcherOpen ? 'module-launcher' : undefined}
          onClick={() => setLauncherOpen((open) => !open)}
          sx={{
            width: 48, height: 48, p: 0, borderRadius: '16px',
            border: '1px solid rgba(255,255,255,0.26)',
            background: launcherOpen ? '#fff' : 'rgba(255,255,255,0.17)',
            color: launcherOpen ? '#6553C8' : '#fff', display: 'flex',
            alignItems: 'center', justifyContent: 'center', cursor: 'pointer', position: 'relative',
            boxShadow: launcherOpen ? '0 16px 34px rgba(31,26,82,0.28)' : '0 10px 24px rgba(31,26,82,0.14)',
            transition: 'transform 180ms ease, background-color 180ms ease, box-shadow 180ms ease',
            '&:hover': { transform: 'translateY(-2px)', background: launcherOpen ? '#fff' : 'rgba(255,255,255,0.24)' },
            '&:focus-visible': { outline: '3px solid rgba(255,255,255,0.42)', outlineOffset: 3 },
            '&::after': currentItem ? {
              content: '""', position: 'absolute', right: -3, top: -3,
              width: 10, height: 10, borderRadius: '50%', bgcolor: '#FF7AAE',
              border: '2px solid #6553C8', boxShadow: '0 0 0 3px rgba(255,122,174,0.18)',
            } : undefined,
          }}
        >
          {launcherOpen ? <CloseRoundedIcon /> : <AppsRoundedIcon />}
        </Box>
      </Tooltip>

      {currentItem && (
        <Tooltip title={`Current: ${currentItem.text}`} placement="right" arrow>
          <Box
            sx={{
              mt: 1, width: 40, height: 40, borderRadius: '14px', display: 'flex',
              alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.8)',
              background: 'rgba(35,28,97,0.14)', '& svg': { fontSize: '1.2rem' },
            }}
          >
            {currentItem.icon}
          </Box>
        </Tooltip>
      )}

      <Box sx={{ flex: 1 }} />

      <Tooltip title="Logout" placement="right" arrow>
        <Box
          component="button" type="button" aria-label="Logout"
          onClick={() => { closeLauncher(); logout(); navigate('/login') }}
          sx={{
            width: 48, height: 48, p: 0, border: 0, borderRadius: '14px',
            display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
            color: 'rgba(255,255,255,0.65)', background: 'transparent',
            transition: 'all 180ms ease', mb: 1,
            '&:hover': { backgroundColor: 'rgba(239,68,68,0.16)', color: '#FFD5D5' },
            '&:focus-visible': { outline: '3px solid rgba(255,255,255,0.35)', outlineOffset: 2 },
            '& svg': { fontSize: '1.4rem' },
          }}
        >
          <LogoutIcon />
        </Box>
      </Tooltip>

      {launcherOpen && (
        <>
          <Box
            aria-hidden="true" onClick={closeLauncher}
            sx={{
              position: 'fixed', inset: 0, zIndex: 1200,
              background: 'rgba(30,27,75,0.14)', backdropFilter: 'blur(2px)',
              animation: 'moduleLauncherFade 160ms ease-out',
              '@keyframes moduleLauncherFade': { from: { opacity: 0 }, to: { opacity: 1 } },
            }}
          />
          <Box
            id="module-launcher" role="dialog" aria-label="Module navigation"
            sx={{
              position: 'fixed', top: { xs: 12, md: 24 }, left: { xs: 82, md: 96 }, zIndex: 1201,
              width: { xs: 'calc(100vw - 94px)', sm: 480 },
              maxHeight: { xs: 'calc(100vh - 24px)', md: 'calc(100vh - 48px)' },
              display: 'flex', flexDirection: 'column', overflow: 'hidden',
              borderRadius: { xs: '22px', md: '28px' }, background: 'rgba(255,255,255,0.97)',
              border: '1px solid rgba(255,255,255,0.86)',
              boxShadow: '0 30px 90px rgba(30,27,75,0.28), 0 4px 18px rgba(113,97,216,0.12)',
              backdropFilter: 'blur(24px)', transformOrigin: 'left top',
              animation: 'moduleLauncherIn 210ms cubic-bezier(0.16, 1, 0.3, 1)',
              '@keyframes moduleLauncherIn': {
                from: { opacity: 0, transform: 'translateX(-10px) scale(0.97)' },
                to: { opacity: 1, transform: 'translateX(0) scale(1)' },
              },
            }}
          >
            <Box sx={{ px: { xs: 2, sm: 2.5 }, pt: 2.5, pb: 2, borderBottom: '1px solid #EEF0F6' }}>
              <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 2, mb: 2 }}>
                <Box>
                  <Typography sx={{ fontSize: '1.15rem', fontWeight: 900, color: '#1E1B4B', letterSpacing: '-0.02em' }}>
                    Modules
                  </Typography>
                  <Typography sx={{ mt: 0.25, fontSize: '0.78rem', color: '#7B8497', fontWeight: 600 }}>
                    {currentItem ? `Currently in ${currentItem.text}` : 'Choose your workspace'}
                  </Typography>
                </Box>
                <Box
                  component="button" type="button" aria-label="Close module navigation" onClick={closeLauncher}
                  sx={{
                    width: 34, height: 34, p: 0, border: 0, borderRadius: '11px', bgcolor: '#F3F1FF',
                    color: '#6553C8', display: 'grid', placeItems: 'center', cursor: 'pointer',
                    '&:hover': { bgcolor: '#EAE6FF' },
                  }}
                >
                  <CloseRoundedIcon sx={{ fontSize: 20 }} />
                </Box>
              </Box>
              <Box
                sx={{
                  height: 48, display: 'flex', alignItems: 'center', gap: 1.25, px: 1.5,
                  borderRadius: '15px', bgcolor: '#F7F6FC', border: '1px solid #E9E6F7',
                  transition: 'border-color 160ms ease, box-shadow 160ms ease, background-color 160ms ease',
                  '&:focus-within': { bgcolor: '#fff', borderColor: '#8B7AE6', boxShadow: '0 0 0 4px rgba(113,97,216,0.11)' },
                }}
              >
                <SearchRoundedIcon sx={{ color: '#8A94A6', fontSize: 21 }} />
                <InputBase
                  autoFocus fullWidth value={search} onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search modules" inputProps={{ 'aria-label': 'Search modules' }}
                  sx={{ color: '#1E1B4B', fontSize: '0.9rem', fontWeight: 600, '& input::placeholder': { color: '#98A1B2', opacity: 1 } }}
                />
                {search && (
                  <Box
                    component="button" type="button" aria-label="Clear module search" onClick={() => setSearch('')}
                    sx={{ p: 0, border: 0, bgcolor: 'transparent', color: '#8A94A6', cursor: 'pointer', display: 'grid' }}
                  >
                    <CloseRoundedIcon sx={{ fontSize: 18 }} />
                  </Box>
                )}
              </Box>
            </Box>

            <Box
              sx={{
                flex: 1, minHeight: 0, overflowY: 'auto', px: { xs: 1.5, sm: 2 }, py: 1.5,
                scrollbarWidth: 'thin', scrollbarColor: 'rgba(113,97,216,0.25) transparent',
              }}
            >
              {groupedItems.map(({ group, items }) => (
                <Box key={group} sx={{ mb: 1.75 }}>
                  <Typography sx={{ px: 0.75, mb: 0.7, color: '#8992A4', fontSize: '0.67rem', fontWeight: 900, letterSpacing: '0.11em', textTransform: 'uppercase' }}>
                    {group}
                  </Typography>
                  <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 0.75 }}>
                    {items.map((item) => {
                      const active = isActive(item)
                      return (
                        <Box
                          key={item.module} component="button" type="button" onClick={() => openModule(item.path)}
                          aria-current={active ? 'page' : undefined}
                          sx={{
                            minWidth: 0, minHeight: 72, display: 'flex', alignItems: 'center', gap: 1.25,
                            p: 1.15, textAlign: 'left', borderRadius: '16px',
                            border: active ? '1px solid rgba(113,97,216,0.34)' : '1px solid transparent',
                            background: active ? 'linear-gradient(135deg, #F2EFFF 0%, #FFF3F8 100%)' : 'transparent',
                            cursor: 'pointer', color: '#1E1B4B',
                            transition: 'transform 160ms ease, background-color 160ms ease, border-color 160ms ease, box-shadow 160ms ease',
                            '&:hover': {
                              transform: 'translateY(-1px)', bgcolor: active ? undefined : '#F8F7FC',
                              borderColor: active ? undefined : '#ECE9F7', boxShadow: '0 10px 24px rgba(71,61,150,0.08)',
                            },
                            '&:focus-visible': { outline: '3px solid rgba(113,97,216,0.2)', outlineOffset: 1 },
                          }}
                        >
                          <Box
                            sx={{
                              width: 42, height: 42, borderRadius: '14px', flexShrink: 0, display: 'grid', placeItems: 'center',
                              color: active ? '#fff' : '#6D5BD0',
                              background: active ? 'linear-gradient(135deg, #7161D8, #F05D92)' : '#EEEAFE',
                              boxShadow: active ? '0 10px 22px rgba(113,97,216,0.24)' : 'none', '& svg': { fontSize: 21 },
                            }}
                          >
                            {item.icon}
                          </Box>
                          <Box sx={{ minWidth: 0, flex: 1 }}>
                            <Typography sx={{ fontSize: '0.84rem', fontWeight: 850, color: '#24204E', lineHeight: 1.25 }} noWrap>
                              {item.text}
                            </Typography>
                            <Typography sx={{ mt: 0.25, fontSize: '0.67rem', fontWeight: 600, color: '#8992A4', lineHeight: 1.35 }} noWrap>
                              {item.description}
                            </Typography>
                          </Box>
                          <ArrowForwardRoundedIcon sx={{ fontSize: 17, color: active ? '#7867D8' : '#C0C5D0', flexShrink: 0 }} />
                        </Box>
                      )
                    })}
                  </Box>
                </Box>
              ))}

              {groupedItems.length === 0 && (
                <Box sx={{ py: 6, px: 2, textAlign: 'center' }}>
                  <Box sx={{ width: 50, height: 50, borderRadius: '17px', bgcolor: '#F1EEFF', color: '#7161D8', display: 'grid', placeItems: 'center', mx: 'auto', mb: 1.5 }}>
                    <SearchRoundedIcon />
                  </Box>
                  <Typography sx={{ fontWeight: 900, color: '#24204E' }}>No modules found</Typography>
                  <Typography sx={{ mt: 0.4, fontSize: '0.78rem', color: '#8992A4' }}>Try a different module name.</Typography>
                </Box>
              )}
            </Box>

            <Box sx={{ px: 2.5, py: 1.25, borderTop: '1px solid #EEF0F6', bgcolor: '#FBFBFE', display: { xs: 'none', sm: 'flex' }, justifyContent: 'space-between' }}>
              <Typography sx={{ color: '#9AA2B2', fontSize: '0.68rem', fontWeight: 650 }}>Showing permitted modules only</Typography>
              <Typography sx={{ color: '#9AA2B2', fontSize: '0.68rem', fontWeight: 650 }}>Esc to close</Typography>
            </Box>
          </Box>
        </>
      )}
    </Box>
  )
}

export default Sidebar
