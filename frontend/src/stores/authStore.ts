import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface User {
  id: number
  username: string
  email: string
  full_name: string
  role: string
  user_type?: string
  phone?: string | null
  avatar_url?: string | null
  is_active?: boolean
  facility_id?: number | null
  permissions?: Record<string, {
    index: boolean
    view: boolean
    add: boolean
    edit: boolean
    delete: boolean
    scope: string
  }>
}

interface AuthState {
  user: User | null
  token: string | null
  isAuthenticated: boolean
  login: (user: User, token: string) => void
  setUser: (user: User) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      login: (user, token) =>
        set({ user, token, isAuthenticated: true }),
      setUser: (user) =>
        set((state) => {
          // The header re-syncs the current user on a schedule. When the payload
          // is identical (the common case), skip the update so we don't hand
          // every auth-store subscriber a new object and re-render the app for
          // no reason. Behaviour is unchanged; only wasted renders are avoided.
          if (
            state.isAuthenticated &&
            state.user &&
            JSON.stringify(state.user) === JSON.stringify(user)
          ) {
            return state
          }
          return { user, isAuthenticated: true }
        }),
      logout: () => {
        const token = get().token
        if (token && typeof window !== 'undefined') {
          const apiBase = (import.meta.env.VITE_API_URL || '/api/v1').replace(/\/$/, '')
          void fetch(`${apiBase}/auth/logout`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
            keepalive: true,
          }).catch(() => undefined)
        }
        set({ user: null, token: null, isAuthenticated: false })
      },
    }),
    {
      name: 'auth-storage',
    }
  )
)
