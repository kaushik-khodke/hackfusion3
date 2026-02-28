import React, { useState } from 'react'
import { Modal, ModalContent, ModalHeader, ModalTitle } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { supabase } from '@/lib/supabase'
import { Lock, AlertCircle, Check } from 'lucide-react'
import bcrypt from 'bcryptjs'

interface VerifyPinDialogProps {
  open: boolean
  onClose: () => void
  consentRequestId: string
  onSuccess: () => void
}

export function VerifyPinDialog({ 
  open, 
  onClose, 
  consentRequestId,
  onSuccess 
}: VerifyPinDialogProps) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [isVerifying, setIsVerifying] = useState(false)

  const handleVerify = async () => {
    if (pin.length !== 6) {
      setError('PIN must be 6 digits')
      return
    }

    setIsVerifying(true)
    setError('')

    try {
      // Get patient's stored PIN hash
      const { data: patient } = await supabase
        .from('patients')
        .select('smart_pin')
        .eq('user_id', (await supabase.auth.getUser()).data.user?.id)
        .single()

      if (!patient?.smart_pin) {
        throw new Error('PIN not set')
      }

      // Verify PIN
      const isValid = await bcrypt.compare(pin, patient.smart_pin)

      if (!isValid) {
        setError('Incorrect PIN. Please try again.')
        setPin('')
        return
      }

      // Approve consent request
      const { error: updateError } = await supabase
        .from('consent_requests')
        .update({ 
          status: 'approved',
          approved_at: new Date().toISOString()
        })
        .eq('id', consentRequestId)

      if (updateError) throw updateError

      onSuccess()
      onClose()
      alert('✅ Access granted successfully!')
    } catch (error: any) {
      console.error('PIN verification error:', error)
      setError(`Failed to verify: ${error.message}`)
    } finally {
      setIsVerifying(false)
    }
  }

  return (
    <Modal open={open} onOpenChange={onClose}>
      <ModalContent className="max-w-md">
        <ModalHeader>
          <ModalTitle className="flex items-center gap-2">
            <Lock className="w-5 h-5 text-primary" />
            Enter Smart PIN
          </ModalTitle>
        </ModalHeader>

        <div className="p-6 space-y-4">
          <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-xl p-4">
            <p className="text-sm">
              A doctor has requested access to your medical records. 
              Enter your 6-digit Smart PIN to approve this request.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Smart PIN *</label>
            <Input
              type="password"
              value={pin}
              onChange={(e) => {
                const value = e.target.value.replace(/\D/g, '').slice(0, 6)
                setPin(value)
                setError('')
              }}
              placeholder="••••••"
              maxLength={6}
              className="text-center text-2xl tracking-widest font-mono"
            />
          </div>

          {error && (
            <div className="p-3 bg-error/10 border border-error/30 rounded-lg flex items-start gap-2">
              <AlertCircle className="w-5 h-5 text-error flex-shrink-0" />
              <p className="text-sm text-error">{error}</p>
            </div>
          )}

          <div className="flex gap-3">
            <Button variant="outline" onClick={onClose} className="flex-1">
              Cancel
            </Button>
            <Button 
              onClick={handleVerify}
              disabled={pin.length !== 6 || isVerifying}
              className="flex-1"
            >
              {isVerifying ? 'Verifying...' : 'Verify & Approve'}
            </Button>
          </div>
        </div>
      </ModalContent>
    </Modal>
  )
}
