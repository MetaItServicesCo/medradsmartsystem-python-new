import { useState, useEffect } from 'react'
import {
  Drawer, Box, Typography, TextField, InputAdornment,
  List, ListItemButton, ListItemAvatar, ListItemText,
  Avatar, Button, IconButton, Chip, Divider, Tabs, Tab,
  CircularProgress,
} from '@mui/material'
import SearchIcon from '@mui/icons-material/Search'
import CloseIcon from '@mui/icons-material/Close'
import CheckIcon from '@mui/icons-material/Check'
import PersonAddIcon from '@mui/icons-material/PersonAdd'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-toastify'
import {
  fetchFriendRequests, acceptFriendRequest, rejectFriendRequest,
  sendFriendRequest, type FriendRequestData,
} from '@/api/chat'
import { searchUsers, type UserSearchResult } from '@/api/users'
import { palette } from '@/theme/palette'

interface Props {
  open: boolean
  onClose: () => void
}

const FriendRequests = ({ open, onClose }: Props) => {
  const queryClient = useQueryClient()
  const [tab, setTab] = useState(0) // 0=received, 1=sent, 2=search
  const [search, setSearch] = useState('')
  const [searchResults, setSearchResults] = useState<UserSearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [requestMessages, setRequestMessages] = useState<Record<number, string>>({})
  const [expandedUserId, setExpandedUserId] = useState<number | null>(null)

  const { data: received, isLoading: loadingReceived } = useQuery({
    queryKey: ['friend-requests', 'received'],
    queryFn: () => fetchFriendRequests('received', 'pending'),
    enabled: open,
  })

  const { data: sent, isLoading: loadingSent } = useQuery({
    queryKey: ['friend-requests', 'sent'],
    queryFn: () => fetchFriendRequests('sent'),
    enabled: open,
  })

  // Search users
  useEffect(() => {
    if (search.length < 2) { setSearchResults([]); return }
    setSearching(true)
    const timer = setTimeout(async () => {
      try {
        const results = await searchUsers(search)
        setSearchResults(results)
      } catch { setSearchResults([]) }
      setSearching(false)
    }, 400)
    return () => clearTimeout(timer)
  }, [search])

  const acceptMutation = useMutation({
    mutationFn: (id: number) => acceptFriendRequest(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['friend-requests'] })
      queryClient.invalidateQueries({ queryKey: ['friends'] })
      toast.success('Friend request accepted!')
    },
  })

  const rejectMutation = useMutation({
    mutationFn: (id: number) => rejectFriendRequest(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['friend-requests'] })
      toast.info('Friend request rejected')
    },
  })

  const sendRequestMutation = useMutation({
    mutationFn: ({ receiverId, message }: { receiverId: number, message?: string }) => 
      sendFriendRequest(receiverId, message),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['friend-requests'] })
      toast.success('Friend request sent!')
    },
    onError: (err: any) => toast.error(err.response?.data?.detail || 'Failed to send request'),
  })

  const receivedItems = received?.items || []
  const sentItems = sent?.items || []

  return (
    <Drawer anchor="right" open={open} onClose={onClose}
      PaperProps={{ sx: { width: 380, borderRadius: '20px 0 0 20px' } }}>
      <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        {/* Header */}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 3, py: 2 }}>
          <Typography variant="h6" sx={{ fontWeight: 700, color: palette.ink }}>
            Friend Requests
          </Typography>
          <IconButton onClick={onClose} size="small">
            <CloseIcon />
          </IconButton>
        </Box>

        <Divider />

        <Tabs value={tab} onChange={(_, v) => setTab(v)}
          sx={{
            px: 2, minHeight: 40,
            '& .MuiTab-root': { minHeight: 40, fontSize: '0.8rem', fontWeight: 600, textTransform: 'none' },
            '& .MuiTabs-indicator': { backgroundColor: palette.brand },
          }}
        >
          <Tab label={`Received (${receivedItems.length})`} />
          <Tab label={`Sent (${sentItems.length})`} />
          <Tab label="Find Users" />
        </Tabs>

        <Box sx={{ flex: 1, overflowY: 'auto', p: 2 }}>
          {/* Received requests */}
          {tab === 0 && (
            loadingReceived ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                <CircularProgress size={28} sx={{ color: palette.brand }} />
              </Box>
            ) : receivedItems.length === 0 ? (
              <Box sx={{ textAlign: 'center', py: 4 }}>
                <Typography variant="body2" sx={{ color: palette.textDisabled }}>No pending requests</Typography>
              </Box>
            ) : (
              <List disablePadding>
                {receivedItems.map((req: FriendRequestData) => (
                  <ListItemButton key={req.id} sx={{ borderRadius: '12px', mb: 1, backgroundColor: palette.brandTint }}>
                    <ListItemAvatar>
                      <Avatar sx={{ backgroundColor: palette.brand, fontWeight: 700, fontSize: '0.85rem' }}>
                        {req.sender_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                      </Avatar>
                    </ListItemAvatar>
                    <ListItemText
                      primary={req.sender_name}
                      secondary={
                        <Box component="span">
                          <Typography component="span" variant="caption" sx={{ display: 'block', color: palette.textMuted, mb: 0.5 }}>
                            @{req.sender_username}
                          </Typography>
                          {req.message && (
                            <Typography component="span" variant="body2" sx={{ 
                              display: 'block', 
                              backgroundColor: '#fff', 
                              p: 1, 
                              borderRadius: '8px', 
                              fontSize: '0.75rem',
                              border: `1px solid ${palette.border}`,
                              color: '#4B5563',
                              fontStyle: 'italic'
                            }}>
                              "{req.message}"
                            </Typography>
                          )}
                        </Box>
                      }
                      primaryTypographyProps={{ fontWeight: 600, fontSize: '0.875rem' }}
                    />
                    <Box sx={{ display: 'flex', gap: 0.5 }}>
                      <IconButton size="small" onClick={() => acceptMutation.mutate(req.id)}
                        sx={{ color: palette.brandMid, backgroundColor: palette.brandTint }}>
                        <CheckIcon fontSize="small" />
                      </IconButton>
                      <IconButton size="small" onClick={() => rejectMutation.mutate(req.id)}
                        sx={{ color: palette.dangerBright, backgroundColor: palette.dangerWash }}>
                        <CloseIcon fontSize="small" />
                      </IconButton>
                    </Box>
                  </ListItemButton>
                ))}
              </List>
            )
          )}

          {/* Sent requests */}
          {tab === 1 && (
            loadingSent ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                <CircularProgress size={28} sx={{ color: palette.brand }} />
              </Box>
            ) : sentItems.length === 0 ? (
              <Box sx={{ textAlign: 'center', py: 4 }}>
                <Typography variant="body2" sx={{ color: palette.textDisabled }}>No sent requests</Typography>
              </Box>
            ) : (
              <List disablePadding>
                {sentItems.map((req: FriendRequestData) => (
                  <ListItemButton key={req.id} sx={{ borderRadius: '12px', mb: 1 }}>
                    <ListItemAvatar>
                      <Avatar sx={{ backgroundColor: palette.brandDeep, fontWeight: 700, fontSize: '0.85rem' }}>
                        {req.receiver_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                      </Avatar>
                    </ListItemAvatar>
                    <ListItemText
                      primary={req.receiver_name}
                      secondary={`@${req.receiver_username}`}
                      primaryTypographyProps={{ fontWeight: 600, fontSize: '0.875rem' }}
                    />
                    <Chip
                      label={req.status}
                      size="small"
                      sx={{
                        backgroundColor: req.status === 'pending' ? palette.warningTint : req.status === 'accepted' ? palette.brandTint : palette.dangerWash,
                        color: req.status === 'pending' ? palette.warningStrong : req.status === 'accepted' ? palette.brandStrong : palette.dangerStrong,
                        fontWeight: 600, fontSize: '0.7rem',
                      }}
                    />
                  </ListItemButton>
                ))}
              </List>
            )
          )}

          {/* Search users */}
          {tab === 2 && (
            <>
              <TextField
                fullWidth size="small" placeholder="Search by name or email..."
                value={search} onChange={(e) => setSearch(e.target.value)}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon sx={{ color: palette.textDisabled, fontSize: '1.1rem' }} />
                    </InputAdornment>
                  ),
                }}
                sx={{ mb: 2 }}
              />
              {searching ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                  <CircularProgress size={24} sx={{ color: palette.brand }} />
                </Box>
              ) : (
                <List disablePadding>
                  {searchResults.map((u) => (
                    <Box key={u.id} sx={{ mb: 1.5, p: 1, borderRadius: '12px', border: expandedUserId === u.id ? `1px solid ${palette.brand}` : '1px solid transparent', transition: 'all 0.2s' }}>
                      <ListItemButton sx={{ borderRadius: '12px', p: 0.5, '&:hover': { backgroundColor: 'transparent' } }}>
                        <ListItemAvatar>
                          <Avatar sx={{ backgroundColor: palette.brand, fontWeight: 700, fontSize: '0.85rem' }}>
                            {u.full_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                          </Avatar>
                        </ListItemAvatar>
                        <ListItemText
                          primary={u.full_name}
                          secondary={u.email}
                          primaryTypographyProps={{ fontWeight: 600, fontSize: '0.875rem' }}
                        />
                        <Button
                          size="small" variant={expandedUserId === u.id ? "text" : "outlined"}
                          startIcon={<PersonAddIcon />}
                          onClick={() => setExpandedUserId(expandedUserId === u.id ? null : u.id)}
                          disabled={sendRequestMutation.isPending}
                          sx={{ textTransform: 'none', fontSize: '0.75rem', borderRadius: '8px' }}
                        >
                          {expandedUserId === u.id ? 'Cancel' : 'Add'}
                        </Button>
                      </ListItemButton>
                      
                      {expandedUserId === u.id && (
                        <Box sx={{ mt: 1, px: 1, pb: 1 }}>
                          <TextField
                            fullWidth
                            multiline
                            rows={2}
                            placeholder="Add a message (optional)..."
                            size="small"
                            value={requestMessages[u.id] || ''}
                            onChange={(e) => setRequestMessages({ ...requestMessages, [u.id]: e.target.value })}
                            sx={{ 
                              mb: 1,
                              '& .MuiOutlinedInput-root': { fontSize: '0.75rem', borderRadius: '8px' }
                            }}
                          />
                          <Button
                            fullWidth
                            size="small"
                            variant="contained"
                            onClick={() => sendRequestMutation.mutate({ 
                              receiverId: u.id, 
                              message: requestMessages[u.id] 
                            })}
                            disabled={sendRequestMutation.isPending}
                            sx={{ 
                              textTransform: 'none', 
                              fontSize: '0.75rem', 
                              borderRadius: '8px',
                              backgroundColor: palette.brand,
                              '&:hover': { backgroundColor: palette.brandDeep }
                            }}
                          >
                            {sendRequestMutation.isPending ? 'Sending...' : 'Send Request'}
                          </Button>
                        </Box>
                      )}
                    </Box>
                  ))}
                  {search.length >= 2 && searchResults.length === 0 && !searching && (
                    <Typography variant="body2" sx={{ color: palette.textDisabled, textAlign: 'center', py: 3 }}>
                      No users found
                    </Typography>
                  )}
                </List>
              )}
            </>
          )}
        </Box>
      </Box>
    </Drawer>
  )
}

export default FriendRequests
