import { useState, useEffect } from 'react'
import {
  Box, InputBase, Avatar, Badge, IconButton, Typography,
  Menu, MenuItem, ListItemIcon, Divider
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import SearchIcon from '@mui/icons-material/Search'
import ClearIcon from '@mui/icons-material/Clear'
import NotificationsNoneIcon from '@mui/icons-material/NotificationsNone'
import LogoutIcon from '@mui/icons-material/Logout'
import PersonOutlineIcon from '@mui/icons-material/PersonOutline'
import { useAuthStore } from '@/stores/authStore'
import { useNavigate, useSearchParams } from 'react-router-dom'

interface HeaderProps {
  title: string
}

const Header = ({ title }: HeaderProps) => {
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null)
  const [searchInput, setSearchInput] = useState(searchParams.get('search') || '')

  useEffect(() => {
    setSearchInput(searchParams.get('search') || '')
  }, [searchParams.get('search')])

  // Live search debounce
  useEffect(() => {
    const trimmed = searchInput.trim()
    const currentParam = searchParams.get('search') || ''
    
    // Only navigate if the trimmed input doesn't match the current URL param
    if (trimmed === currentParam) return

    const handler = setTimeout(() => {
      if (trimmed) {
        navigate(`/facilities?search=${encodeURIComponent(trimmed)}`, { replace: true })
      } else {
        navigate(`/facilities`, { replace: true })
      }
    }, 400)

    return () => clearTimeout(handler)
  }, [searchInput, navigate, searchParams])

  const handleClearSearch = () => {
    setSearchInput('')
    navigate('/facilities', { replace: true })
  }

  const handleOpenMenu = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget)
  }

  const handleCloseMenu = () => {
    setAnchorEl(null)
  }

  const handleLogout = () => {
    handleCloseMenu()
    logout()
    navigate('/login')
  }

  const initials = user?.full_name
    ? user.full_name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
    : 'U'

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 3,
        px: 4,
        py: 2,
        background: 'rgba(255, 255, 255, 0.8)',
        backdropFilter: 'blur(12px)',
        borderBottom: '1px solid rgba(124, 58, 237, 0.08)',
        minHeight: 80,
        flexShrink: 0,
        position: 'sticky',
        top: 0,
        zIndex: 5,
      }}
    >
      {/* Page title */}
      <Box sx={{ flex: 1 }}>
        <Typography variant="h5" sx={{ fontWeight: 900, color: '#1E1B4B', lineHeight: 1.2, letterSpacing: '-0.5px' }}>
          {title}
        </Typography>
      </Box>

      {/* Search bar */}
      <Box
        component="form"
        onSubmit={(e) => {
          e.preventDefault()
          if (searchInput.trim()) {
            navigate(`/facilities?search=${encodeURIComponent(searchInput.trim())}`)
          } else {
            navigate(`/facilities`)
          }
        }}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
          backgroundColor: '#fff',
          borderRadius: '16px',
          px: 2.5,
          py: 1,
          width: 320,
          border: '1px solid rgba(124,58,237,0.1)',
          boxShadow: '0 4px 12px rgba(0,0,0,0.03)',
          '&:focus-within': {
            border: '1px solid #7C3AED',
            boxShadow: '0 8px 24px rgba(124,58,237,0.12)',
            transform: 'translateY(-1px)',
          },
          transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      >
        <IconButton type="submit" size="small" sx={{ p: '2px' }}>
          <SearchIcon sx={{ color: '#9CA3AF', fontSize: '1.2rem' }} />
        </IconButton>
        <InputBase
          placeholder="Search..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          sx={{ fontSize: '0.875rem', color: '#374151', flex: 1 }}
        />
        {searchInput && (
          <IconButton size="small" onClick={handleClearSearch} sx={{ p: '2px' }}>
            <ClearIcon sx={{ color: '#9CA3AF', fontSize: '1.1rem' }} />
          </IconButton>
        )}
      </Box>

      {/* Notifications */}
      <IconButton
        sx={{
          width: 44,
          height: 44,
          backgroundColor: '#fff',
          borderRadius: '14px',
          border: '1px solid rgba(124,58,237,0.1)',
          boxShadow: '0 4px 12px rgba(0,0,0,0.02)',
          transition: 'all 0.2s ease',
          '&:hover': { backgroundColor: '#F5F3FF', transform: 'translateY(-1px)' },
        }}
      >
        <Badge badgeContent={3} color="secondary" sx={{ '& .MuiBadge-badge': { fontSize: '0.65rem', fontWeight: 800, background: 'linear-gradient(135deg, #EC4899, #F472B6)' } }}>
          <NotificationsNoneIcon sx={{ fontSize: '1.4rem', color: '#7C3AED' }} />
        </Badge>
      </IconButton>

      {/* Avatar & Menu */}
      <Box>
        <Avatar
          onClick={handleOpenMenu}
          sx={{
            width: 44,
            height: 44,
            background: 'linear-gradient(135deg, #7C3AED 0%, #F472B6 100%)',
            fontSize: '1rem',
            fontWeight: 800,
            cursor: 'pointer',
            boxShadow: '0 8px 16px rgba(124,58,237,0.25)',
            border: '2px solid #fff',
            transition: 'all 0.2s ease',
            '&:hover': { transform: 'scale(1.05)', boxShadow: '0 10px 20px rgba(124,58,237,0.35)' }
          }}
        >
          {initials}
        </Avatar>
        <Menu
          anchorEl={anchorEl}
          open={Boolean(anchorEl)}
          onClose={handleCloseMenu}
          PaperProps={{
            elevation: 0,
            sx: {
              overflow: 'visible',
              filter: 'drop-shadow(0px 2px 8px rgba(0,0,0,0.12))',
              mt: 1.5,
              borderRadius: '12px',
              minWidth: 180,
              '& .MuiAvatar-root': {
                width: 32,
                height: 32,
                ml: -0.5,
                mr: 1,
              },
              '&:before': {
                content: '""',
                display: 'block',
                position: 'absolute',
                top: 0,
                right: 14,
                width: 10,
                height: 10,
                bgcolor: 'background:paper',
                transform: 'translateY(-50%) rotate(45deg)',
                zIndex: 0,
              },
            },
          }}
          transformOrigin={{ horizontal: 'right', vertical: 'top' }}
          anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
        >
          <Box sx={{ px: 2, py: 1.5 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#1E1B4B' }}>
              {user?.full_name}
            </Typography>
            <Typography variant="body2" sx={{ color: '#6B7280', fontSize: '0.75rem' }}>
              {user?.email}
            </Typography>
          </Box>
          <Divider />
          <MenuItem onClick={handleCloseMenu}>
            <ListItemIcon>
              <PersonOutlineIcon fontSize="small" />
            </ListItemIcon>
            My Profile
          </MenuItem>
          <MenuItem onClick={handleLogout} sx={{ color: '#EF4444' }}>
            <ListItemIcon>
              <LogoutIcon fontSize="small" sx={{ color: '#EF4444' }} />
            </ListItemIcon>
            Logout
          </MenuItem>
        </Menu>
      </Box>
    </Box>
  )
}

export default Header
