import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import {
  Box, Typography, TextField, IconButton, Avatar, Tooltip,
  CircularProgress, Chip, Menu, MenuItem, ListItemIcon,
  Dialog, DialogTitle, DialogContent, DialogActions, Button,
  List, ListItemButton, ListItemAvatar, ListItemText,
  LinearProgress,
} from '@mui/material'
import SendIcon from '@mui/icons-material/Send'
import EmojiEmotionsIcon from '@mui/icons-material/EmojiEmotions'
import SettingsIcon from '@mui/icons-material/Settings'
import PersonAddIcon from '@mui/icons-material/PersonAdd'
import PersonRemoveIcon from '@mui/icons-material/PersonRemove'
import VideocamIcon from '@mui/icons-material/Videocam'
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth'
import RoomServiceIcon from '@mui/icons-material/RoomService'
import AttachFileIcon from '@mui/icons-material/AttachFile'
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile'
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf'
import ImageIcon from '@mui/icons-material/Image'
import DescriptionIcon from '@mui/icons-material/Description'
import DownloadIcon from '@mui/icons-material/Download'
import CloseIcon from '@mui/icons-material/Close'
import data from '@emoji-mart/data'
import Picker from '@emoji-mart/react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-toastify'
import {
  downloadChatFile, fetchWorkspaceMessages, addWorkspaceMember, removeWorkspaceMember, uploadChatFile,
  type WorkspaceMessageData, type WorkspaceData,
} from '@/api/chat'
import { searchUsers } from '@/api/users'
import { useAuthStore } from '@/stores/authStore'
import { useChatStore } from '@/stores/chatStore'
import { createEvent } from '@/api/calendar'
import CallPanel from './CallPanel'
import ProtectedChatImage from './ProtectedChatImage'

// Helper: get icon for file type
const getFileIcon = (fileType: string | null) => {
  if (!fileType) return <InsertDriveFileIcon />
  if (fileType.startsWith('image/')) return <ImageIcon />
  if (fileType === 'application/pdf') return <PictureAsPdfIcon />
  if (fileType.includes('word') || fileType.includes('document')) return <DescriptionIcon />
  return <InsertDriveFileIcon />
}

