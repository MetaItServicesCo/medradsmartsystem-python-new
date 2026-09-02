import { useState, useEffect } from 'react'
import {
  Box, Typography, Tabs, Tab, TextField, InputAdornment,
  List, ListItemButton, ListItemAvatar, ListItemText, Avatar,
  Badge, Chip, IconButton, Tooltip, Divider, Button,
  Dialog, DialogTitle, DialogContent, DialogActions,
} from '@mui/material'
import SearchIcon from '@mui/icons-material/Search'
import GroupAddIcon from '@mui/icons-material/GroupAdd'
import PersonAddIcon from '@mui/icons-material/PersonAdd'
import PeopleIcon from '@mui/icons-material/People'
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline'
import { useQuery } from '@tanstack/react-query'
import { fetchFriends, fetchWorkspaces, fetchUnreadCounts, fetchFriendRequests } from '@/api/chat'
import { useChatStore } from '@/stores/chatStore'
import MessagePanel from './MessagePanel'
import WorkspacePanel from './WorkspacePanel'
import FriendRequests from './FriendRequests'
import CreateWorkspaceModal from './CreateWorkspaceModal'
import CallPanel from './CallPanel'

const safeText = (value: unknown, fallback = '') => {
  if (typeof value === 'string') return value
  if (value === null || value === undefined) return fallback
  return String(value)
}

const displayNameFor = (user: any) => {
  const name = safeText(user?.full_name).trim()
  const username = safeText(user?.username).trim()
  if (name) return name
  if (username) return username
  return user?.id ? `User #${user.id}` : 'Unknown User'
}

