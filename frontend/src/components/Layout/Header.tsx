import { useState, useEffect } from 'react'
import {
  Box, Avatar, Badge, IconButton, Typography,
  Menu, MenuItem, ListItemIcon, Divider, Button, CircularProgress
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import NotificationsNoneIcon from '@mui/icons-material/NotificationsNone'
import LogoutIcon from '@mui/icons-material/Logout'
import PersonOutlineIcon from '@mui/icons-material/PersonOutline'
import { useAuthStore } from '@/stores/authStore'
import { fetchCurrentUser, resolveUploadUrl } from '@/api/users'
import { fetchNotifications, markAllNotificationsRead, markNotificationRead, type NotificationItem } from '@/api/notifications'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import RecentActivityMenu from '../RecentActivityMenu'
import { palette } from '@/theme/palette'

interface HeaderProps {
  title: string
}

const Header = ({ title }: HeaderProps) => {
  const user = useAuthStore((s) => s.user)
  const setUser = useAuthStore((s) => s.setUser)
  const logout = useAuthStore((s) => s.logout)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null)
  const [notificationAnchorEl, setNotificationAnchorEl] = useState<null | HTMLElement>(null)

  const { data: notificationData, isLoading: notificationsLoading } = useQuery({
    queryKey: ['notifications-header'],
    queryFn: () => fetchNotifications({ limit: 12 }),
    refetchInterval: 15000,
    // Don't poll while the tab is in the background, and treat data as fresh
    // between ticks so route changes don't trigger extra refetches. React
    // Query's structural sharing already keeps the header from re-rendering
    // when the notifications are unchanged.
    refetchIntervalInBackground: false,
    staleTime: 15000,
  })

  const { data: freshUser } = useQuery({
    queryKey: ['current-user-header'],
    queryFn: fetchCurrentUser,
    staleTime: 60000,
  })

  useEffect(() => {
    if (freshUser) setUser(freshUser)
  }, [freshUser, setUser])

  const markReadMutation = useMutation({
    mutationFn: markNotificationRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications-header'] })
    },
  })

  const markAllReadMutation = useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications-header'] })
    },
  })

  const handleOpenMenu = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget)
  }

  const handleCloseMenu = () => {
    setAnchorEl(null)
  }

  const handleOpenNotifications = (event: React.MouseEvent<HTMLElement>) => {
    setNotificationAnchorEl(event.currentTarget)
  }

  const handleCloseNotifications = () => {
    setNotificationAnchorEl(null)
  }

  const handleLogout = () => {
    handleCloseMenu()
    logout()
    navigate('/login')
  }

  const handleProfile = () => {
    handleCloseMenu()
    navigate('/profile')
  }

  const initials = user?.full_name
    ? user.full_name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
    : 'U'

  const handleNotificationClick = (notification: NotificationItem) => {
    if (!notification.is_read) {
      markReadMutation.mutate(notification.id)
    }
    handleCloseNotifications()
    if (notification.link_url) {
      navigate(notification.link_url)
    }
  }

  const notifications = notificationData?.items || []
  const unreadCount = notificationData?.unread_count || 0

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: { xs: 0.75, sm: 1.5, md: 3 },
        px: { xs: 1.5, sm: 2, md: 3 },
        py: { xs: 1.25, sm: 2 },
        background: 'rgba(248, 250, 252, 0.92)',
        backdropFilter: 'blur(18px)',
        borderBottom: '1px solid rgba(226, 232, 240, 0.9)',
        minHeight: { xs: 64, sm: 80 },
        flexShrink: 0,
        position: 'sticky',
        top: 0,
        zIndex: 5,
      }}
    >
      {/* Page title */}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography noWrap variant="h5" sx={{ fontWeight: 900, color: palette.ink, lineHeight: 1.2, letterSpacing: '-0.5px', fontSize: { xs: '1rem', sm: '1.5rem' } }}>
          {title}
        </Typography>
      </Box>

      {/* Recent successful actions are separate from row selection and notifications. */}
      <RecentActivityMenu />

      {/* Notifications */}
      <IconButton
        onClick={handleOpenNotifications}
        sx={{
          width: { xs: 38, sm: 44 },
          height: { xs: 38, sm: 44 },
          backgroundColor: '#fff',
          borderRadius: '16px',
          border: '1px solid #E8ECF4',
          boxShadow: '0 12px 30px rgba(71,85,105,0.06)',
          transition: 'all 0.2s ease',
          '&:hover': { backgroundColor: '#f0fffb', transform: 'translateY(-1px)' },
        }}
      >
        <Badge badgeContent={unreadCount} color="secondary" sx={{ '& .MuiBadge-badge': { fontSize: '0.65rem', fontWeight: 800, background: `linear-gradient(135deg, ${palette.accent}, ${palette.accentLight})` } }}>
          <NotificationsNoneIcon sx={{ fontSize: '1.4rem', color: palette.brand }} />
        </Badge>
      </IconButton>
      <Menu
        anchorEl={notificationAnchorEl}
        open={Boolean(notificationAnchorEl)}
        onClose={handleCloseNotifications}
        PaperProps={{
          elevation: 0,
          sx: {
            mt: 1.5,
            width: 380,
            maxWidth: 'calc(100vw - 24px)',
            borderRadius: '16px',
            border: `1px solid ${palette.border}`,
            boxShadow: '0 20px 50px rgba(15,23,42,0.16)',
            overflow: 'hidden',
          },
        }}
        transformOrigin={{ horizontal: 'right', vertical: 'top' }}
        anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
      >
        <Box sx={{ px: 2, py: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
          <Box>
            <Typography sx={{ fontWeight: 900, color: palette.ink }}>Notifications</Typography>
            <Typography variant="caption" sx={{ color: palette.textMuted }}>{unreadCount} unread</Typography>
          </Box>
          <Button
            size="small"
            disabled={unreadCount === 0 || markAllReadMutation.isPending}
            onClick={() => markAllReadMutation.mutate()}
            sx={{ color: palette.brand, fontWeight: 800 }}
          >
            Mark all read
          </Button>
        </Box>
        <Divider />
        <Box sx={{ maxHeight: 420, overflowY: 'auto', py: 0.5 }}>
          {notificationsLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress size={24} />
            </Box>
          ) : notifications.length === 0 ? (
            <Box sx={{ px: 2, py: 4, textAlign: 'center' }}>
              <Typography sx={{ fontWeight: 800, color: palette.textStrong }}>No notifications</Typography>
              <Typography variant="body2" sx={{ color: palette.textDisabled }}>You are all caught up.</Typography>
            </Box>
          ) : (
            notifications.map((notification) => (
              <MenuItem
                key={notification.id}
                onClick={() => handleNotificationClick(notification)}
                sx={{
                  alignItems: 'flex-start',
                  gap: 1.5,
                  px: 2,
                  py: 1.4,
                  whiteSpace: 'normal',
                  backgroundColor: notification.is_read ? '#fff' : palette.brandTint,
                  '&:hover': { backgroundColor: notification.is_read ? palette.surfaceFaint : palette.brandSoft },
                }}
              >
                <Box
                  sx={{
                    width: 9,
                    height: 9,
                    borderRadius: '50%',
                    mt: 0.7,
                    backgroundColor: notification.is_read ? '#CBD5E1' : palette.brand,
                    flexShrink: 0,
                  }}
                />
                <Box sx={{ minWidth: 0 }}>
                  <Typography sx={{ fontWeight: 900, color: '#111827', fontSize: '0.88rem' }}>
                    {notification.title}
                  </Typography>
                  {notification.message && (
                    <Typography variant="body2" sx={{ color: palette.textMuted, fontSize: '0.78rem', mt: 0.25 }}>
                      {notification.message}
                    </Typography>
                  )}
                  <Typography variant="caption" sx={{ color: palette.textDisabled, display: 'block', mt: 0.5 }}>
                    {new Date(notification.created_at).toLocaleString()}
                  </Typography>
                </Box>
              </MenuItem>
            ))
          )}
        </Box>
      </Menu>

      {/* Avatar & Menu */}
      <Box>
        <Avatar
          onClick={handleOpenMenu}
          src={resolveUploadUrl(user?.avatar_url)}
          sx={{
            width: { xs: 38, sm: 44 },
            height: { xs: 38, sm: 44 },
            // The brand the landing page and dashboard settled on, in place
            // of the old two-tone gradient. Solid, so it reads as one
            // colour beside the rest of the header, and dark enough to
            // carry the white initials.
            background: palette.brand,
            fontSize: '1rem',
            fontWeight: 800,
            cursor: 'pointer',
            boxShadow: '0 8px 16px rgba(4,120,87,0.25)',
            border: '2px solid #fff',
            transition: 'all 0.2s ease',
            '&:hover': { transform: 'scale(1.05)', boxShadow: '0 10px 20px rgba(4,120,87,0.35)' }
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
            <Typography variant="subtitle2" sx={{ fontWeight: 700, color: palette.ink }}>
              {user?.full_name}
            </Typography>
            <Typography variant="body2" sx={{ color: palette.textMuted, fontSize: '0.75rem' }}>
              {user?.email}
            </Typography>
          </Box>
          <Divider />
          <MenuItem onClick={handleProfile}>
            <ListItemIcon>
              <PersonOutlineIcon fontSize="small" />
            </ListItemIcon>
            My Profile
          </MenuItem>
          <MenuItem onClick={handleLogout} sx={{ color: palette.dangerBright }}>
            <ListItemIcon>
              <LogoutIcon fontSize="small" sx={{ color: palette.dangerBright }} />
            </ListItemIcon>
            Logout
          </MenuItem>
        </Menu>
      </Box>
    </Box>
  )
}

export default Header
