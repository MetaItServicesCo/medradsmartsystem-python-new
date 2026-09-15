/**
 * The realtime connection behind chat: presence, typing, calls and new messages.
 *
 * Messages are sent over REST, which says whether they were saved; this socket
 * only delivers what happens. It is kept alive the way a hospital network needs:
 *  - one socket per signed-in user, replaced when the user or token changes;
 *  - a heartbeat every 25 seconds, so proxies and CDNs do not close it as idle;
 *  - reconnecting with a growing delay, and a "reconnected" event so open
 *    conversations load whatever arrived while it was down;
 *  - no retrying a rejected token (close code 4001) until the user signs in again.
 */
import { create } from 'zustand'
import { realtimeUrl } from '@/api/client'
import { useAuthStore } from './authStore'

export type ConnectionStatus = 'idle' | 'connecting' | 'open' | 'closed'

interface ChatState {
  ws: WebSocket | null
  status: ConnectionStatus
  /** True while the socket is open. */
  isConnected: boolean
  onlineUsers: number[]
  unreadCounts: Record<string, number>
  typingUsers: Record<string, boolean>
  /** The friend whose conversation is on screen: their messages are not unread. */
  activeConversationUserId: number | null
  incomingCall: {
    senderId: number
    senderName?: string
    senderAvatar?: string | null
    callType: 'voice' | 'video'
    offer?: any
  } | null
  messageListeners: ((msg: any) => void)[]

  connect: () => void
  disconnect: () => void
  sendWsMessage: (data: any) => boolean
  addMessageListener: (fn: (msg: any) => void) => void
  removeMessageListener: (fn: (msg: any) => void) => void
  setIncomingCall: (call: ChatState['incomingCall']) => void
  clearIncomingCall: () => void
  updateUnreadCounts: (counts: Record<string, number>) => void
  setActiveConversation: (userId: number | null) => void
}

const HEARTBEAT_MS = 25_000
const MAX_RETRY_MS = 15_000

// Timers and bookkeeping for the one socket, outside React state.
let heartbeat: number | undefined
let retryTimer: number | undefined
let retries = 0
let openedToken: string | null = null
let rejectedToken: string | null = null
let hasConnectedBefore = false

const clearTimers = () => {
  window.clearInterval(heartbeat)
  window.clearTimeout(retryTimer)
  heartbeat = undefined
  retryTimer = undefined
}

