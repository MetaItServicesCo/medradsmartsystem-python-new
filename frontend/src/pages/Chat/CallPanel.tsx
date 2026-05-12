import { useState, useEffect, useRef } from 'react'
import {
  Box, Typography, IconButton, Avatar, Tooltip, Dialog,
} from '@mui/material'
import CallEndIcon from '@mui/icons-material/CallEnd'
import MicIcon from '@mui/icons-material/Mic'
import MicOffIcon from '@mui/icons-material/MicOff'
import VideocamIcon from '@mui/icons-material/Videocam'
import VideocamOffIcon from '@mui/icons-material/VideocamOff'
import ScreenShareIcon from '@mui/icons-material/ScreenShare'
import StopScreenShareIcon from '@mui/icons-material/StopScreenShare'
import useWebRTC from '@/hooks/useWebRTC'

interface Props {
  targetUser: any
  callType: 'voice' | 'video'
  isHost?: boolean
  incomingOffer?: any
  incomingFromUserId?: number
  onEnd: () => void
}

const safeText = (value: unknown, fallback = '') => {
  if (typeof value === 'string') return value
  if (value === null || value === undefined) return fallback
  return String(value)
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

const CallPanel = ({ targetUser, callType, isHost, incomingOffer, incomingFromUserId, onEnd }: Props) => {
  const [muted, setMuted] = useState(false)
  const [videoOff, setVideoOff] = useState(callType === 'voice')
  const [duration, setDuration] = useState(0)
  const callStartedRef = useRef(false)
  const localVideoRef = useRef<HTMLVideoElement>(null)
  const remoteVideoRef = useRef<HTMLVideoElement>(null)
  const remoteAudioRef = useRef<HTMLAudioElement>(null)

  const {
    callState,
    localStream,
    remoteStream,
    remoteStreams,
    callError,
    isScreenSharing,
    initiateCall,
    answerCall,
    toggleScreenShare,
    endCall,
  } = useWebRTC({
    targetUserId: targetUser?.id,
    callType,
    isHost,
    onCallEnded: onEnd,
  })

  // Start or answer call on mount. React StrictMode can run effects twice in dev.
  useEffect(() => {
    if (callStartedRef.current) return
    callStartedRef.current = true
    if (incomingOffer && incomingFromUserId) {
      answerCall(incomingOffer, incomingFromUserId)
    } else {
      initiateCall()
    }
  }, [answerCall, incomingFromUserId, incomingOffer, initiateCall])

  // Attach streams
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream
    }
  }, [localStream, isScreenSharing])

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream
    }
  }, [remoteStream])

  useEffect(() => {
    if (remoteAudioRef.current && remoteStream) {
      remoteAudioRef.current.srcObject = remoteStream
    }
  }, [remoteStream])

  // Duration timer
  useEffect(() => {
    if (callState !== 'connected') return
    const interval = setInterval(() => setDuration(d => d + 1), 1000)
    return () => clearInterval(interval)
  }, [callState])

  const toggleMute = () => {
    if (localStream) {
      localStream.getAudioTracks().forEach(t => { t.enabled = !t.enabled })
      setMuted(!muted)
    }
  }

  const toggleVideo = () => {
    if (localStream) {
      localStream.getVideoTracks().forEach(t => { t.enabled = !t.enabled })
      setVideoOff(!videoOff)
    }
  }

  const formatDuration = (s: number) => {
    const mins = Math.floor(s / 60).toString().padStart(2, '0')
    const secs = (s % 60).toString().padStart(2, '0')
    return `${mins}:${secs}`
  }

  const handleEnd = () => {
    endCall()
    onEnd()
  }

  const participantName = safeText(targetUser?.full_name || targetUser?.username, targetUser?.id ? `User #${targetUser.id}` : 'Unknown User')
  const initials = initialsFor(participantName)
  const hasRemoteVideo = Boolean(remoteStream?.getVideoTracks().length)
  const showRemoteVideo = callType === 'video' && hasRemoteVideo
  const hasHostParticipants = isHost && Object.keys(remoteStreams).length > 0
  const showAvatarPanel = callType === 'voice' || (!showRemoteVideo && !hasHostParticipants)

  return (
    <Dialog
      open
      fullScreen
      PaperProps={{
        sx: {
          backgroundColor: '#0F0A1F',
          backgroundImage: 'radial-gradient(circle at top, rgba(124,58,237,0.28), transparent 36%)',
        },
      }}
      sx={{ zIndex: (theme) => theme.zIndex.modal + 20 }}
    >
      <Box sx={{
        width: '100%', height: '100%',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        position: 'relative',
      }}>
        {/* Remote video area */}
        {callType === 'video' && (
          <Box sx={{
            position: 'absolute', top: 0, left: 0,
            width: '100%', height: '100%',
            display: 'grid',
            gridTemplateColumns: isHost ? 'repeat(auto-fit, minmax(320px, 1fr))' : '1fr',
            gap: 1, backgroundColor: '#000'
          }}>
            {!isHost && showRemoteVideo && (
              <video
                ref={remoteVideoRef}
                autoPlay playsInline
                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
              />
            )}
            
            {isHost && Object.entries(remoteStreams).map(([uid, stream]) => (
              <Box key={uid} sx={{ position: 'relative', width: '100%', height: '100%' }}>
                <video
                  autoPlay playsInline
                  ref={el => { if (el) el.srcObject = stream }}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
                <Box sx={{ position: 'absolute', bottom: 10, left: 10, backgroundColor: 'rgba(0,0,0,0.5)', px: 1, borderRadius: 1 }}>
                  <Typography variant="caption" sx={{ color: '#fff' }}>Participant {uid}</Typography>
                </Box>
              </Box>
            ))}
          </Box>
        )}

        {/* Local video (PIP) */}
        {callType === 'video' && localStream && (
          <Box sx={{
            position: 'absolute', top: 20, right: 20,
            width: 180, height: 135, borderRadius: '12px',
            overflow: 'hidden', border: '2px solid rgba(255,255,255,0.3)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
            zIndex: 10,
          }}>
            <video
              ref={localVideoRef}
              autoPlay playsInline muted
              style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }}
            />
          </Box>
        )}

        {/* Voice call or waiting UI */}
        {showAvatarPanel && (
          <Box sx={{ textAlign: 'center', zIndex: 5 }}>
            <Avatar sx={{
              width: 100, height: 100, mx: 'auto', mb: 3,
              backgroundColor: '#7C3AED',
              fontSize: '2.5rem', fontWeight: 700,
              boxShadow: '0 0 0 8px rgba(124,58,237,0.2), 0 0 0 16px rgba(124,58,237,0.1)',
              animation: callState === 'ringing' ? 'pulse 2s infinite' : 'none',
              '@keyframes pulse': {
                '0%': { boxShadow: '0 0 0 8px rgba(124,58,237,0.2), 0 0 0 16px rgba(124,58,237,0.1)' },
                '50%': { boxShadow: '0 0 0 12px rgba(124,58,237,0.3), 0 0 0 24px rgba(124,58,237,0.15)' },
                '100%': { boxShadow: '0 0 0 8px rgba(124,58,237,0.2), 0 0 0 16px rgba(124,58,237,0.1)' },
              },
            }}>
              {initials}
            </Avatar>
            <Typography variant="h5" sx={{ color: '#fff', fontWeight: 700, mb: 0.5 }}>
              {participantName} {isHost ? '(Meeting Host)' : ''}
            </Typography>
            <Typography sx={{ color: 'rgba(255,255,255,0.5)', mb: 1 }}>
              {callError ? callError :
               callState === 'ringing' ? 'Calling...' :
               callState === 'connected' ? (isHost ? `${Object.keys(remoteStreams).length} joined` : formatDuration(duration)) :
               callState === 'ended' ? 'Call ended' : 'Connecting...'}
            </Typography>
            {callType === 'video' && remoteStream && !hasRemoteVideo && (
              <Typography sx={{ color: 'rgba(255,255,255,0.42)', fontSize: 13 }}>
                Remote camera is unavailable. Audio is connected.
              </Typography>
            )}
          </Box>
        )}

        {!showRemoteVideo && remoteStream && (
          <audio ref={remoteAudioRef} autoPlay playsInline />
        )}

        {/* Controls */}
        <Box sx={{
          position: 'absolute', bottom: 40,
          display: 'flex', gap: 2, zIndex: 10,
        }}>
          <Tooltip title={muted ? 'Unmute' : 'Mute'}>
            <IconButton onClick={toggleMute}
              sx={{
                width: 56, height: 56, borderRadius: '50%',
                backgroundColor: muted ? '#EF4444' : 'rgba(255,255,255,0.15)',
                color: '#fff',
                '&:hover': { backgroundColor: muted ? '#DC2626' : 'rgba(255,255,255,0.25)' },
              }}>
              {muted ? <MicOffIcon /> : <MicIcon />}
            </IconButton>
          </Tooltip>

          {callType === 'video' && (
            <Tooltip title={videoOff ? 'Turn on camera' : 'Turn off camera'}>
              <IconButton onClick={toggleVideo}
                sx={{
                  width: 56, height: 56, borderRadius: '50%',
                  backgroundColor: videoOff ? '#EF4444' : 'rgba(255,255,255,0.15)',
                  color: '#fff',
                  '&:hover': { backgroundColor: videoOff ? '#DC2626' : 'rgba(255,255,255,0.25)' },
                }}>
                {videoOff ? <VideocamOffIcon /> : <VideocamIcon />}
              </IconButton>
            </Tooltip>
          )}
          
          <Tooltip title={isScreenSharing ? 'Stop sharing' : 'Share screen'}>
            <IconButton onClick={toggleScreenShare}
              sx={{
                width: 56, height: 56, borderRadius: '50%',
                backgroundColor: isScreenSharing ? '#7C3AED' : 'rgba(255,255,255,0.15)',
                color: '#fff',
                '&:hover': { backgroundColor: isScreenSharing ? '#6D28D9' : 'rgba(255,255,255,0.25)' },
              }}>
              {isScreenSharing ? <StopScreenShareIcon /> : <ScreenShareIcon />}
            </IconButton>
          </Tooltip>

          <Tooltip title="End Call">
            <IconButton onClick={handleEnd}
              sx={{
                width: 56, height: 56, borderRadius: '50%',
                backgroundColor: '#EF4444', color: '#fff',
                '&:hover': { backgroundColor: '#DC2626' },
                boxShadow: '0 4px 16px rgba(239,68,68,0.4)',
              }}>
              <CallEndIcon />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>
    </Dialog>
  )
}

export default CallPanel