// Helper: format file size
const formatFileSize = (bytes: number | null) => {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// Helper: check if file type is an image
const isImageFile = (fileType: string | null) => {
  return fileType?.startsWith('image/')
}


interface Props {
  workspace: WorkspaceData
  onRefresh: () => void
}

const WorkspacePanel = ({ workspace, onRefresh }: Props) => {
  const currentUser = useAuthStore((s) => s.user)
  const navigate = useNavigate()
  const { sendWsMessage, addMessageListener, removeMessageListener, onlineUsers } = useChatStore()
  const queryClient = useQueryClient()

  const [message, setMessage] = useState('')
  const [messages, setMessages] = useState<WorkspaceMessageData[]>([])
  const [showEmoji, setShowEmoji] = useState(false)
  const [showMembers, setShowMembers] = useState(false)
  const [showAddMember, setShowAddMember] = useState(false)
  const [memberSearch, setMemberSearch] = useState('')
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null)
  const [meetingMenuAnchor, setMeetingMenuAnchor] = useState<null | HTMLElement>(null)
  const [showScheduleModal, setShowScheduleModal] = useState(false)
  const [scheduleData, setScheduleData] = useState({
    title: `Meeting: ${workspace.name}`,
    description: '',
    startTime: format(new Date(), "yyyy-MM-dd'T'HH:mm")
  })
  const [activeCall, setActiveCall] = useState<{ active: boolean; type: 'voice' | 'video'; targetUserId?: number; isHost?: boolean } | null>(null)
  const [uploading, setUploading] = useState(false)
  const [pendingFile, setPendingFile] = useState<{ file_url: string; file_name: string; file_size: number; file_type: string } | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Load history
  const { data: historyData, isLoading } = useQuery({
    queryKey: ['ws-messages', workspace.id],
    queryFn: () => fetchWorkspaceMessages(workspace.id, 0, 100),
  })

  useEffect(() => {
    if (historyData) setMessages(historyData.items)
  }, [historyData])

  // Listen for real-time workspace messages
  const handleIncoming = useCallback((data: any) => {
    if (data.type === 'workspace_message' && data.workspace_id === workspace.id) {
      setMessages((prev) => {
        if (prev.some((m) => m.id === data.id)) return prev
        return [...prev, data]
      })
    }
  }, [workspace.id])

  useEffect(() => {
    addMessageListener(handleIncoming)
    return () => removeMessageListener(handleIncoming)
  }, [handleIncoming, addMessageListener, removeMessageListener])

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Search users for adding
  useEffect(() => {
    if (memberSearch.length < 2) { setSearchResults([]); return }
    const timer = setTimeout(async () => {
      try {
        const results = await searchUsers(memberSearch)
        const memberIds = workspace.members.map(m => m.user_id)
        setSearchResults(results.filter(u => !memberIds.includes(u.id)))
      } catch { setSearchResults([]) }
    }, 300)
    return () => clearTimeout(timer)
  }, [memberSearch, workspace.members])

  const addMemberMutation = useMutation({
    mutationFn: (userId: number) => addWorkspaceMember(workspace.id, userId),
    onSuccess: () => {
      toast.success('Member added')
      onRefresh()
      setShowAddMember(false)
      setMemberSearch('')
    },
    onError: (err: any) => toast.error(err.response?.data?.detail || 'Failed'),
  })

  const removeMemberMutation = useMutation({
    mutationFn: (userId: number) => removeWorkspaceMember(workspace.id, userId),
    onSuccess: () => {
      toast.success('Member removed')
      onRefresh()
    },
    onError: (err: any) => toast.error(err.response?.data?.detail || 'Failed'),
  })

  const handleSend = () => {
    if (!message.trim() && !pendingFile) return

    if (pendingFile) {
      sendWsMessage({
        type: 'workspace_message',
        workspace_id: workspace.id,
        content: message.trim() || `📎 ${pendingFile.file_name}`,
        message_type: 'file',
        file_url: pendingFile.file_url,
        file_name: pendingFile.file_name,
        file_size: pendingFile.file_size,
        file_type: pendingFile.file_type,
      })
      setPendingFile(null)
    } else {
      sendWsMessage({
        type: 'workspace_message',
        workspace_id: workspace.id,
        content: message.trim(),
        message_type: 'text',
      })
    }
    setMessage('')
    setShowEmoji(false)
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (file.size > 10 * 1024 * 1024) {
      toast.error('File too large. Maximum size is 10MB')
      return
    }

    setUploading(true)
    try {
      const result = await uploadChatFile(file)
      setPendingFile(result)
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to upload file')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }


  const handleStartMeeting = () => {
    const now = new Date().toISOString()
    setActiveCall({ active: true, type: 'video', targetUserId: currentUser?.id, isHost: true })
    sendWsMessage({
      type: 'workspace_message',
      workspace_id: workspace.id,
      content: `[[MEETING_LINK:${currentUser?.id}:${now}]]`,
      message_type: 'text',
    })
    setMeetingMenuAnchor(null)
  }

  const handleScheduleSubmit = async () => {
    try {
      const start = new Date(scheduleData.startTime)
      const end = new Date(start.getTime() + 3600000) // Default 1 hour
      
      await createEvent({
        title: scheduleData.title,
        description: scheduleData.description,
        start_time: start.toISOString(),
        end_time: end.toISOString(),
        is_meeting: true,
        workspace_id: workspace.id
      })

      sendWsMessage({
        type: 'workspace_message',
        workspace_id: workspace.id,
        content: `[[MEETING_SCHEDULED:${currentUser?.id}:${scheduleData.title}:${start.toISOString()}]]`,
        message_type: 'text',
      })

      setShowScheduleModal(false)
      toast.success('Meeting scheduled')
    } catch (err) {
      toast.error('Failed to schedule meeting')
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleEmojiSelect = (emoji: any) => {
    setMessage((prev) => prev + emoji.native)
  }

  const isAdmin = workspace.members.some(
    m => m.user_id === currentUser?.id && m.role === 'admin'
  )

  // Render a file message bubble
  const renderFileContent = (msg: WorkspaceMessageData, isMine: boolean) => {
    if (isImageFile(msg.file_type)) {
      return (
        <Box>
          <ProtectedChatImage
            fileUrl={msg.file_url!}
            alt={msg.file_name || 'Image'}
            sx={{
              maxWidth: '100%',
              maxHeight: 260,
              borderRadius: '12px',
              objectFit: 'cover',
              display: 'block',
            }}
          />
          {msg.content && !msg.content.startsWith('📎') && (
            <Typography sx={{ fontSize: '0.875rem', lineHeight: 1.5, mt: 1, color: 'inherit', wordBreak: 'break-word' }}>
              {msg.content}
            </Typography>
          )}
        </Box>
      )
    }

    // Non-image file card
    return (
      <Box
        component="button"
        type="button"
        onClick={() => downloadChatFile(msg.file_url!, msg.file_name).catch(() => toast.error('Unable to download file'))}
        sx={{
          width: '100%',
          font: 'inherit',
          textAlign: 'left',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
          p: 1.5,
          borderRadius: '12px',
          backgroundColor: isMine ? 'rgba(255,255,255,0.12)' : 'rgba(124,58,237,0.04)',
          border: `1px solid ${isMine ? 'rgba(255,255,255,0.2)' : 'rgba(124,58,237,0.1)'}`,
          textDecoration: 'none',
          color: 'inherit',
          transition: 'all 0.2s ease',
          '&:hover': { backgroundColor: isMine ? 'rgba(255,255,255,0.18)' : 'rgba(124,58,237,0.08)' },
        }}
      >
        <Box sx={{
          width: 40, height: 40, borderRadius: '10px',
          backgroundColor: isMine ? 'rgba(255,255,255,0.15)' : '#F5F3FF',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
          color: isMine ? '#fff' : '#7C3AED',
        }}>
          {getFileIcon(msg.file_type)}
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{
            fontSize: '0.85rem', fontWeight: 600,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {msg.file_name || 'File'}
          </Typography>
          <Typography sx={{ fontSize: '0.7rem', opacity: 0.7 }}>
            {formatFileSize(msg.file_size)}
          </Typography>
        </Box>
        <DownloadIcon sx={{ fontSize: '1.1rem', opacity: 0.6, flexShrink: 0 }} />
      </Box>
    )
  }

  return (
    <Box sx={{
      flex: 1, display: 'flex', flexDirection: 'column',
      backgroundColor: '#fff', borderRadius: '32px',
      boxShadow: '0 20px 60px -15px rgba(124,58,237,0.12)',
      border: '1px solid rgba(124,58,237,0.06)',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <Box sx={{
        display: 'flex', alignItems: 'center', gap: 2,
        px: 4, py: 2.5, borderBottom: '1px solid #F3F4F6',
        backgroundColor: 'rgba(255, 255, 255, 0.8)',
        backdropFilter: 'blur(10px)',
      }}>
        <Avatar sx={{
          width: 48, height: 48,
          background: 'linear-gradient(135deg, #4F46E5, #7C3AED, #F472B6)',
          fontWeight: 800, fontSize: '1.2rem',
          boxShadow: '0 8px 16px rgba(124,58,237,0.2)',
        }}>
          {workspace.name[0].toUpperCase()}
        </Avatar>
        <Box sx={{ flex: 1 }}>
          <Typography sx={{ fontWeight: 800, fontSize: '1.1rem', color: '#1E1B4B', letterSpacing: '-0.3px' }}>
            {workspace.name}
          </Typography>
          <Typography variant="caption" sx={{ color: '#9CA3AF', fontWeight: 600 }}>
            {workspace.member_count} members • Active Now
          </Typography>
        </Box>

        {/* Members chips */}
        <Box sx={{ display: 'flex', gap: 0.5, mr: 1 }}>
          {workspace.members.slice(0, 3).map((m) => (
            <Tooltip key={m.user_id} title={m.full_name}>
              <Avatar sx={{ width: 28, height: 28, fontSize: '0.65rem', fontWeight: 700, backgroundColor: '#7C3AED' }}>
                {m.full_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
              </Avatar>
            </Tooltip>
          ))}
          {workspace.members.length > 3 && (
             <Avatar sx={{ width: 28, height: 28, fontSize: '0.6rem', backgroundColor: '#E9D5FF', color: '#7C3AED' }}>
              +{workspace.members.length - 3}
            </Avatar>
          )}
        </Box>

        <Tooltip title="Meeting Options">
          <IconButton onClick={(e) => setMeetingMenuAnchor(e.currentTarget)}
            sx={{ color: '#7C3AED', backgroundColor: '#F5F3FF', mr: 1 }}>
            <VideocamIcon fontSize="small" />
          </IconButton>
        </Tooltip>

        <Menu
          anchorEl={meetingMenuAnchor}
          open={Boolean(meetingMenuAnchor)}
          onClose={() => setMeetingMenuAnchor(null)}
          PaperProps={{ sx: { borderRadius: '12px', mt: 1, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' } }}
        >
          <MenuItem onClick={handleStartMeeting}>
            <ListItemIcon><VideocamIcon fontSize="small" sx={{ color: '#7C3AED' }} /></ListItemIcon>
            <ListItemText primary="Start Now" primaryTypographyProps={{ fontSize: '0.85rem', fontWeight: 600 }} />
          </MenuItem>
          <MenuItem onClick={() => { setShowScheduleModal(true); setMeetingMenuAnchor(null) }}>
            <ListItemIcon><CalendarMonthIcon fontSize="small" sx={{ color: '#7C3AED' }} /></ListItemIcon>
            <ListItemText primary="Schedule for Later" primaryTypographyProps={{ fontSize: '0.85rem', fontWeight: 600 }} />
          </MenuItem>
        </Menu>

        <Tooltip title="Settings">
          <IconButton onClick={(e) => setAnchorEl(e.currentTarget)}
            sx={{ color: '#7C3AED', backgroundColor: '#F5F3FF' }}>
            <SettingsIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Menu anchorEl={anchorEl} open={!!anchorEl} onClose={() => setAnchorEl(null)}>
          <MenuItem onClick={() => { setShowMembers(true); setAnchorEl(null) }}>
            View Members
          </MenuItem>
          {isAdmin && (
            <MenuItem onClick={() => { setShowAddMember(true); setAnchorEl(null) }}>
              <ListItemIcon><PersonAddIcon fontSize="small" /></ListItemIcon>
              Add Member
            </MenuItem>
          )}
        </Menu>
      </Box>

      {/* Messages */}
      <Box sx={{ flex: 1, overflowY: 'auto', px: 3, py: 2 }}>
        {isLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress size={28} sx={{ color: '#7C3AED' }} />
          </Box>
        ) : messages.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 6 }}>
            <Typography variant="body2" sx={{ color: '#9CA3AF' }}>
              No messages in this workspace yet
            </Typography>
          </Box>
        ) : (
          messages.map((msg, idx) => {
            const isMine = msg.sender_id === currentUser?.id
            const showHeader = idx === 0 || messages[idx - 1].sender_id !== msg.sender_id
            const isFile = msg.message_type === 'file' && msg.file_url

            return (
              <Box key={msg.id || idx} sx={{ mb: 0.8 }}>
                {showHeader && !isMine && (
                  <Typography variant="caption" sx={{ color: '#7C3AED', fontWeight: 600, ml: 5 }}>
                    {msg.sender_name}
                  </Typography>
                )}
                <Box sx={{
                  display: 'flex',
                  justifyContent: isMine ? 'flex-end' : 'flex-start',
                  alignItems: 'flex-end', gap: 1,
                }}>
                  {!isMine && showHeader && (
                    <Avatar sx={{ width: 28, height: 28, backgroundColor: '#7C3AED', fontSize: '0.65rem', fontWeight: 700 }}>
                      {(msg.sender_name || '').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                    </Avatar>
                  )}
                  {!isMine && !showHeader && <Box sx={{ width: 28 }} />}
                  <Box sx={{
                    maxWidth: '70%',
                    px: isFile && isImageFile(msg.file_type) ? 0.5 : 2,
                    py: isFile && isImageFile(msg.file_type) ? 0.5 : 1,
                    borderRadius: isMine ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                    backgroundColor: isMine ? '#7C3AED' : '#FFFFFF',
                    color: isMine ? '#FFFFFF' : '#7C3AED',
                    border: isMine ? 'none' : '1px solid #7C3AED',
                    overflow: 'hidden',
                  }}>
                    {isFile ? (
                        renderFileContent(msg, isMine)
                    ) : (
                        <Typography sx={{ fontSize: '0.875rem', lineHeight: 1.5, wordBreak: 'break-word', color: 'inherit' }}>
                          {msg.content.startsWith('[[MEETING_LINK:') ? (() => {
                            const content = msg.content.replace('[[', '').replace(']]', '')
                            const firstColon = content.indexOf(':')
                            const secondColon = content.indexOf(':', firstColon + 1)
                            const hostId = parseInt(content.substring(firstColon + 1, secondColon))
                            const timestampStr = content.substring(secondColon + 1)
                            const startTime = new Date(timestampStr).toLocaleString([], { 
                              weekday: 'short', month: 'short', day: 'numeric', 
                              hour: '2-digit', minute: '2-digit' 
                            })
                            return (
                              <Box sx={{ 
                                p: 2.5, borderRadius: '20px', 
                                backgroundColor: isMine ? 'rgba(255,255,255,0.05)' : '#F9FAFB',
                                border: `1px solid ${isMine ? 'rgba(255,255,255,0.2)' : 'rgba(124,58,237,0.1)'}`,
                                minWidth: 240,
                                boxShadow: isMine ? 'none' : '0 4px 12px rgba(0,0,0,0.02)',
                              }}>
                                <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                                  <VideocamIcon sx={{ color: isMine ? '#FBCFE8' : '#7C3AED' }} /> Meeting Link
                                </Typography>
                                <Typography variant="caption" sx={{ display: 'block', mb: 2, opacity: 0.8, fontWeight: 600 }}>
                                  Started on {startTime}
                                </Typography>
                                <Button 
                                  variant="contained" 
                                  size="small" 
                                  fullWidth
                                  startIcon={<VideocamIcon />}
                                  onClick={() => {
                                    setActiveCall({ active: true, type: 'video', targetUserId: hostId, isHost: currentUser?.id === hostId })
                                  }}
                                  sx={{ 
                                    background: isMine ? '#fff' : 'linear-gradient(135deg, #7C3AED 0%, #F472B6 100%)', 
                                    color: isMine ? '#7C3AED' : '#fff',
                                    textTransform: 'none', 
                                    fontWeight: 800,
                                    borderRadius: '12px',
                                    '&:hover': { 
                                      background: isMine ? '#F3F4F6' : 'linear-gradient(135deg, #6D28D9 0%, #EC4899 100%)',
                                      transform: 'translateY(-2px)'
                                    }
                                  }}
                                >
                                  Join Now
                                </Button>
                              </Box>
                            )
                          })() : msg.content.startsWith('[[MEETING_SCHEDULED:') ? (() => {
                            const content = msg.content.replace('[[', '').replace(']]', '')
                            const parts = content.split(':')
                            const title = parts[2]
                            const startTime = new Date(parts.slice(3).join(':')).toLocaleString([], {
                              weekday: 'short', month: 'short', day: 'numeric',
                              hour: '2-digit', minute: '2-digit'
                            })
                            return (
                              <Box sx={{ 
                                p: 2.5, borderRadius: '20px', 
                                backgroundColor: isMine ? 'rgba(255,255,255,0.05)' : '#F9FAFB',
                                border: `1px solid ${isMine ? 'rgba(255,255,255,0.2)' : 'rgba(124,58,237,0.1)'}`,
                                minWidth: 240,
                                boxShadow: isMine ? 'none' : '0 4px 12px rgba(0,0,0,0.02)',
                              }}>
                                <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                                  📅 {title}
                                </Typography>
                                <Typography variant="caption" sx={{ display: 'block', mb: 2, opacity: 0.8, fontWeight: 600 }}>
                                  Scheduled for {startTime}
                                </Typography>
                                <Button 
                                  variant="outlined" 
                                  size="small" 
                                  fullWidth
                                  onClick={() => navigate('/calendar')}
                                  sx={{ 
                                    borderColor: isMine ? '#fff' : '#7C3AED', 
                                    color: isMine ? '#fff' : '#7C3AED',
                                    textTransform: 'none', 
                                    fontWeight: 800,
                                    borderRadius: '12px',
                                    borderWeight: '1.5px',
                                    '&:hover': { 
                                      borderColor: isMine ? '#F3F4F6' : '#6D28D9', 
                                      backgroundColor: isMine ? 'rgba(255,255,255,0.1)' : 'rgba(124,58,237,0.04)',
                                      transform: 'translateY(-2px)'
                                    }
                                  }}
                                >
                                  See in Calendar
                                </Button>
                              </Box>
                            )
                          })() : msg.content.startsWith('[[MEETING_STARTED:') ? (
                            <Box sx={{ py: 1 }}>
                              <Typography variant="body2" sx={{ mb: 1, fontWeight: 600 }}>
                                🎥 {msg.sender_name} started a meeting
                              </Typography>
                              <Button 
                                variant="contained" 
                                size="small" 
                                fullWidth
                                startIcon={<VideocamIcon />}
                                onClick={() => {
                                  const hostId = parseInt(msg.content.split(':')[1].replace(']]', ''))
                                  setActiveCall({ active: true, type: 'video', targetUserId: hostId, isHost: currentUser?.id === hostId })
                                }}
                                sx={{ backgroundColor: '#7C3AED', textTransform: 'none', borderRadius: '8px' }}
                              >
                                Join Meeting
                              </Button>
                            </Box>
                          ) : msg.content}
                        </Typography>
                    )}

                    <Typography sx={{
                      fontSize: '0.65rem', mt: 0.3,
                      color: isMine ? 'rgba(255,255,255,0.6)' : '#9CA3AF',
                      textAlign: 'right',
                      px: isFile && isImageFile(msg.file_type) ? 1.5 : 0,
                      pb: isFile && isImageFile(msg.file_type) ? 0.5 : 0,
                    }}>
                      {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </Typography>
                  </Box>
                </Box>
              </Box>
            )
          })
        )}
        <div ref={messagesEndRef} />
      </Box>

      {/* Emoji picker */}
      {showEmoji && (
        <Box sx={{ position: 'relative' }}>
          <Box sx={{ position: 'absolute', bottom: 0, left: 16, zIndex: 10 }}>
            <Picker data={data} onEmojiSelect={handleEmojiSelect} theme="light" previewPosition="none" />
          </Box>
        </Box>
      )}

      {/* Pending file preview */}
      {pendingFile && (
        <Box sx={{
          display: 'flex', alignItems: 'center', gap: 1.5,
          mx: 2, mb: 0.5, p: 1.5,
          borderRadius: '12px',
          backgroundColor: '#F5F3FF',
          border: '1px solid rgba(124,58,237,0.1)',
        }}>
          <Box sx={{
            width: 36, height: 36, borderRadius: '8px',
            backgroundColor: '#EDE9FE',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#7C3AED',
          }}>
            {getFileIcon(pendingFile.file_type)}
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontSize: '0.8rem', fontWeight: 600, color: '#1E1B4B', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {pendingFile.file_name}
            </Typography>
            <Typography sx={{ fontSize: '0.7rem', color: '#9CA3AF' }}>
              {formatFileSize(pendingFile.file_size)}
            </Typography>
          </Box>
          <IconButton size="small" onClick={() => setPendingFile(null)} sx={{ color: '#9CA3AF' }}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </Box>
      )}

      {/* Upload progress */}
      {uploading && (
        <Box sx={{ px: 2, pb: 0.5 }}>
          <LinearProgress sx={{
            borderRadius: 4,
            '& .MuiLinearProgress-bar': { backgroundColor: '#7C3AED' },
            backgroundColor: '#EDE9FE',
          }} />
        </Box>
      )}

      {/* Hidden file input */}
      <input
        type="file"
        ref={fileInputRef}
        style={{ display: 'none' }}
        onChange={handleFileSelect}
        accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,.zip,.rar"
      />

      {/* Input */}
      <Box sx={{
        display: 'flex', alignItems: 'center', gap: 1,
        px: 2, py: 1.5, borderTop: '1px solid #F3F4F6',
      }}>
        <IconButton onClick={() => setShowEmoji(!showEmoji)} sx={{ color: showEmoji ? '#7C3AED' : '#9CA3AF' }}>
          <EmojiEmotionsIcon />
        </IconButton>
        <Tooltip title="Attach file">
          <IconButton
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            sx={{ color: pendingFile ? '#7C3AED' : '#9CA3AF', '&:hover': { color: '#7C3AED' } }}
          >
            <AttachFileIcon sx={{ transform: 'rotate(45deg)' }} />
          </IconButton>
        </Tooltip>
        <TextField
          fullWidth size="small" placeholder={pendingFile ? "Add a message or press send..." : "Type a message..."}
          value={message} onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          multiline maxRows={3}
          sx={{
            '& .MuiOutlinedInput-root': {
              borderRadius: '12px', backgroundColor: '#F9FAFB',
              '& fieldset': { borderColor: '#E5E7EB' },
            },
          }}
        />
        <IconButton
          onClick={handleSend}
          disabled={!message.trim() && !pendingFile}
          sx={{
            backgroundColor: '#7C3AED', color: '#fff',
            '&:hover': { backgroundColor: '#6D28D9' },
            '&.Mui-disabled': { backgroundColor: '#E9D5FF', color: '#C4B5FD' },
            width: 40, height: 40,
          }}
        >
          <SendIcon sx={{ fontSize: '1.1rem' }} />
        </IconButton>
      </Box>

      {/* Members Dialog */}
      <Dialog open={showMembers} onClose={() => setShowMembers(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>Members</DialogTitle>
        <DialogContent>
          <List>
            {workspace.members.map((m) => (
              <ListItemButton key={m.user_id} sx={{ borderRadius: '8px' }}>
                <ListItemAvatar>
                  <Avatar sx={{ width: 36, height: 36, backgroundColor: '#7C3AED', fontSize: '0.8rem', fontWeight: 700 }}>
                    {m.full_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                  </Avatar>
                </ListItemAvatar>
                <ListItemText
                  primary={m.full_name}
                  secondary={m.role === 'admin' ? 'Admin' : 'Member'}
                  primaryTypographyProps={{ fontWeight: 600, fontSize: '0.875rem' }}
                />
                {isAdmin && m.user_id !== currentUser?.id && (
                  <Tooltip title="Remove">
                    <IconButton size="small" onClick={() => removeMemberMutation.mutate(m.user_id)}
                      sx={{ color: '#EF4444' }}>
                      <PersonRemoveIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                )}
              </ListItemButton>
            ))}
          </List>
        </DialogContent>
      </Dialog>

      {/* Add Member Dialog */}
      <Dialog open={showAddMember} onClose={() => setShowAddMember(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>Add Member</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth size="small" placeholder="Search users..."
            value={memberSearch} onChange={(e) => setMemberSearch(e.target.value)}
            sx={{ mb: 2, mt: 1 }}
          />
          <List>
            {searchResults.map((u: any) => (
              <ListItemButton key={u.id} onClick={() => addMemberMutation.mutate(u.id)} sx={{ borderRadius: '8px' }}>
                <ListItemAvatar>
                  <Avatar sx={{ width: 36, height: 36, backgroundColor: '#7C3AED', fontSize: '0.8rem', fontWeight: 700 }}>
                    {u.full_name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)}
                  </Avatar>
                </ListItemAvatar>
                <ListItemText
                  primary={u.full_name}
                  secondary={u.email}
                  primaryTypographyProps={{ fontWeight: 600, fontSize: '0.875rem' }}
                />
                <PersonAddIcon sx={{ color: '#7C3AED' }} />
              </ListItemButton>
            ))}
            {memberSearch.length >= 2 && searchResults.length === 0 && (
              <Typography variant="body2" sx={{ color: '#9CA3AF', textAlign: 'center', py: 2 }}>
                No users found
              </Typography>
            )}
          </List>
        </DialogContent>
      </Dialog>
      
      {/* Schedule Meeting Dialog */}
      <Dialog open={showScheduleModal} onClose={() => setShowScheduleModal(false)} maxWidth="xs" fullWidth
        PaperProps={{ sx: { borderRadius: '20px', p: 1 } }}>
        <DialogTitle sx={{ fontWeight: 800 }}>Schedule Meeting</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, mt: 1 }}>
          <TextField
            label="Meeting Title" fullWidth size="small"
            value={scheduleData.title} onChange={(e) => setScheduleData({ ...scheduleData, title: e.target.value })}
          />
          <TextField
            label="Description (Optional)" fullWidth size="small" multiline rows={2}
            value={scheduleData.description} onChange={(e) => setScheduleData({ ...scheduleData, description: e.target.value })}
          />
          <TextField
            label="Start Time" type="datetime-local" fullWidth size="small"
            value={scheduleData.startTime} onChange={(e) => setScheduleData({ ...scheduleData, startTime: e.target.value })}
            InputLabelProps={{ shrink: true }}
          />
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setShowScheduleModal(false)} sx={{ color: '#9CA3AF' }}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleScheduleSubmit}
            sx={{ borderRadius: '10px', px: 3 }}
          >
            Schedule
          </Button>
        </DialogActions>
      </Dialog>
      
      {/* Meeting Panel */}
      {activeCall?.active && (
        <CallPanel 
          targetUser={{ 
            id: activeCall.targetUserId || workspace.id, 
            full_name: activeCall.isHost ? workspace.name : `Meeting Room (${workspace.name})`,
            is_workspace: true 
          }}
          callType={activeCall.type}
          isHost={activeCall.isHost}
          onEnd={() => setActiveCall(null)}
        />
      )}
    </Box>
  )
}

export default WorkspacePanel
