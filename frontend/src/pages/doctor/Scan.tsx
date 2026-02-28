import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { QRScanner } from '@/components/features/QRScanner'
import { supabase, callEdgeFunction, requestConsentRPC } from '@/lib/supabase'
import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import { QrCode, FileText, AlertCircle } from 'lucide-react'

export function Scan() {
  const { t } = useTranslation()
  const navigate = useNavigate()

  const [healthId, setHealthId] = useState('')
  const [accessType, setAccessType] = useState<'read_only' | 'read_write'>('read_only')
  const [reason, setReason] = useState('')
  const [expiryHours, setExpiryHours] = useState(24)
  const [isRequesting, setIsRequesting] = useState(false)
  const [scanMode, setScanMode] = useState<'camera' | 'manual'>('camera')
  const [error, setError] = useState('')

  // Auth check
  useEffect(() => {
    const checkAuth = async () => {
      const { data } = await supabase.auth.getSession()

      console.log('🔐 Auth Status:', {
        hasSession: !!data.session,
        user: data.session?.user?.email,
        userId: data.session?.user?.id
      })

      if (!data.session) {
        setError('Not logged in. Please log in to continue.')
      }
    }

    checkAuth()
  }, [])

  // Handle QR scan
  const handleQRScan = (data: string) => {
    try {
      const parsed = JSON.parse(data)
      const id = parsed.uhid || parsed.health_id || parsed.healthId || data
      setHealthId(id)
      setScanMode('manual')
      setError('')
      console.log('✅ QR Scanned:', id)
    } catch {
      setHealthId(data)
      setScanMode('manual')
      console.log('✅ QR Scanned (plain):', data)
    }
  }

  // Submit request
  const handleRequestAccess = async () => {
    if (!healthId || !reason) {
      setError('Please fill all required fields')
      return
    }

    if (reason.length < 10) {
      setError('Reason must be at least 10 characters')
      return
    }

    setIsRequesting(true)
    setError('')

    try {
      console.log('📤 Sending request:', {
        uhid: healthId,
        accessType,
        reason,
        expiryHours
      })

      // ✅ Map UI value -> DB enum value (only if your enum values are READ_ONLY / READ_WRITE)
      const enumAccessType =
        accessType === 'read_only' ? 'read' : 'read_write'

      const response = await requestConsentRPC({
        uhid: healthId,
        accessType: enumAccessType as any, // or change the type in requestConsentRPC to string
        reason,
        expiryHours,
      })


      console.log('📥 Response:', response)

      if (response.success) {
        alert('✅ Access request sent successfully!\n\nPatient will receive a notification and must enter their Smart PIN to approve.')
        navigate('/doctor/dashboard')
      } else {
        setError(response.error || 'Failed to send request')
      }
    } catch (error: any) {
      console.error('❌ Request error:', error)

      if (error.message?.includes('Not authenticated')) {
        setError('Session expired. Please log out and log in again.')
      } else if (error.message?.includes('Rate limit')) {
        setError('Too many requests. Please wait a minute before trying again.')
      } else if (error.message?.includes('Only doctors')) {
        setError('Only registered doctors can request access.')
      } else {
        setError(error.message || 'Network error. Please try again.')
      }
    } finally {
      setIsRequesting(false)
    }
  }

  return (
    <div className="min-h-screen relative overflow-hidden font-sans">
      <div className="fixed inset-0 -z-10 bg-background">
        <div className="absolute inset-0 bg-grid-pattern opacity-[0.2]" />
        <div className="absolute inset-0 mask-radial-faded bg-background/0" />
      </div>

      <div className="container mx-auto px-4 py-8">
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
          <h1 className="text-4xl font-bold mb-2 font-heading text-primary">
            {t('doctor.request_access')}
          </h1>
          <p className="text-muted-foreground">
            {t('doctor.scan_qr')} or enter details manually
          </p>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

          {/* LEFT */}
          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 }}>
            {scanMode === 'camera' ? (
              <div className="space-y-4">
                <div className="relative overflow-hidden rounded-3xl border-2 border-primary/20 shadow-2xl shadow-primary/10">
                  <QRScanner onScan={handleQRScan} onError={(err) => setError(err)} />
                  <div className="absolute inset-0 pointer-events-none border-[3px] border-primary/40 rounded-3xl" />
                </div>

                <Card className="glass-card">
                  <CardContent className="p-4">
                    <p className="text-sm text-center text-muted-foreground mb-3">
                      Or enter Health ID manually
                    </p>
                    <Button onClick={() => setScanMode('manual')} variant="outline" className="w-full">
                      <FileText className="w-4 h-4 mr-2" />
                      {t('doctor.manual_entry')}
                    </Button>
                  </CardContent>
                </Card>
              </div>
            ) : (
              <Card className="glass-card">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <FileText className="w-6 h-6 text-primary" />
                      {t('doctor.manual_entry')}
                    </span>
                    <Button onClick={() => setScanMode('camera')} variant="ghost" size="sm">
                      <QrCode className="w-4 h-4 mr-2" />
                      {t('doctor.scan_qr')}
                    </Button>
                  </CardTitle>
                </CardHeader>

                <CardContent>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium mb-2">
                        {t('doctor.enter_uhid')} *
                      </label>
                      <Input
                        value={healthId}
                        onChange={(e) => setHealthId(e.target.value.toUpperCase())}
                        placeholder="e.g. 1234567890"
                        maxLength={10}
                        className="font-mono tracking-widest text-center text-lg h-12"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </motion.div>

          {/* RIGHT */}
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 }}>
            <Card className="glass-card border-l-4 border-l-primary/50">
              <CardHeader>
                <CardTitle>{t('doctor.request_details')}</CardTitle>
              </CardHeader>

              <CardContent className="space-y-6">
                {/* Expiry */}
                <div>
                  <label htmlFor="expiryHours" className="block text-sm font-medium mb-2">
                    Access Duration *
                  </label>
                  <select
                    id="expiryHours"
                    value={expiryHours}
                    onChange={(e) => setExpiryHours(Number(e.target.value))}
                    className="w-full rounded-lg border border-input bg-background/50 px-3 py-3 focus:ring-2 ring-primary/20 transition-all"
                  >
                    <option value={1}>1 Hour</option>
                    <option value={24}>24 Hours</option>
                    <option value={168}>7 Days</option>
                    <option value={720}>30 Days</option>
                  </select>
                </div>

                {/* Reason */}
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Reason for Access *
                  </label>
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Describe why you need access..."
                    className="w-full rounded-lg border border-input bg-background/50 px-3 py-2 min-h-[120px] resize-none focus:ring-2 ring-primary/20 transition-all"
                    maxLength={500}
                  />
                </div>

                {error && (
                  <motion.div initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} className="p-3 bg-destructive/10 border border-destructive/30 rounded-lg flex items-start gap-2">
                    <AlertCircle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-destructive font-medium">{error}</p>
                  </motion.div>
                )}

                <Button
                  onClick={handleRequestAccess}
                  disabled={!healthId || !reason || isRequesting}
                  className="w-full btn-gradient shadow-lg shadow-primary/25"
                  size="lg"
                >
                  {isRequesting ? 'Sending Request...' : t('doctor.request_access')}
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </div>
    </div>
  )
}
