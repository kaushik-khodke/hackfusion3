import React, { useState } from 'react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { QRCodeSVG } from 'qrcode.react'
import { Copy, Check, Download, Lock, AlertCircle, Scan } from 'lucide-react'
import { motion } from 'framer-motion'
import html2canvas from 'html2canvas'

interface SmartHealthCardProps {
  patientData: {
    uhid: string
    full_name: string
    blood_group: string
    date_of_birth: string
    phone: string
    emergency_contact: string
    emergency_name: string
  }
  userId: string
  hasPinSet: boolean
  onSetPin: () => void
}

export function SmartHealthCard({
  patientData,
  userId,
  hasPinSet,
  onSetPin
}: SmartHealthCardProps) {
  const [copied, setCopied] = useState(false)
  const [flipped, setFlipped] = useState(false)
  const [isDownloading, setIsDownloading] = useState(false)

  const qrData = JSON.stringify({
    uhid: patientData.uhid,
    userId: userId,
    type: 'smart_health_card',
    requiresPin: true
  })

  const copyUHID = () => {
    navigator.clipboard.writeText(patientData.uhid)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const downloadCard = async () => {
    setIsDownloading(true)

    try {
      // Get the card element
      const cardElement = document.getElementById('smart-health-card-front')

      if (!cardElement) {
        alert('Card element not found')
        return
      }

      // Temporarily unflip if flipped
      const wasFlipped = flipped
      if (wasFlipped) {
        setFlipped(false)
        await new Promise(resolve => setTimeout(resolve, 100))
      }

      // Capture the card as canvas
      const canvas = await html2canvas(cardElement, {
        scale: 2, // Higher quality
        backgroundColor: null,
        logging: false,
        useCORS: true,
      })

      // Convert to blob
      canvas.toBlob((blob) => {
        if (blob) {
          // Create download link
          const url = URL.createObjectURL(blob)
          const link = document.createElement('a')
          link.href = url
          link.download = `SmartHealthCard_${patientData.uhid}.png`
          document.body.appendChild(link)
          link.click()
          document.body.removeChild(link)
          URL.revokeObjectURL(url)
        }
      })

      // Restore flip state
      if (wasFlipped) {
        await new Promise(resolve => setTimeout(resolve, 100))
        setFlipped(true)
      }

    } catch (error) {
      console.error('Error downloading card:', error)
      alert('Failed to download card. Please try again.')
    } finally {
      setIsDownloading(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* PIN Required Alert */}
      {!hasPinSet && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-warning/10 border border-warning/30 rounded-xl p-4"
        >
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-warning/20 flex items-center justify-center flex-shrink-0">
              <Lock className="w-5 h-5 text-warning" />
            </div>
            <div className="flex-1">
              <h4 className="font-semibold text-sm mb-1">Smart PIN Required</h4>
              <p className="text-xs text-muted-foreground mb-3">
                Set a 6-digit PIN to secure access to your medical records. Doctors will need this PIN to view your records.
              </p>
              <Button onClick={onSetPin} size="sm" variant="outline" className="text-warning border-warning hover:bg-warning/10">
                <Lock className="w-4 h-4 mr-2" />
                Set Smart PIN Now
              </Button>
            </div>
          </div>
        </motion.div>
      )}

      {/* 3D Flip Card */}
      {/* 3D Flip Card */}
      <div
        className="relative cursor-pointer"
        style={{
          width: '100%',
          maxWidth: '600px',
          height: '305px',
          perspective: '1000px',
          margin: '0 auto'
        }}
        onClick={() => setFlipped(!flipped)}
      >

        <motion.div
          className="relative w-full h-full"
          style={{
            transformStyle: 'preserve-3d',
            transition: 'transform 0.6s',
            transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)'
          }}
        >
          {/* FRONT SIDE */}
          <div
            id="smart-health-card-front"
            className="absolute inset-0"
            style={{ backfaceVisibility: 'hidden' }}
          >
            <div className="relative w-full h-full rounded-2xl overflow-hidden shadow-2xl">
              <div className="absolute inset-0 bg-gradient-to-br from-slate-700 via-slate-600 to-slate-800 p-[2px]">
                <div className="relative w-full h-full bg-gradient-to-br from-slate-850 via-slate-900 to-slate-950 rounded-2xl overflow-hidden">
                  {/* Background Pattern */}
                  <div className="absolute inset-0 opacity-5">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-white rounded-full blur-3xl" />
                    <div className="absolute bottom-0 left-0 w-48 h-48 bg-white rounded-full blur-3xl" />
                  </div>

                  <div className="relative z-10 p-6 h-full flex flex-col text-white">
                    {/* Header */}
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shadow-lg">
                          <span className="text-xl">🏥</span>
                        </div>
                        <div>
                          <h3 className="text-sm font-bold tracking-wide">SMART HEALTH CARD</h3>
                          <p className="text-[10px] text-white/50">Government of India</p>
                        </div>
                      </div>
                      <div className="text-xl">🇮🇳</div>
                    </div>

                    {/* Content */}
                    <div className="flex-1 grid grid-cols-[80px_1fr] gap-4">
                      {/* Photo & Blood */}
                      <div className="flex flex-col gap-2">
                        <div className="w-18 h-22 rounded-lg bg-gradient-to-br from-slate-700 to-slate-600 flex items-center justify-center text-2xl font-bold border border-white/20 shadow-inner">
                          {patientData.full_name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                        </div>
                        <div className="px-2 py-1 rounded-md bg-red-600 text-white text-xs font-bold text-center shadow-md">
                          {patientData.blood_group}
                        </div>
                      </div>

                      {/* Details */}
                      <div className="space-y-3">
                        <div>
                          <p className="text-[10px] text-white/50 uppercase tracking-wider">Name</p>
                          <p className="text-base font-bold uppercase tracking-wide truncate">
                            {patientData.full_name}
                          </p>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <p className="text-[10px] text-white/50 uppercase">DOB</p>
                            <p className="text-xs font-semibold">
                              {new Date(patientData.date_of_birth).toLocaleDateString('en-IN', {
                                day: '2-digit',
                                month: 'short',
                                year: 'numeric'
                              })}
                            </p>
                          </div>
                          <div>
                            <p className="text-[10px] text-white/50 uppercase">Phone</p>
                            <p className="text-xs font-semibold">+91 {patientData.phone}</p>
                          </div>
                        </div>

                        <div>
                          <p className="text-[10px] text-white/50 uppercase">Emergency</p>
                          <p className="text-xs font-semibold text-red-400">
                            {patientData.emergency_name}: +91 {patientData.emergency_contact}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* UHID Footer */}
                    <div className="mt-auto pt-4 border-t border-white/10">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-[10px] text-white/50 uppercase tracking-wider mb-1">UHID</p>
                          <div className="flex items-center gap-2">
                            <p className="text-xl font-mono font-bold tracking-widest">
                              {patientData.uhid}
                            </p>
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                copyUHID()
                              }}
                              className="p-1.5 hover:bg-white/10 rounded transition-colors"
                            >
                              {copied ? (
                                <Check className="w-4 h-4 text-green-400" />
                              ) : (
                                <Copy className="w-4 h-4 text-white/60" />
                              )}
                            </button>
                          </div>
                        </div>
                        <div className="text-right">
                          {hasPinSet ? (
                            <div className="flex items-center gap-1 text-green-400">
                              <Lock className="w-4 h-4" />
                              <span className="text-[10px] font-semibold">Secured</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1 text-yellow-400">
                              <AlertCircle className="w-4 h-4" />
                              <span className="text-[10px] font-semibold">No PIN</span>
                            </div>
                          )}
                          <p className="text-[9px] text-white/30 mt-1">Click to flip</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* BACK SIDE - QR Code */}
          <div
            className="absolute inset-0"
            style={{
              backfaceVisibility: 'hidden',
              transform: 'rotateY(180deg)'
            }}
          >
            <div className="relative w-full h-full rounded-2xl overflow-hidden shadow-2xl bg-gradient-to-br from-slate-800 via-slate-900 to-slate-950">
              <div className="absolute inset-0 opacity-5">
                <div className="absolute inset-0" style={{
                  backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%23ffffff' fill-opacity='0.05'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4z'/%3E%3C/g%3E%3C/svg%3E")`
                }} />
              </div>

              <div className="relative z-10 h-full flex flex-col items-center justify-center p-6 text-white">
                <div className="bg-white p-5 rounded-2xl shadow-2xl mb-4">
                  <QRCodeSVG
                    value={qrData}
                    size={180}
                    level="H"
                    includeMargin={false}
                  />
                </div>

                <div className="text-center space-y-2">


                  {hasPinSet ? (
                    <div className="bg-green-500/10 border border-green-500/30 rounded-lg px-4 py-2">
                      <p className="text-sm font-semibold text-green-400 flex items-center gap-2 justify-center">
                        <Lock className="w-4 h-4" />
                        PIN Protected
                      </p>
                      <p className="text-xs text-white/60 mt-1">
                        Doctor will need your 6-digit PIN
                      </p>
                    </div>
                  ) : (
                    <div className="bg-warning/10 border border-warning/30 rounded-lg px-4 py-2">
                      <p className="text-sm font-semibold text-warning flex items-center gap-2 justify-center">
                        <AlertCircle className="w-4 h-4" />
                        No PIN Set
                      </p>
                      <p className="text-xs text-white/60 mt-1">
                        Set a PIN to secure access
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Action Buttons */}
      <div className="grid grid-cols-2 gap-3">
        {!hasPinSet && (
          <Button
            onClick={onSetPin}
            variant="default"
            className="col-span-2"
          >
            <Lock className="w-4 h-4 mr-2" />
            Set Smart PIN
          </Button>
        )}
        <Button
          variant="outline"
          className="w-full"
          onClick={(e) => {
            e.stopPropagation()
            downloadCard()
          }}
          disabled={isDownloading}
        >
          <Download className="w-4 h-4 mr-2" />
          {isDownloading ? 'Downloading...' : 'Download'}
        </Button>
        <Button
          variant="outline"
          className="w-full"
          onClick={(e) => {
            e.stopPropagation()
            setFlipped(!flipped)
          }}
        >
          <Scan className="w-4 h-4 mr-2" />
          {flipped ? 'Show Front' : 'Show QR'}
        </Button>
      </div>
    </div>
  )
}
