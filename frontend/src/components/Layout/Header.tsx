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
        gap: 3,
        px: { xs: 2, md: 3 },
        py: 2,
        background: 'rgba(248, 250, 252, 0.92)',
        backdropFilter: 'blur(18px)',
        borderBottom: '1px solid rgba(226, 232, 240, 0.9)',
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

      {/* Recent successful actions are separate from row selection and notifications. */}
      <RecentActivityMenu />

      {/* Notifications */}
      <IconButton
        onClick={handleOpenNotifications}
        sx={{
          width: 44,
          height: 44,
          backgroundColor: '#fff',
          borderRadius: '16px',
          border: '1px solid #E8ECF4',
          boxShadow: '0 12px 30px rgba(71,85,105,0.06)',
          transition: 'all 0.2s ease',
          '&:hover': { backgroundColor: '#F3F0FF', transform: 'translateY(-1px)' },
        }}
      >
        <Badge badgeContent={unreadCount} color="secondary" sx={{ '& .MuiBadge-badge': { fontSize: '0.65rem', fontWeight: 800, background: 'linear-gradient(135deg, #EC4899, #F472B6)' } }}>
          <NotificationsNoneIcon sx={{ fontSize: '1.4rem', color: '#7C3AED' }} />
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
            border: '1px solid #E5E7EB',
            boxShadow: '0 20px 50px rgba(15,23,42,0.16)',
            overflow: 'hidden',
          },
        }}
        transformOrigin={{ horizontal: 'right', vertical: 'top' }}
        anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
      >
        <Box sx={{ px: 2, py: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
          <Box>
            <Typography sx={{ fontWeight: 900, color: '#1E1B4B' }}>Notifications</Typography>
            <Typography variant="caption" sx={{ color: '#6B7280' }}>{unreadCount} unread</Typography>
          </Box>
          <Button
            size="small"
            disabled={unreadCount === 0 || markAllReadMutation.isPending}
            onClick={() => markAllReadMutation.mutate()}
            sx={{ color: '#7C3AED', fontWeight: 800 }}
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
              <Typography sx={{ fontWeight: 800, color: '#374151' }}>No notifications</Typography>
              <Typography variant="body2" sx={{ color: '#9CA3AF' }}>You are all caught up.</Typography>
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
                  backgroundColor: notification.is_read ? '#fff' : '#F5F3FF',
                  '&:hover': { backgroundColor: notification.is_read ? '#F9FAFB' : '#EDE9FE' },
                }}
              >
                <Box
                  sx={{
                    width: 9,
                    height: 9,
                    borderRadius: '50%',
                    mt: 0.7,
                    backgroundColor: notification.is_read ? '#CBD5E1' : '#7C3AED',
                    flexShrink: 0,
                  }}
                />
                <Box sx={{ minWidth: 0 }}>
                  <Typography sx={{ fontWeight: 900, color: '#111827', fontSize: '0.88rem' }}>
                    {notification.title}
                  </Typography>
                  {notification.message && (
                    <Typography variant="body2" sx={{ color: '#6B7280', fontSize: '0.78rem', mt: 0.25 }}>
                      {notification.message}
                    </Typography>
                  )}
                  <Typography variant="caption" sx={{ color: '#9CA3AF', display: 'block', mt: 0.5 }}>
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
          <MenuItem onClick={handleProfile}>
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
