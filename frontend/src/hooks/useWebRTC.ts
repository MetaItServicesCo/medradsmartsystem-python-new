import { useState, useRef, useEffect, useCallback } from 'react'
import { useChatStore } from '@/stores/chatStore'

// @ts-ignore
import SimplePeer from 'simple-peer'

interface UseWebRTCOptions {
  targetUserId: number
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
    return navigator.mediaDevices.getUserMedia(constraints)
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
    if (isHost) {
      // Host just waits for offers
      const stream = await getMediaStream()
      setLocalStream(stream)
      setCallState('connected')
      return
    }

    try {
      setCallState('ringing')
      const stream = await getMediaStream()
      setLocalStream(stream)

      const peer = new SimplePeer({
        initiator: true,
        trickle: true,
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

      // ... other listeners same as before
      peer.on('connect', () => setCallState('connected'))
      peer.on('close', () => { setCallState('ended'); onCallEnded?.() })
      peer.on('error', (err: any) => { console.error(err); cleanup(); onCallEnded?.() })

      peerRef.current = peer
    } catch (err) {
      console.error(err)
      setCallState('ended')
      onCallEnded?.()
    }
  }

  const answerCall = async (offer: any, fromUserId: number) => {
    try {
      let stream = localStream
      if (!stream) {
        stream = await getMediaStream()
        setLocalStream(stream)
      }

      const peer = new SimplePeer({
        initiator: false,
        trickle: true,
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
        if (isHost) {
          delete peersRef.current[fromUserId]
          setRemoteStreams(prev => {
            const next = { ...prev }; delete next[fromUserId]; return next
          })
        }
      })

      peer.signal(offer)
      
      if (isHost) {
        peersRef.current[fromUserId] = peer
      } else {
        peerRef.current = peer
      }
      
      setCallState('connected')
    } catch (err) {
      console.error(err)
    }
  }

  const endCall = () => {
    sendWsMessage({
      type: 'call_end',
      target_id: targetUserId,
    })
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
    isScreenSharing,
    initiateCall,
    answerCall,
    toggleScreenShare,
    endCall,
    remoteStreams,
  }
}
