import { create } from 'zustand'
import { useAuthStore } from './authStore'

interface ChatMessage {
  id: number
  sender_id: number
  receiver_id?: number
  workspace_id?: number
  content: string
  message_type: string
  created_at: string
  sender_name?: string
  sender_avatar?: string | null
  read_at?: string | null
}

interface ChatState {
  ws: WebSocket | null
  isConnected: boolean
  onlineUsers: number[]
  unreadCounts: Record<string, number>
  typingUsers: Record<string, boolean>
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
  sendWsMessage: (data: any) => void
  addMessageListener: (fn: (msg: any) => void) => void
  removeMessageListener: (fn: (msg: any) => void) => void
  setIncomingCall: (call: ChatState['incomingCall']) => void
  clearIncomingCall: () => void
  updateUnreadCounts: (counts: Record<string, number>) => void
}

export const useChatStore = create<ChatState>()((set, get) => ({
  ws: null,
  isConnected: false,
  onlineUsers: [],
  unreadCounts: {},
  typingUsers: {},
  incomingCall: null,
  messageListeners: [],

  connect: () => {
    const token = useAuthStore.getState().token
    if (!token) return

    const existing = get().ws
    if (existing && existing.readyState === WebSocket.OPEN) return

    const wsUrl = `${(import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1').replace('http', 'ws')}/ws/${token}`
    const ws = new WebSocket(wsUrl)

    ws.onopen = () => {
      set({ ws, isConnected: true })
    }

    ws.onclose = () => {
      set({ ws: null, isConnected: false })
      // Auto-reconnect after 3 seconds
      setTimeout(() => {
        if (useAuthStore.getState().isAuthenticated) {
          get().connect()
        }
      }, 3000)
    }

    ws.onerror = () => {
      ws.close()
    }

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        handleIncomingMessage(data, set, get)
      } catch (e) {
        // ignore parse errors
      }
    }

    set({ ws })
  },

  disconnect: () => {
    const ws = get().ws
    if (ws) {
      ws.close()
    }
    set({ ws: null, isConnected: false })
  },

  sendWsMessage: (data: any) => {
    const ws = get().ws
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data))
    }
  },

  addMessageListener: (fn) => {
    set((s) => ({ messageListeners: [...s.messageListeners, fn] }))
  },

  removeMessageListener: (fn) => {
    set((s) => ({ messageListeners: s.messageListeners.filter((l) => l !== fn) }))
  },

  setIncomingCall: (call) => set({ incomingCall: call }),
  clearIncomingCall: () => set({ incomingCall: null }),

  updateUnreadCounts: (counts) => set({ unreadCounts: counts }),
}))


function handleIncomingMessage(data: any, set: any, get: any) {
  const type = data.type

  switch (type) {
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

    case 'chat_message':
    case 'workspace_message':
      // Notify all listeners
      get().messageListeners.forEach((fn: (msg: any) => void) => fn(data))
      // Increment unread count for DMs
      if (type === 'chat_message') {
        const currentUser = useAuthStore.getState().user
        if (currentUser && data.sender_id !== currentUser.id) {
          set((s: ChatState) => ({
            unreadCounts: {
              ...s.unreadCounts,
              [String(data.sender_id)]: (s.unreadCounts[String(data.sender_id)] || 0) + 1,
            },
          }))
        }
      }
      break

    case 'typing':
      set((s: ChatState) => ({
        typingUsers: {
          ...s.typingUsers,
          [String(data.sender_id)]: data.is_typing,
        },
      }))
      // Clear typing indicator after 3 seconds
      setTimeout(() => {
        set((s: ChatState) => ({
          typingUsers: {
            ...s.typingUsers,
            [String(data.sender_id)]: false,
          },
        }))
      }, 3000)
      break

    case 'read_receipt':
      get().messageListeners.forEach((fn: (msg: any) => void) => fn(data))
      break

    case 'call_offer':
      get().messageListeners.forEach((fn: (msg: any) => void) => fn(data))
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

    case 'call_answer':
    case 'ice_candidate':
    case 'call_end':
    case 'call_reject':
      get().messageListeners.forEach((fn: (msg: any) => void) => fn(data))
      break

    default:
      break
  }
}
