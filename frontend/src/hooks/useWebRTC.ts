import { useState, useRef, useEffect, useCallback } from 'react'
import { useChatStore } from '@/stores/chatStore'

// @ts-ignore
import SimplePeer from 'simple-peer'

interface UseWebRTCOptions {
  targetUserId?: number
  callType: 'voice' | 'video'
  isHost?: boolean
  onCallEnded?: () => void
}

interface UseWebRTCReturn {
  callState: 'idle' | 'ringing' | 'connected' | 'ended'
  localStream: MediaStream | null
  remoteStream: MediaStream | null
  remoteStreams: Record<number, MediaStream> // For Host to see everyone
  isScreenSharing: boolean
  callError: string | null
  initiateCall: () => void
  answerCall: (offer: any, fromUserId: number) => void
  toggleScreenShare: () => Promise<void>
  endCall: () => void
}

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
]

export default function useWebRTC({
  targetUserId,
  callType,
  isHost = false,
  onCallEnded,
}: UseWebRTCOptions): UseWebRTCReturn {
  const { sendWsMessage, addMessageListener, removeMessageListener } = useChatStore()

  const [callState, setCallState] = useState<'idle' | 'ringing' | 'connected' | 'ended'>('idle')
  const [localStream, setLocalStream] = useState<MediaStream | null>(null)
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null)
  const [remoteStreams, setRemoteStreams] = useState<Record<number, MediaStream>>({})
  const [isScreenSharing, setIsScreenSharing] = useState(false)
  const [callError, setCallError] = useState<string | null>(null)
  const screenStreamRef = useRef<MediaStream | null>(null)
  const peersRef = useRef<Record<number, any>>({})
  const peerRef = useRef<any>(null) // Legacy for 1-on-1

  // Handle incoming WebRTC signaling messages
  const handleSignaling = useCallback((data: any) => {
    // For Host: data.sender_id is the joiner
    // For Joiner: data.sender_id must be the host (targetUserId)
    if (!isHost && data.sender_id !== targetUserId) return

    const fromId = data.sender_id
    const targetPeer = isHost ? peersRef.current[fromId] : peerRef.current

    if (data.type === 'call_offer' && isHost) {
      // Host receives offer from joiner
      answerCall(data.offer, fromId)
    } else if (data.type === 'call_answer' && targetPeer) {
      targetPeer.signal(data.answer)
    } else if (data.type === 'ice_candidate' && targetPeer) {
      targetPeer.signal(data.candidate)
    } else if (data.type === 'call_end' || data.type === 'call_reject') {
      if (isHost) {
        if (peersRef.current[fromId]) {
          peersRef.current[fromId].destroy()
          delete peersRef.current[fromId]
          setRemoteStreams(prev => {
            const next = { ...prev }; delete next[fromId]; return next
          })
        }
      } else {
        cleanup()
        setCallState('ended')
        onCallEnded?.()
      }
    }
  }, [targetUserId, onCallEnded, isHost])

  useEffect(() => {
    addMessageListener(handleSignaling)
    return () => {
      removeMessageListener(handleSignaling)
      cleanup()
    }
  }, [handleSignaling, addMessageListener, removeMessageListener])

  const getMediaStream = async (): Promise<MediaStream> => {
    const constraints: MediaStreamConstraints = {
      audio: true,
      video: callType === 'video',
    }
    try {
      return await navigator.mediaDevices.getUserMedia(constraints)
    } catch (err) {
      if (callType === 'video') {
        console.warn('Video capture failed, falling back to voice-only media.', err)
        return navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      }
      throw err
    }
  }

  const cleanup = () => {
    Object.values(peersRef.current).forEach(p => p.destroy())
    peersRef.current = {}
    if (peerRef.current) {
      peerRef.current.destroy()
      peerRef.current = null
    }
    if (localStream) {
      localStream.getTracks().forEach(t => t.stop())
      setLocalStream(null)
    }
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach(t => t.stop())
      screenStreamRef.current = null
    }
    setRemoteStream(null)
    setRemoteStreams({})
    setIsScreenSharing(false)
  }

  const initiateCall = async () => {
    if (!targetUserId && !isHost) {
      setCallError('Unable to start call because the participant is missing.')
      setCallState('ended')
      return
    }

    if (isHost) {
      // Host just waits for offers
      const stream = await getMediaStream()
      setLocalStream(stream)
      setCallState('connected')
      return
    }

    try {
      setCallError(null)
      setCallState('ringing')
      const stream = await getMediaStream()
      setLocalStream(stream)

      const peer = new SimplePeer({
        initiator: true,
        trickle: false,
        stream: stream,
        config: { iceServers: ICE_SERVERS },
      })

      peer.on('signal', (data: any) => {
        if (data.type === 'offer') {
          sendWsMessage({
            type: 'call_offer',
            target_id: targetUserId,
            offer: data,
            call_type: callType,
          })
        } else {
          sendWsMessage({
            type: 'ice_candidate',
            target_id: targetUserId,
            candidate: data,
          })
        }
      })

      peer.on('stream', (remoteStream: MediaStream) => {
        setRemoteStream(remoteStream)
        setCallState('connected')
      })

      peer.on('connect', () => setCallState('connected'))
      peer.on('close', () => { setCallState('ended'); onCallEnded?.() })
      peer.on('error', (err: any) => {
        console.error(err)
        setCallError('Call connection failed. Please try again.')
        cleanup()
        setCallState('ended')
      })

      peerRef.current = peer
    } catch (err) {
      console.error(err)
      setCallError('Microphone or camera access failed.')
      setCallState('ended')
    }
  }

  const answerCall = async (offer: any, fromUserId: number) => {
    try {
      setCallError(null)
      let stream = localStream
      if (!stream) {
        stream = await getMediaStream()
        setLocalStream(stream)
      }

      const peer = new SimplePeer({
        initiator: false,
        trickle: false,
        stream: stream,
        config: { iceServers: ICE_SERVERS },
      })

      peer.on('signal', (data: any) => {
        if (data.type === 'answer') {
          sendWsMessage({
            type: 'call_answer',
            target_id: fromUserId,
            answer: data,
          })
        } else {
          sendWsMessage({
            type: 'ice_candidate',
            target_id: fromUserId,
            candidate: data,
          })
        }
      })

      peer.on('stream', (remoteStream: MediaStream) => {
        if (isHost) {
          setRemoteStreams(prev => ({ ...prev, [fromUserId]: remoteStream }))
        } else {
          setRemoteStream(remoteStream)
        }
        setCallState('connected')
      })

      peer.on('error', (err: any) => {
        console.error('Peer error:', err)
        setCallError('Call connection failed. Please try again.')
        if (isHost) {
          delete peersRef.current[fromUserId]
          setRemoteStreams(prev => {
            const next = { ...prev }; delete next[fromUserId]; return next
          })
        }
      })

      peer.on('connect', () => setCallState('connected'))
      peer.on('close', () => {
        setCallState('ended')
        if (!isHost) onCallEnded?.()
      })

      peer.signal(offer)
      
      if (isHost) {
        peersRef.current[fromUserId] = peer
      } else {
        peerRef.current = peer
      }
    } catch (err) {
      console.error(err)
      setCallError('Microphone or camera access failed.')
      setCallState('ended')
    }
  }

  const endCall = () => {
    if (targetUserId) {
      sendWsMessage({
        type: 'call_end',
        target_id: targetUserId,
      })
    }
    cleanup()
    setCallState('ended')
  }

  const toggleScreenShare = async () => {
    if (!localStream) return

    if (!isScreenSharing) {
      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true })
        screenStreamRef.current = screenStream
        const screenTrack = screenStream.getVideoTracks()[0]

        // Replace the video track in all active peer connections
        const localVideoTrack = localStream.getVideoTracks()[0]
        
        if (isHost) {
          Object.values(peersRef.current).forEach(p => {
            if (localVideoTrack) p.replaceTrack(localVideoTrack, screenTrack, localStream)
            else p.addTrack(screenTrack, localStream)
          })
        } else if (peerRef.current) {
          if (localVideoTrack) peerRef.current.replaceTrack(localVideoTrack, screenTrack, localStream)
          else peerRef.current.addTrack(screenTrack, localStream)
        }

        screenTrack.onended = () => stopSharing()
        setIsScreenSharing(true)
      } catch (err) {
        console.error('Failed to share screen:', err)
      }
    } else {
      stopSharing()
    }
  }

  const stopSharing = () => {
    if (!localStream || !screenStreamRef.current) return

    const screenTrack = screenStreamRef.current.getVideoTracks()[0]
    const localVideoTrack = localStream.getVideoTracks()[0]

    if (isHost) {
      Object.values(peersRef.current).forEach(p => {
        if (localVideoTrack) p.replaceTrack(screenTrack, localVideoTrack, localStream)
        else p.removeTrack(screenTrack, localStream)
      })
    } else if (peerRef.current) {
      if (localVideoTrack) peerRef.current.replaceTrack(screenTrack, localVideoTrack, localStream)
      else peerRef.current.removeTrack(screenTrack, localStream)
    }

    screenStreamRef.current.getTracks().forEach(t => t.stop())
    screenStreamRef.current = null
    setIsScreenSharing(false)
  }

  return {
    callState,
    localStream,
    remoteStream,
    callError,
    isScreenSharing,
    initiateCall,
    answerCall,
    toggleScreenShare,
    endCall,
    remoteStreams,
  }
}
