import { create } from 'zustand'
import { User } from '@supabase/supabase-js'

interface AuthState {
  user: User | null
  role: 'patient' | 'doctor' | null
  setUser: (user: User | null) => void
  setRole: (role: 'patient' | 'doctor' | null) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  role: null,
  setUser: (user) => set({ user }),
  setRole: (role) => set({ role }),
  logout: () => set({ user: null, role: null }),
}))