export const useChatStore = create<ChatState>()((set, get) => {
  const emit = (event: any) => get().messageListeners.forEach((listener) => listener(event))

  const scheduleReconnect = () => {
    window.clearTimeout(retryTimer)
    const delay = Math.min(1000 * 2 ** retries, MAX_RETRY_MS)
    retries += 1
    retryTimer = window.setTimeout(() => get().connect(), delay)
  }

  return {
    ws: null,
    status: 'idle',
    isConnected: false,
    onlineUsers: [],
    unreadCounts: {},
    typingUsers: {},
    activeConversationUserId: null,
    incomingCall: null,
    messageListeners: [],

    connect: () => {
      const { token, isAuthenticated } = useAuthStore.getState()
      if (!token || !isAuthenticated || token === rejectedToken) return

      const current = get().ws
      if (current && openedToken === token
          && (current.readyState === WebSocket.OPEN || current.readyState === WebSocket.CONNECTING)) {
        return
      }
      if (current) {
        // A different user or token: this socket speaks for someone else now.
        current.onclose = null
        current.close()
      }
      clearTimers()

      const ws = new WebSocket(realtimeUrl(`/ws/${token}`))
      openedToken = token
      set({ ws, status: 'connecting', isConnected: false })

      ws.onopen = () => {
        if (get().ws !== ws) return
        retries = 0
        set({ status: 'open', isConnected: true })
        heartbeat = window.setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'ping' }))
        }, HEARTBEAT_MS)
        if (hasConnectedBefore) emit({ type: 'reconnected' })
        hasConnectedBefore = true
      }

      ws.onclose = (event) => {
        if (get().ws !== ws) return
        clearTimers()
        set({ ws: null, status: 'closed', isConnected: false })
        if (event.code === 4001) {
          // The server refused this token; retrying it cannot succeed.
          rejectedToken = token
          return
        }
        if (useAuthStore.getState().isAuthenticated) scheduleReconnect()
      }

      ws.onerror = () => {
        // onclose follows and decides whether to retry.
      }

      ws.onmessage = (event) => {
        let data: any
        try {
          data = JSON.parse(event.data)
        } catch {
          return
        }
        handleIncomingMessage(data, set, get, emit)
      }
    },

    disconnect: () => {
      clearTimers()
      const ws = get().ws
      if (ws) {
        ws.onclose = null
        ws.close()
      }
      openedToken = null
      hasConnectedBefore = false
      set({ ws: null, status: 'idle', isConnected: false, onlineUsers: [], unreadCounts: {} })
    },

    sendWsMessage: (data: any) => {
      const ws = get().ws
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(data))
        return true
      }
      return false
    },

    addMessageListener: (fn) => {
      set((s) => ({ messageListeners: [...s.messageListeners, fn] }))
    },

    removeMessageListener: (fn) => {
      set((s) => ({ messageListeners: s.messageListeners.filter((l) => l !== fn) }))
    },

    setIncomingCall: (call) => set({ incomingCall: call }),
    clearIncomingCall: () => set({ incomingCall: null }),

    updateUnreadCounts: (counts) => set((s) => {
      // The open conversation is being read as it arrives.
      const active = s.activeConversationUserId
      return { unreadCounts: active ? { ...counts, [String(active)]: 0 } : counts }
    }),

    setActiveConversation: (userId) => set((s) => ({
      activeConversationUserId: userId,
      unreadCounts: userId ? { ...s.unreadCounts, [String(userId)]: 0 } : s.unreadCounts,
    })),
  }
})

// Signing out, or in as someone else, must not leave a socket speaking for the
// previous user.
useAuthStore.subscribe((state, previous) => {
  if (state.token === previous.token) return
  rejectedToken = null
  const store = useChatStore.getState()
  if (!state.token || !state.isAuthenticated) {
    store.disconnect()
  } else if (store.ws || previous.token) {
    store.connect()
  }
})

function handleIncomingMessage(data: any, set: any, get: () => ChatState, emit: (event: any) => void) {
  switch (data.type) {
    case 'online_users':
      set({ onlineUsers: data.users || [] })
      break

    case 'presence':
      set((s: ChatState) => {
        const users = new Set(s.onlineUsers)
        if (data.is_online) users.add(data.user_id)
        else users.delete(data.user_id)
        return { onlineUsers: Array.from(users) }
      })
      break

    case 'chat_message': {
      emit(data)
      const me = useAuthStore.getState().user
      const fromSomeoneElse = me && data.sender_id !== me.id
      if (fromSomeoneElse && get().activeConversationUserId !== data.sender_id) {
        set((s: ChatState) => ({
          unreadCounts: {
            ...s.unreadCounts,
            [String(data.sender_id)]: (s.unreadCounts[String(data.sender_id)] || 0) + 1,
          },
        }))
      }
      if (fromSomeoneElse) {
        set((s: ChatState) => ({ typingUsers: { ...s.typingUsers, [String(data.sender_id)]: false } }))
      }
      break
    }

    case 'typing':
      set((s: ChatState) => ({
        typingUsers: { ...s.typingUsers, [String(data.sender_id)]: data.is_typing },
      }))
      window.setTimeout(() => {
        set((s: ChatState) => ({ typingUsers: { ...s.typingUsers, [String(data.sender_id)]: false } }))
      }, 3000)
      break

    case 'call_offer':
      emit(data)
      set({
        incomingCall: {
          senderId: data.sender_id,
          senderName: data.sender_name,
          senderAvatar: data.sender_avatar,
          callType: data.call_type || 'voice',
          offer: data.offer,
        },
      })
      break

    case 'pong':
      break

    // workspace_message, read_receipt, friends_changed, error and call signals
    // are for whichever screen is listening.
    default:
      emit(data)
      break
  }
}