const initialsFor = (value: unknown) => {
  const text = safeText(value, 'U').trim() || 'U'
  return text
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

const Chat = () => {
  const { connect, isConnected, onlineUsers, unreadCounts, incomingCall, clearIncomingCall, sendWsMessage } = useChatStore()

  const [tab, setTab] = useState(0) // 0=DMs, 1=Workspaces
  const [selectedUser, setSelectedUser] = useState<any>(null)
  const [selectedWorkspace, setSelectedWorkspace] = useState<any>(null)
  const [showRequests, setShowRequests] = useState(false)
  const [showCreateWs, setShowCreateWs] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [activeIncomingCall, setActiveIncomingCall] = useState<{
    senderId: number
    callType: 'voice' | 'video'
    offer: any
    caller: any
  } | null>(null)

  // Connect WebSocket on mount
  useEffect(() => {
    connect()
  }, [connect])

  // Fetch friends list
  const { data: friends = [], refetch: refetchFriends } = useQuery({
    queryKey: ['friends'],
    queryFn: fetchFriends,
  })
  const friendsList = Array.isArray(friends) ? friends : []

  // Fetch workspaces
  const { data: workspacesData, refetch: refetchWorkspaces } = useQuery({
    queryKey: ['workspaces'],
    queryFn: fetchWorkspaces,
  })
  const workspaces = Array.isArray(workspacesData?.items) ? workspacesData.items : []

  // Fetch unread counts
  useQuery({
    queryKey: ['unread-counts'],
    queryFn: fetchUnreadCounts,
    refetchInterval: 15000,
  })
  
  // Fetch pending requests count
  const { data: pendingRequests } = useQuery({
    queryKey: ['friend-requests', 'received'],
    queryFn: () => fetchFriendRequests('received', 'pending'),
    refetchInterval: 30000,
  })
  const pendingCount = pendingRequests?.total || 0

  const incomingCaller = incomingCall
    ? friendsList.find((f: any) => f.id === incomingCall.senderId) || {
        id: incomingCall.senderId,
        full_name: incomingCall.senderName || `User #${incomingCall.senderId}`,
        avatar_url: incomingCall.senderAvatar,
      }
    : null

  const handleAcceptCall = () => {
    if (!incomingCall || !incomingCaller) return
    setActiveIncomingCall({
      senderId: incomingCall.senderId,
      callType: incomingCall.callType,
      offer: incomingCall.offer,
      caller: incomingCaller,
    })
    clearIncomingCall()
  }

  const handleRejectCall = () => {
    if (incomingCall) {
      sendWsMessage({ type: 'call_reject', target_id: incomingCall.senderId })
    }
    clearIncomingCall()
  }

  const normalizedSearch = searchTerm.toLowerCase().trim()
  const filteredFriends = friendsList.filter((f: any) => {
    const haystack = `${displayNameFor(f)} ${safeText(f?.username)}`.toLowerCase()
    return haystack.includes(normalizedSearch)
  })

  const filteredWorkspaces = workspaces.filter((w: any) =>
    safeText(w?.name, 'Workspace').toLowerCase().includes(normalizedSearch)
  )

  return (
    <Box className="page-enter" sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, height: { xs: 'calc(100dvh - 156px)', md: 'calc(100dvh - 130px)' }, minHeight: 480, gap: { xs: 1, md: 2 } }}>
      {/* Left sidebar — Conversations list */}
      <Box sx={{
        width: { xs: '100%', md: 320 }, height: { xs: 220, md: 'auto' }, flexShrink: 0, backgroundColor: '#fff',
        borderRadius: '20px', display: 'flex', flexDirection: 'column',
        boxShadow: '0 4px 24px rgba(124,58,237,0.08)',
        border: '1px solid rgba(124,58,237,0.06)',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <Box sx={{ p: 2, pb: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
            <Typography variant="h6" sx={{ fontWeight: 700, color: '#1E1B4B' }}>
              Messages
            </Typography>
            <Box sx={{ display: 'flex', gap: 0.5 }}>
              <Tooltip title="Friend Requests">
                <IconButton size="small" onClick={() => setShowRequests(true)}
                  sx={{ color: '#7C3AED', backgroundColor: '#F5F3FF', '&:hover': { backgroundColor: '#EDE9FE' } }}>
                  <Badge badgeContent={pendingCount} color="error" overlap="rectangular" 
                    sx={{ '& .MuiBadge-badge': { fontSize: '0.6rem', height: 16, minWidth: 16 } }}>
                    <PersonAddIcon fontSize="small" />
                  </Badge>
                </IconButton>
              </Tooltip>
              {tab === 1 && (
                <Tooltip title="Create Workspace">
                  <IconButton size="small" onClick={() => setShowCreateWs(true)}
                    sx={{ color: '#7C3AED', backgroundColor: '#F5F3FF', '&:hover': { backgroundColor: '#EDE9FE' } }}>
                    <GroupAddIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              )}
            </Box>
          </Box>

          {/* Connection status */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 1.5 }}>
            <Box sx={{
              width: 8, height: 8, borderRadius: '50%',
              backgroundColor: isConnected ? '#10B981' : '#EF4444',
            }} />
            <Typography variant="caption" sx={{ color: '#9CA3AF' }}>
              {isConnected ? 'Connected' : 'Reconnecting...'}
            </Typography>
          </Box>

          {/* Search */}
          <TextField
            fullWidth size="small" placeholder="Search conversations..."
            value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon sx={{ color: '#9CA3AF', fontSize: '1.1rem' }} />
                </InputAdornment>
              ),
            }}
            sx={{ mb: 1 }}
          />

          {/* Tabs */}
          <Tabs value={tab} onChange={(_, v) => { setTab(v); setSelectedUser(null); setSelectedWorkspace(null) }}
            sx={{
              minHeight: 36,
              '& .MuiTab-root': { minHeight: 36, py: 0.5, fontSize: '0.8rem', fontWeight: 600, textTransform: 'none' },
              '& .MuiTabs-indicator': { backgroundColor: '#7C3AED', height: 3, borderRadius: 2 },
            }}
          >
            <Tab icon={<ChatBubbleOutlineIcon sx={{ fontSize: '1rem' }} />} iconPosition="start" label="Direct" />
            <Tab icon={<PeopleIcon sx={{ fontSize: '1rem' }} />} iconPosition="start" label="Workspaces" />
          </Tabs>
        </Box>

        <Divider />

        {/* Conversation list */}
        <Box sx={{ flex: 1, overflowY: 'auto' }}>
          {tab === 0 ? (
            <List disablePadding>
              {filteredFriends.length === 0 ? (
                <Box sx={{ p: 3, textAlign: 'center' }}>
                  <ChatBubbleOutlineIcon sx={{ fontSize: '2.5rem', color: '#E9D5FF', mb: 1 }} />
                  <Typography variant="body2" sx={{ color: '#9CA3AF' }}>
                    No conversations yet
                  </Typography>
                  <Button size="small" onClick={() => setShowRequests(true)}
                    sx={{ mt: 1, color: '#7C3AED', textTransform: 'none' }}>
                    Find people to chat with
                  </Button>
                </Box>
              ) : (
                filteredFriends.map((friend: any) => {
                  const isOnline = onlineUsers.includes(friend.id)
                  const unread = unreadCounts[String(friend.id)] || 0
                  const isSelected = selectedUser?.id === friend.id
                  const friendName = displayNameFor(friend)
                  return (
                    <ListItemButton
                      key={friend.id}
                      selected={isSelected}
                      onClick={() => { setSelectedUser(friend); setSelectedWorkspace(null) }}
                      sx={{
                        py: 1.5, px: 2,
                        '&.Mui-selected': { backgroundColor: '#F5F3FF' },
                        '&:hover': { backgroundColor: '#FAFAFF' },
                      }}
                    >
                      <ListItemAvatar>
                        <Badge
                          overlap="circular"
                          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                          badgeContent={
                            <Box sx={{
                              width: 10, height: 10, borderRadius: '50%',
                              backgroundColor: isOnline ? '#10B981' : '#D1D5DB',
                              border: '2px solid #fff',
                            }} />
                          }
                        >
                          <Avatar sx={{
                            width: 42, height: 42,
                            backgroundColor: '#7C3AED',
                            fontSize: '0.9rem', fontWeight: 700,
                          }}>
                            {initialsFor(friendName)}
                          </Avatar>
                        </Badge>
                      </ListItemAvatar>
                      <ListItemText
                        primary={friendName}
                        secondary={isOnline ? 'Online' : 'Offline'}
                        primaryTypographyProps={{ fontWeight: 600, fontSize: '0.875rem', color: '#1E1B4B' }}
                        secondaryTypographyProps={{ fontSize: '0.75rem', color: isOnline ? '#10B981' : '#9CA3AF' }}
                      />
                      {unread > 0 && (
                        <Chip label={unread} size="small" sx={{
                          height: 22, minWidth: 22, backgroundColor: '#7C3AED',
                          color: '#fff', fontWeight: 700, fontSize: '0.7rem',
                        }} />
                      )}
                    </ListItemButton>
                  )
                })
              )}
            </List>
          ) : (
            <List disablePadding>
              {filteredWorkspaces.length === 0 ? (
                <Box sx={{ p: 3, textAlign: 'center' }}>
                  <PeopleIcon sx={{ fontSize: '2.5rem', color: '#E9D5FF', mb: 1 }} />
                  <Typography variant="body2" sx={{ color: '#9CA3AF' }}>
                    No workspaces yet
                  </Typography>
                  <Button size="small" onClick={() => setShowCreateWs(true)}
                    sx={{ mt: 1, color: '#7C3AED', textTransform: 'none' }}>
                    Create a workspace
                  </Button>
                </Box>
              ) : (
                filteredWorkspaces.map((ws: any) => {
                  const isSelected = selectedWorkspace?.id === ws.id
                  const workspaceName = safeText(ws?.name, 'Workspace')
                  return (
                    <ListItemButton
                      key={ws.id}
                      selected={isSelected}
                      onClick={() => { setSelectedWorkspace(ws); setSelectedUser(null) }}
                      sx={{
                        py: 1.5, px: 2,
                        '&.Mui-selected': { backgroundColor: '#F5F3FF' },
                        '&:hover': { backgroundColor: '#FAFAFF' },
                      }}
                    >
                      <ListItemAvatar>
                        <Avatar sx={{
                          width: 42, height: 42,
                          background: 'linear-gradient(135deg, #7C3AED, #EC4899)',
                          fontSize: '1rem', fontWeight: 700,
                        }}>
                          {workspaceName[0]?.toUpperCase() || 'W'}
                        </Avatar>
                      </ListItemAvatar>
                      <ListItemText
                        primary={workspaceName}
                        secondary={`${ws.member_count ?? 0} members`}
                        primaryTypographyProps={{ fontWeight: 600, fontSize: '0.875rem', color: '#1E1B4B' }}
                        secondaryTypographyProps={{ fontSize: '0.75rem', color: '#9CA3AF' }}
                      />
                    </ListItemButton>
                  )
                })
              )}
            </List>
          )}
        </Box>
      </Box>

      {/* Main content — Message panel or empty state */}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {selectedUser ? (
          <MessagePanel user={selectedUser} />
        ) : selectedWorkspace ? (
          <WorkspacePanel workspace={selectedWorkspace} onRefresh={refetchWorkspaces} />
        ) : (
          <Box sx={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
            backgroundColor: '#fff', borderRadius: '20px',
            boxShadow: '0 4px 24px rgba(124,58,237,0.08)',
            border: '1px solid rgba(124,58,237,0.06)',
          }}>
            <Box sx={{ textAlign: 'center' }}>
              <Box sx={{
                width: 80, height: 80, borderRadius: '50%',
                background: 'linear-gradient(135deg, #F5F3FF, #EDE9FE)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                mx: 'auto', mb: 2,
              }}>
                <ChatBubbleOutlineIcon sx={{ fontSize: '2.5rem', color: '#7C3AED' }} />
              </Box>
              <Typography variant="h6" sx={{ fontWeight: 700, color: '#1E1B4B', mb: 0.5 }}>
                Select a conversation
              </Typography>
              <Typography variant="body2" sx={{ color: '#9CA3AF', maxWidth: 280 }}>
                Choose a friend or workspace from the sidebar to start chatting
              </Typography>
            </Box>
          </Box>
        )}
      </Box>

      {/* Friend Requests Drawer */}
      <FriendRequests
        open={showRequests}
        onClose={() => { setShowRequests(false); refetchFriends() }}
      />

      {/* Create Workspace Modal */}
      <CreateWorkspaceModal
        open={showCreateWs}
        onClose={() => { setShowCreateWs(false); refetchWorkspaces() }}
      />

      <Dialog open={!!incomingCall && !activeIncomingCall} onClose={handleRejectCall} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 800 }}>
          Incoming {incomingCall?.callType === 'video' ? 'Video' : 'Voice'} Call
        </DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, py: 1 }}>
            <Avatar sx={{ width: 52, height: 52, backgroundColor: '#7C3AED', fontWeight: 800 }}>
              {initialsFor(displayNameFor(incomingCaller))}
            </Avatar>
            <Box>
              <Typography sx={{ fontWeight: 700, color: '#1E1B4B' }}>
                {displayNameFor(incomingCaller)}
              </Typography>
              <Typography variant="body2" sx={{ color: '#6B7280' }}>
                Wants to start a {incomingCall?.callType || 'voice'} call.
              </Typography>
            </Box>
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={handleRejectCall} color="error" variant="outlined">Decline</Button>
          <Button onClick={handleAcceptCall} variant="contained" sx={{ backgroundColor: '#7C3AED' }}>Accept</Button>
        </DialogActions>
      </Dialog>

      {activeIncomingCall && (
        <CallPanel
          targetUser={activeIncomingCall.caller}
          callType={activeIncomingCall.callType}
          incomingOffer={activeIncomingCall.offer}
          incomingFromUserId={activeIncomingCall.senderId}
          onEnd={() => setActiveIncomingCall(null)}
        />
      )}
    </Box>
  )
}

export default Chat
