import React, { useState } from 'react'
import { Modal, ModalContent, ModalHeader, ModalTitle } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { supabase } from '@/lib/supabase'
import { Lock, Eye, EyeOff, Check, X } from 'lucide-react'
import { motion } from 'framer-motion'
import bcrypt from 'bcryptjs'

interface SetPinDialogProps {
  open: boolean
  onClose: () => void
  onSuccess: () => void
  userId: string
}

export function SetPinDialog({ open, onClose, onSuccess, userId }: SetPinDialogProps) {
  const [pin, setPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [showPin, setShowPin] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')

  const validatePin = () => {
    if (pin.length !== 6) {
      setError('PIN must be exactly 6 digits')
      return false
    }
    if (!/^\d+$/.test(pin)) {
      setError('PIN must contain only numbers')
      return false
    }
    if (pin !== confirmPin) {
      setError('PINs do not match')
      return false
    }
    return true
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!validatePin()) return

    setIsSubmitting(true)

    try {
      // Hash the PIN before storing
      const hashedPin = await bcrypt.hash(pin, 10)

      // Update patient record with hashed PIN
      const { error: updateError } = await supabase
        .from('patients')
        .update({ smart_pin: hashedPin })
        .eq('user_id', userId)

      if (updateError) throw updateError

      alert('✅ Smart PIN set successfully!\n\nYour medical records are now secured. Doctors will need this PIN to access your records.')
      onSuccess()
      onClose()
      
      // Reset form
      setPin('')
      setConfirmPin('')
    } catch (error: any) {
      console.error('Error setting PIN:', error)
      setError(`Failed to set PIN: ${error.message}`)
    } finally {
      setIsSubmitting(false)
    }
  }

  const pinStrength = () => {
    const uniqueDigits = new Set(pin.split('')).size
    if (pin.length < 6) return { label: 'Too short', color: 'text-red-500' }
    if (uniqueDigits < 3) return { label: 'Weak', color: 'text-orange-500' }
    if (uniqueDigits < 5) return { label: 'Medium', color: 'text-yellow-500' }
    return { label: 'Strong', color: 'text-green-500' }
  }

  const strength = pinStrength()

  return (
    <Modal open={open} onOpenChange={onClose}>
      <ModalContent className="max-w-md">
        <ModalHeader>
          <ModalTitle className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <Lock className="w-5 h-5 text-primary" />
            </div>
            Set Smart PIN
          </ModalTitle>
        </ModalHeader>

        <form onSubmit={handleSubmit} className="space-y-6 px-6 py-4">
          {/* Info Box */}
          <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-xl p-4">
            <h4 className="font-semibold text-sm mb-2">🔒 Why Set a PIN?</h4>
            <ul className="text-xs text-muted-foreground space-y-1">
              <li>• Secure your medical records from unauthorized access</li>
              <li>• Doctors will need this PIN to view your records</li>
              <li>• You can change it anytime from settings</li>
            </ul>
          </div>

          {/* PIN Input */}
          <div>
            <label className="block text-sm font-medium mb-2">Enter 6-Digit PIN *</label>
            <div className="relative">
              <Input
                type={showPin ? 'text' : 'password'}
                value={pin}
                onChange={(e) => {
                  const value = e.target.value.replace(/\D/g, '').slice(0, 6)
                  setPin(value)
                  setError('')
                }}
                placeholder="Enter 6-digit PIN"
                maxLength={6}
                className="pr-10 text-center text-2xl tracking-widest font-mono"
              />
              <button
                type="button"
                onClick={() => setShowPin(!showPin)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showPin ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
            {pin.length > 0 && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className={`text-sm mt-2 ${strength.color} font-medium`}
              >
                Strength: {strength.label}
              </motion.p>
            )}
          </div>

          {/* Confirm PIN Input */}
          <div>
            <label className="block text-sm font-medium mb-2">Confirm PIN *</label>
            <div className="relative">
              <Input
                type={showPin ? 'text' : 'password'}
                value={confirmPin}
                onChange={(e) => {
                  const value = e.target.value.replace(/\D/g, '').slice(0, 6)
                  setConfirmPin(value)
                  setError('')
                }}
                placeholder="Re-enter PIN"
                maxLength={6}
                className="pr-10 text-center text-2xl tracking-widest font-mono"
              />
              {confirmPin.length === 6 && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  {pin === confirmPin ? (
                    <Check className="w-5 h-5 text-green-500" />
                  ) : (
                    <X className="w-5 h-5 text-red-500" />
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg p-3 text-sm text-red-600 dark:text-red-400"
            >
              {error}
            </motion.div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3 pt-4 border-t">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="flex-1"
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="flex-1"
              disabled={isSubmitting || pin.length !== 6 || confirmPin.length !== 6}
            >
              {isSubmitting ? 'Setting PIN...' : 'Set PIN'}
            </Button>
          </div>
        </form>
      </ModalContent>
    </Modal>
  )
}
