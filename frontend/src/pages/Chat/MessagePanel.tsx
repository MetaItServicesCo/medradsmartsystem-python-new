import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Box, Button, Typography, TextField, IconButton, Avatar, Tooltip,
  CircularProgress, LinearProgress,
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
import { toast } from 'react-toastify'
import {
  downloadChatFile, fetchDirectMessages, markConversationRead, sendDirectMessage, uploadChatFile,
  type DirectMessageData, type OutgoingMessage,
} from '@/api/chat'
import { useAuthStore } from '@/stores/authStore'
import { useChatStore } from '@/stores/chatStore'
import CallPanel from './CallPanel'
import ProtectedChatImage from './ProtectedChatImage'
import { describeSendError, useThread, type Pending } from './useThread'
import { palette } from '@/theme/palette'

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

const MessagePanel = ({ user }: Props) => {
  const currentUser = useAuthStore((s) => s.user)
  const {
    sendWsMessage, typingUsers, onlineUsers, isConnected, status, setActiveConversation,
  } = useChatStore()

  const [message, setMessage] = useState('')
  const [showEmoji, setShowEmoji] = useState(false)
  const [callState, setCallState] = useState<{ active: boolean; type: 'voice' | 'video' } | null>(null)
  const [uploading, setUploading] = useState(false)
  const [pendingFile, setPendingFile] = useState<{ file_url: string; file_name: string; file_size: number; file_type: string } | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const lastTypingSent = useRef(0)
  const typingTimeoutRef = useRef<any>(null)
  const readTimer = useRef<any>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const isOnline = onlineUsers.includes(user.id)
  const isTyping = typingUsers[String(user.id)]

  const fetchPage = useCallback((beforeId?: number) => fetchDirectMessages(user.id, { beforeId }), [user.id])
  const thread = useThread<DirectMessageData>({
    queryKey: ['dm-messages', user.id],
    fetchPage,
    belongs: (event) => event.type === 'chat_message' && (
      (event.sender_id === user.id && event.receiver_id === currentUser?.id)
      || (event.sender_id === currentUser?.id && event.receiver_id === user.id)),
  })
  const { messages, pending } = thread

  // This conversation is on screen: its messages are read as they arrive.
  useEffect(() => {
    setActiveConversation(user.id)
    return () => setActiveConversation(null)
  }, [user.id, setActiveConversation])

  const newestUnreadFromThem = [...messages].reverse().find((m) => m.sender_id === user.id && !m.read_at)?.id
  useEffect(() => {
    if (!newestUnreadFromThem) return
    window.clearTimeout(readTimer.current)
    readTimer.current = window.setTimeout(() => { markConversationRead(user.id).catch(() => undefined) }, 600)
    return () => window.clearTimeout(readTimer.current)
  }, [newestUnreadFromThem, user.id])

  // Follow new messages, not earlier pages loading above.
  const lastKey = `${messages[messages.length - 1]?.id ?? ''}:${pending.length}`
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [lastKey])

  const handleSend = () => {
    if (!message.trim() && !pendingFile) return
    const outgoing: OutgoingMessage = pendingFile
      ? { content: message.trim() || `📎 ${pendingFile.file_name}`, message_type: 'file', ...pendingFile }
      : { content: message.trim(), message_type: 'text' }
    const draft = {
      id: -Date.now(), sender_id: currentUser?.id ?? 0, receiver_id: user.id, read_at: null,
      created_at: new Date().toISOString(), file_url: null, file_name: null, file_size: null, file_type: null,
      ...outgoing,
    } as DirectMessageData
    thread.send(draft, () => sendDirectMessage(user.id, outgoing), describeSendError)
    setPendingFile(null)
    setMessage('')
    setShowEmoji(false)
    window.clearTimeout(typingTimeoutRef.current)
    sendWsMessage({ type: 'typing', receiver_id: user.id, is_typing: false })
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

  const handleChange = (value: string) => {
    setMessage(value)
    // Say "typing" at most every two seconds, and stop two seconds after the last key.
    const now = Date.now()
    if (value && now - lastTypingSent.current > 2000) {
      lastTypingSent.current = now
      sendWsMessage({ type: 'typing', receiver_id: user.id, is_typing: true })
    }
    window.clearTimeout(typingTimeoutRef.current)
    typingTimeoutRef.current = window.setTimeout(() => {
      sendWsMessage({ type: 'typing', receiver_id: user.id, is_typing: false })
    }, 2000)
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

  const handleStartCall = (type: 'voice' | 'video') => {
    setCallState({ active: true, type })
  }

  const displayName = displayNameFor(user)
  const initials = initialsFor(displayName)

  // Render a file message bubble
  const renderFileContent = (msg: DirectMessageData, isMine: boolean) => {
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
          backgroundColor: isMine ? 'rgba(255,255,255,0.12)' : 'rgba(4,120,87,0.04)',
          border: `1px solid ${isMine ? 'rgba(255,255,255,0.2)' : 'rgba(4,120,87,0.1)'}`,
          textDecoration: 'none',
          color: 'inherit',
          transition: 'all 0.2s ease',
          '&:hover': { backgroundColor: isMine ? 'rgba(255,255,255,0.18)' : 'rgba(4,120,87,0.08)' },
        }}
      >
        <Box sx={{
          width: 40, height: 40, borderRadius: '10px',
          backgroundColor: isMine ? 'rgba(255,255,255,0.15)' : palette.brandTint,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
          color: isMine ? '#fff' : palette.brand,
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
      boxShadow: '0 4px 24px rgba(4,120,87,0.08)',
      border: '1px solid rgba(4,120,87,0.06)',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <Box sx={{
        display: 'flex', alignItems: 'center', gap: 1.5,
        px: 3, py: 2, borderBottom: `1px solid ${palette.surfaceGray}`,
      }}>
        <Avatar sx={{ width: 40, height: 40, backgroundColor: palette.brand, fontWeight: 700, fontSize: '0.9rem' }}>
          {initials}
        </Avatar>
        <Box sx={{ flex: 1 }}>
          <Typography sx={{ fontWeight: 700, fontSize: '0.95rem', color: palette.ink }}>
            {displayName}
          </Typography>
          <Typography variant="caption" sx={{ color: isOnline ? palette.brandMid : palette.textDisabled }}>
            {isTyping ? 'Typing...' : !isConnected && status !== 'idle'
              ? 'Reconnecting… messages still send'
              : isOnline ? 'Online' : 'Offline'}
          </Typography>
        </Box>
        <Tooltip title="Voice Call">
          <IconButton onClick={() => handleStartCall('voice')}
            sx={{ color: palette.brand, backgroundColor: palette.brandTint, '&:hover': { backgroundColor: palette.brandSoft } }}>
            <CallIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Video Call">
          <IconButton onClick={() => handleStartCall('video')}
            sx={{ color: palette.brand, backgroundColor: palette.brandTint, '&:hover': { backgroundColor: palette.brandSoft } }}>
            <VideocamIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>

      {/* Messages area */}
      <Box sx={{ flex: 1, overflowY: 'auto', px: 3, py: 2 }}>
        {thread.hasMore && (
          <Box sx={{ textAlign: 'center', mb: 1.5 }}>
            <Button size="small" onClick={thread.loadEarlier} disabled={thread.loadingEarlier}
                    sx={{ textTransform: 'none', fontWeight: 700, color: palette.brand }}>
              {thread.loadingEarlier ? 'Loading…' : 'Load earlier messages'}
            </Button>
          </Box>
        )}
        {thread.isLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress size={28} sx={{ color: palette.brand }} />
          </Box>
        ) : messages.length === 0 && pending.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 6 }}>
            <Typography variant="body2" sx={{ color: palette.textDisabled }}>
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
                  <Avatar sx={{ width: 28, height: 28, backgroundColor: palette.brand, fontSize: '0.65rem', fontWeight: 700 }}>
                    {initials}
                  </Avatar>
                )}
                {!isMine && !showAvatar && <Box sx={{ width: 28 }} />}
                <Box sx={{
                  maxWidth: '75%',
                  px: isFile && isImageFile(msg.file_type) ? 0.5 : 2.2,
                  py: isFile && isImageFile(msg.file_type) ? 0.5 : 1.2,
                  borderRadius: isMine ? '20px 20px 4px 20px' : '20px 20px 20px 4px',
                  background: isMine ? `linear-gradient(135deg, ${palette.brand} 0%, ${palette.accentLight} 100%)` : palette.white,
                  color: isMine ? palette.white : palette.ink,
                  boxShadow: isMine ? '0 8px 24px rgba(4,120,87,0.15)' : '0 4px 12px rgba(0,0,0,0.03)',
                  border: isMine ? 'none' : '1px solid rgba(4,120,87,0.08)',
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
                    color: isMine ? 'rgba(255,255,255,0.7)' : palette.textDisabled,
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
        <PendingMessages pending={pending} onDiscard={thread.discard} />
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
          backgroundColor: palette.brandTint,
          border: '1px solid rgba(4,120,87,0.1)',
        }}>
          <Box sx={{
            width: 36, height: 36, borderRadius: '8px',
            backgroundColor: palette.brandSoft,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: palette.brand,
          }}>
            {getFileIcon(pendingFile.file_type)}
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontSize: '0.8rem', fontWeight: 600, color: palette.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {pendingFile.file_name}
            </Typography>
            <Typography sx={{ fontSize: '0.7rem', color: palette.textDisabled }}>
              {formatFileSize(pendingFile.file_size)}
            </Typography>
          </Box>
          <IconButton size="small" onClick={() => setPendingFile(null)} sx={{ color: palette.textDisabled }}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </Box>
      )}

      {/* Upload progress */}
      {uploading && (
        <Box sx={{ px: 2, pb: 0.5 }}>
          <LinearProgress sx={{
            borderRadius: 4,
            '& .MuiLinearProgress-bar': { backgroundColor: palette.brand },
            backgroundColor: palette.brandSoft,
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
        px: 2, py: 1.5, borderTop: `1px solid ${palette.surfaceGray}`,
      }}>
        <IconButton onClick={() => setShowEmoji(!showEmoji)} sx={{ color: showEmoji ? palette.brand : palette.textDisabled }}>
          <EmojiEmotionsIcon />
        </IconButton>
        <Tooltip title="Attach file">
          <IconButton
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            sx={{ color: pendingFile ? palette.brand : palette.textDisabled, '&:hover': { color: palette.brand } }}
          >
            <AttachFileIcon sx={{ transform: 'rotate(45deg)' }} />
          </IconButton>
        </Tooltip>
        <TextField
          fullWidth size="small" placeholder={pendingFile ? "Add a message or press send..." : "Type a message..."}
          value={message} onChange={(e) => handleChange(e.target.value)}
          onKeyDown={handleKeyDown}
          multiline maxRows={3}
          sx={{
            '& .MuiOutlinedInput-root': {
              borderRadius: '12px', backgroundColor: palette.surfaceFaint,
              '& fieldset': { borderColor: palette.border },
            },
          }}
        />
        <IconButton
          onClick={handleSend}
          disabled={!message.trim() && !pendingFile}
          sx={{
            backgroundColor: palette.brand, color: '#fff',
            '&:hover': { backgroundColor: palette.brandDeep },
            '&.Mui-disabled': { backgroundColor: palette.brandBorder, color: palette.brandPale },
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

/** Messages still being sent, or that failed, with the reason and a way to retry. */
export function PendingMessages({ pending, onDiscard }: {
  pending: Pending<{ content: string }>[]
  onDiscard: (localId: string) => void
}) {
  return (
    <>
      {pending.map((item) => {
        const failed = item.status === 'failed'
        return (
          <Box key={item.localId} sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', mb: 0.8 }}>
            <Box sx={{
              maxWidth: '75%', px: 2.2, py: 1.2, borderRadius: '20px 20px 4px 20px',
              background: failed ? palette.dangerWash : `linear-gradient(135deg, ${palette.brand} 0%, ${palette.accentLight} 100%)`,
              color: failed ? palette.danger : palette.white,
              border: failed ? `1px solid ${palette.dangerTint}` : 'none',
              opacity: failed ? 1 : 0.7,
            }}>
              <Typography sx={{ fontSize: '0.9rem', lineHeight: 1.6, wordBreak: 'break-word', color: 'inherit' }}>
                {item.message.content}
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.3 }}>
              <Typography sx={{ fontSize: '0.7rem', color: failed ? palette.danger : palette.textDisabled, fontWeight: 700 }}>
                {failed ? item.error : 'Sending…'}
              </Typography>
              {failed && (
                <>
                  <Button size="small" onClick={item.retry}
                          sx={{ minWidth: 0, p: 0, textTransform: 'none', fontWeight: 800, fontSize: '0.72rem' }}>
                    Retry
                  </Button>
                  <Button size="small" onClick={() => onDiscard(item.localId)}
                          sx={{ minWidth: 0, p: 0, textTransform: 'none', fontWeight: 700, fontSize: '0.72rem', color: palette.textMuted }}>
                    Discard
                  </Button>
                </>
              )}
            </Box>
          </Box>
        )
      })}
    </>
  )
}
