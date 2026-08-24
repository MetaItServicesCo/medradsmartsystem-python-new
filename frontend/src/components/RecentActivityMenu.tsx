import { useState, type MouseEvent } from 'react'
import {
  Badge,
  Box,
  Button,
  Divider,
  IconButton,
  Menu,
  MenuItem,
  Tooltip,
  Typography,
} from '@mui/material'
import HistoryIcon from '@mui/icons-material/History'
import MyLocationIcon from '@mui/icons-material/MyLocation'
import CloseIcon from '@mui/icons-material/Close'
import { useListContext } from '@/contexts/ListContext'

const timeLabel = (timestamp: number) => {
  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000))
  if (elapsedSeconds < 60) return 'Just now'
  const minutes = Math.floor(elapsedSeconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return new Date(timestamp).toLocaleDateString()
}

const RecentActivityMenu = () => {
  const { recentActivities, showActivity, dismissActivity, clearRecentActivities } = useListContext()
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)

  const openMenu = (event: MouseEvent<HTMLElement>) => setAnchor(event.currentTarget)
  const closeMenu = () => setAnchor(null)

  return (
    <>
      <Tooltip title="Recent activity">
        <IconButton
          aria-label="Open recent activity"
          aria-controls={anchor ? 'recent-activity-menu' : undefined}
          aria-haspopup="true"
          aria-expanded={anchor ? 'true' : undefined}
          onClick={openMenu}
          sx={{
            width: 44,
            height: 44,
            backgroundColor: '#fff',
            borderRadius: '16px',
            border: '1px solid #E8ECF4',
            boxShadow: '0 12px 30px rgba(71,85,105,0.06)',
            '&:hover': { backgroundColor: '#F3F0FF' },
          }}
        >
          <Badge
            badgeContent={recentActivities.length}
            color="secondary"
            invisible={recentActivities.length === 0}
            sx={{ '& .MuiBadge-badge': { fontSize: '0.65rem', fontWeight: 800 } }}
          >
            <HistoryIcon sx={{ fontSize: '1.35rem', color: '#7C3AED' }} />
          </Badge>
        </IconButton>
      </Tooltip>

      <Menu
        id="recent-activity-menu"
        anchorEl={anchor}
        open={Boolean(anchor)}
        onClose={closeMenu}
        PaperProps={{
          elevation: 0,
          sx: {
            mt: 1.5,
            width: 420,
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
            <Typography sx={{ fontWeight: 900, color: '#1E1B4B' }}>Recent activity</Typography>
            <Typography variant="caption" sx={{ color: '#6B7280' }}>
              Successful updates from this session
            </Typography>
          </Box>
          <Button
            size="small"
            disabled={recentActivities.length === 0}
            onClick={() => {
              clearRecentActivities()
              closeMenu()
            }}
            sx={{ color: '#7C3AED', fontWeight: 800, textTransform: 'none' }}
          >
            Clear all
          </Button>
        </Box>
        <Divider />

        {recentActivities.length === 0 ? (
          <Box sx={{ px: 2.5, py: 4, textAlign: 'center' }}>
            <HistoryIcon sx={{ color: '#CBD5E1', fontSize: 32, mb: 0.5 }} />
            <Typography sx={{ fontWeight: 800, color: '#374151' }}>No recent updates</Typography>
            <Typography variant="body2" sx={{ color: '#9CA3AF' }}>
              Completed actions will appear here.
            </Typography>
          </Box>
        ) : (
          <Box sx={{ maxHeight: 390, overflowY: 'auto', py: 0.5 }}>
            {recentActivities.map(activity => (
              <MenuItem
                key={activity.id}
                onClick={() => {
                  closeMenu()
                  showActivity(activity)
                }}
                sx={{ gap: 1.25, px: 2, py: 1.35, whiteSpace: 'normal', alignItems: 'flex-start' }}
              >
                <Box
                  sx={{
                    mt: 0.25,
                    width: 34,
                    height: 34,
                    borderRadius: '11px',
                    display: 'grid',
                    placeItems: 'center',
                    bgcolor: '#F3F0FF',
                    color: '#7C3AED',
                    flexShrink: 0,
                  }}
                >
                  <MyLocationIcon sx={{ fontSize: 18 }} />
                </Box>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography noWrap sx={{ color: '#1E1B4B', fontSize: 13.5, fontWeight: 900 }}>
                    {activity.label}
                  </Typography>
                  <Typography sx={{ color: '#64748B', fontSize: 12, lineHeight: 1.35 }}>
                    {activity.message || 'Update completed successfully.'}
                  </Typography>
                  <Typography variant="caption" sx={{ color: '#94A3B8', textTransform: 'capitalize' }}>
                    {activity.scope.replace(/-/g, ' ')} · {timeLabel(activity.updatedAt)}
                  </Typography>
                </Box>
                <IconButton
                  size="small"
                  aria-label={`Dismiss ${activity.label}`}
                  onClick={event => {
                    event.stopPropagation()
                    dismissActivity(activity.id)
                  }}
                  sx={{ mt: -0.5, mr: -0.75 }}
                >
                  <CloseIcon sx={{ fontSize: 17 }} />
                </IconButton>
              </MenuItem>
            ))}
          </Box>
        )}
      </Menu>
    </>
  )
}

export default RecentActivityMenu
