import { useState, useCallback } from 'react'

interface ToastConfig {
  title: string
  description?: string
  variant?: 'default' | 'success' | 'error' | 'warning'
  duration?: number
}

let toastIdCounter = 0

export function useToast() {
  const [toasts, setToasts] = useState<Array<ToastConfig & { id: number }>>([])

  const toast = useCallback((config: ToastConfig) => {
    const id = toastIdCounter++
    const toast = { ...config, id }
    
    setToasts((prev) => [...prev, toast])

    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, config.duration || 5000)
  }, [])

  const success = useCallback((title: string, description?: string) => {
    toast({ title, description, variant: 'success' })
  }, [toast])

  const error = useCallback((title: string, description?: string) => {
    toast({ title, description, variant: 'error' })
  }, [toast])

  const warning = useCallback((title: string, description?: string) => {
    toast({ title, description, variant: 'warning' })
  }, [toast])

  const info = useCallback((title: string, description?: string) => {
    toast({ title, description, variant: 'default' })
  }, [toast])

  return { toast, success, error, warning, info, toasts }
}
