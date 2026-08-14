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
        set({ user, isAuthenticated: true }),
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
