import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Box, Typography, TextField, IconButton, Avatar, Tooltip,
  CircularProgress, InputAdornment, LinearProgress,
} from '@mui/material'
import SendIcon from '@mui/icons-material/Send'
import EmojiEmotionsIcon from '@mui/icons-material/EmojiEmotions'
import AttachFileIcon from '@mui/icons-material/AttachFile'
import CallIcon from '@mui/icons-material/Call'
import VideocamIcon from '@mui/icons-material/Videocam'
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile'
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf'
import ImageIcon from '@mui/icons-material/Image'
import DescriptionIcon from '@mui/icons-material/Description'
import DownloadIcon from '@mui/icons-material/Download'
import CloseIcon from '@mui/icons-material/Close'
import data from '@emoji-mart/data'
import Picker from '@emoji-mart/react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'react-toastify'
import { fetchDirectMessages, uploadChatFile, type DirectMessageData } from '@/api/chat'
import { useAuthStore } from '@/stores/authStore'
import { useChatStore } from '@/stores/chatStore'
import CallPanel from './CallPanel'

const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1').replace('/api/v1', '')

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
  user: any
}

const MessagePanel = ({ user }: Props) => {
  const currentUser = useAuthStore((s) => s.user)
  const { sendWsMessage, addMessageListener, removeMessageListener, typingUsers, onlineUsers } = useChatStore()

  const [message, setMessage] = useState('')
  const [messages, setMessages] = useState<DirectMessageData[]>([])
  const [showEmoji, setShowEmoji] = useState(false)
  const [callState, setCallState] = useState<{ active: boolean; type: 'voice' | 'video' } | null>(null)
  const [uploading, setUploading] = useState(false)
  const [pendingFile, setPendingFile] = useState<{ file_url: string; file_name: string; file_size: number; file_type: string } | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const typingTimeoutRef = useRef<any>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const isOnline = onlineUsers.includes(user.id)
  const isTyping = typingUsers[String(user.id)]

  // Load message history
  const { data: historyData, isLoading } = useQuery({
    queryKey: ['dm-messages', user.id],
    queryFn: () => fetchDirectMessages(user.id, 0, 100),
  })

  useEffect(() => {
    if (historyData) setMessages(historyData.items)
  }, [historyData])

  // Listen for real-time messages
  const handleIncoming = useCallback((data: any) => {
    if (data.type === 'chat_message') {
      if (
        (data.sender_id === user.id && data.receiver_id === currentUser?.id) ||
        (data.sender_id === currentUser?.id && data.receiver_id === user.id)
      ) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === data.id)) return prev
          return [...prev, data]
        })
      }
    }
  }, [user.id, currentUser?.id])

  useEffect(() => {
    addMessageListener(handleIncoming)
    return () => removeMessageListener(handleIncoming)
  }, [handleIncoming, addMessageListener, removeMessageListener])

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = () => {
    if (!message.trim() && !pendingFile) return

    if (pendingFile) {
      // Send file message
      sendWsMessage({
        type: 'chat_message',
        receiver_id: user.id,
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
        type: 'chat_message',
        receiver_id: user.id,
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

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
    // Send typing indicator
    sendWsMessage({ type: 'typing', receiver_id: user.id, is_typing: true })
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
    typingTimeoutRef.current = setTimeout(() => {
      sendWsMessage({ type: 'typing', receiver_id: user.id, is_typing: false })
    }, 2000)
  }

  const handleEmojiSelect = (emoji: any) => {
    setMessage((prev) => prev + emoji.native)
  }

  const handleStartCall = (type: 'voice' | 'video') => {
    setCallState({ active: true, type })
  }

  const initials = user.full_name?.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2) || 'U'

  // Render a file message bubble
  const renderFileContent = (msg: DirectMessageData, isMine: boolean) => {
    const fileUrl = `${API_BASE}${msg.file_url}`

    if (isImageFile(msg.file_type)) {
      return (
        <Box>
          <Box
            component="a"
            href={fileUrl}
            target="_blank"
            rel="noopener noreferrer"
            sx={{ display: 'block', cursor: 'pointer' }}
          >
            <Box
              component="img"
              src={fileUrl}
              alt={msg.file_name || 'Image'}
              sx={{
                maxWidth: '100%',
                maxHeight: 260,
                borderRadius: '12px',
                objectFit: 'cover',
                display: 'block',
              }}
            />
          </Box>
          {msg.content && !msg.content.startsWith('📎') && (
            <Typography sx={{ fontSize: '0.9rem', lineHeight: 1.6, mt: 1, color: 'inherit', wordBreak: 'break-word' }}>
              {msg.content}
            </Typography>
          )}
        </Box>
      )
    }

    // Non-image file card
    return (
      <Box
        component="a"
        href={fileUrl}
        target="_blank"
        rel="noopener noreferrer"
        sx={{
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
      backgroundColor: '#fff', borderRadius: '20px',
      boxShadow: '0 4px 24px rgba(124,58,237,0.08)',
      border: '1px solid rgba(124,58,237,0.06)',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <Box sx={{
        display: 'flex', alignItems: 'center', gap: 1.5,
        px: 3, py: 2, borderBottom: '1px solid #F3F4F6',
      }}>
        <Avatar sx={{ width: 40, height: 40, backgroundColor: '#7C3AED', fontWeight: 700, fontSize: '0.9rem' }}>
          {initials}
        </Avatar>
        <Box sx={{ flex: 1 }}>
          <Typography sx={{ fontWeight: 700, fontSize: '0.95rem', color: '#1E1B4B' }}>
            {user.full_name}
          </Typography>
          <Typography variant="caption" sx={{ color: isOnline ? '#10B981' : '#9CA3AF' }}>
            {isTyping ? 'Typing...' : isOnline ? 'Online' : 'Offline'}
          </Typography>
        </Box>
        <Tooltip title="Voice Call">
          <IconButton onClick={() => handleStartCall('voice')}
            sx={{ color: '#7C3AED', backgroundColor: '#F5F3FF', '&:hover': { backgroundColor: '#EDE9FE' } }}>
            <CallIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Video Call">
          <IconButton onClick={() => handleStartCall('video')}
            sx={{ color: '#7C3AED', backgroundColor: '#F5F3FF', '&:hover': { backgroundColor: '#EDE9FE' } }}>
            <VideocamIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>

      {/* Messages area */}
      <Box sx={{ flex: 1, overflowY: 'auto', px: 3, py: 2 }}>
        {isLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress size={28} sx={{ color: '#7C3AED' }} />
          </Box>
        ) : messages.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 6 }}>
            <Typography variant="body2" sx={{ color: '#9CA3AF' }}>
              No messages yet. Say hello! 👋
            </Typography>
          </Box>
        ) : (
          messages.map((msg, idx) => {
            const isMine = msg.sender_id === currentUser?.id
            const showAvatar = idx === 0 || messages[idx - 1].sender_id !== msg.sender_id
            const isFile = msg.message_type === 'file' && msg.file_url
            return (
              <Box
                key={msg.id || idx}
                sx={{
                  display: 'flex',
                  justifyContent: isMine ? 'flex-end' : 'flex-start',
                  mb: 0.8,
                  alignItems: 'flex-end',
                  gap: 1,
                }}
              >
                {!isMine && showAvatar && (
                  <Avatar sx={{ width: 28, height: 28, backgroundColor: '#7C3AED', fontSize: '0.65rem', fontWeight: 700 }}>
                    {initials}
                  </Avatar>
                )}
                {!isMine && !showAvatar && <Box sx={{ width: 28 }} />}
                <Box sx={{
                  maxWidth: '75%',
                  px: isFile && isImageFile(msg.file_type) ? 0.5 : 2.2,
                  py: isFile && isImageFile(msg.file_type) ? 0.5 : 1.2,
                  borderRadius: isMine ? '20px 20px 4px 20px' : '20px 20px 20px 4px',
                  background: isMine ? 'linear-gradient(135deg, #7C3AED 0%, #F472B6 100%)' : '#FFFFFF',
                  color: isMine ? '#FFFFFF' : '#1E1B4B',
                  boxShadow: isMine ? '0 8px 24px rgba(124,58,237,0.15)' : '0 4px 12px rgba(0,0,0,0.03)',
                  border: isMine ? 'none' : '1px solid rgba(124,58,237,0.08)',
                  transition: 'transform 0.2s ease',
                  '&:hover': { transform: 'scale(1.01)' },
                  overflow: 'hidden',
                }}>
                  {isFile ? (
                    renderFileContent(msg, isMine)
                  ) : (
                    <Typography sx={{ 
                      fontSize: '0.9rem', 
                      lineHeight: 1.6, 
                      wordBreak: 'break-word', 
                      color: 'inherit',
                      fontWeight: isMine ? 500 : 400
                    }}>
                      {msg.content}
                    </Typography>
                  )}
                  <Typography sx={{
                    fontSize: '0.65rem', mt: 0.5,
                    color: isMine ? 'rgba(255,255,255,0.7)' : '#9CA3AF',
                    textAlign: 'right',
                    fontWeight: 600,
                    px: isFile && isImageFile(msg.file_type) ? 1.5 : 0,
                    pb: isFile && isImageFile(msg.file_type) ? 0.5 : 0,
                  }}>
                    {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </Typography>
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

      {/* Input area */}
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

      {/* Call Panel */}
      {callState?.active && (
        <CallPanel
          targetUser={user}
          callType={callState.type}
          onEnd={() => setCallState(null)}
        />
      )}
    </Box>
  )
}

export default MessagePanel
