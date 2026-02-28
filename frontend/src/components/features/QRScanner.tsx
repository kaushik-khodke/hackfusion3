import React, { useState, useEffect, useRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Camera, XCircle, Scan as ScanIcon } from 'lucide-react'
import { Html5Qrcode } from 'html5-qrcode'

interface QRScannerProps {
  onScan: (data: string) => void
  onError?: (error: string) => void
}

// ✅ Named export to match your Scan.tsx import
export function QRScanner({ onScan, onError }: QRScannerProps) {
  const [scanning, setScanning] = useState(false)
  const [error, setError] = useState('')
  const scannerRef = useRef<Html5Qrcode | null>(null)

  const startCamera = async () => {
    try {
      setError('')
      
      const scanner = new Html5Qrcode('qr-reader')
      
      await scanner.start(
        { facingMode: 'environment' },
        {
          fps: 10,
          qrbox: { width: 250, height: 250 }
        },
        (decodedText) => {
          console.log('QR Code detected:', decodedText)
          onScan(decodedText)
          stopCamera()
        },
        (errorMessage) => {
          // Ignore continuous errors
        }
      )

      scannerRef.current = scanner
      setScanning(true)
    } catch (err: any) {
      console.error('Camera error:', err)
      const errorMsg = `Camera access denied: ${err.message}. Please enable camera permissions.`
      setError(errorMsg)
      if (onError) onError(errorMsg)
      setScanning(false)
    }
  }

  const stopCamera = async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop()
        scannerRef.current.clear()
        scannerRef.current = null
      } catch (err) {
        console.error('Error stopping camera:', err)
      }
    }
    setScanning(false)
  }

  useEffect(() => {
    return () => {
      if (scannerRef.current) {
        scannerRef.current.stop().catch(console.error)
      }
    }
  }, [])

  return (
    <Card className="glass-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ScanIcon className="w-6 h-6" />
          Scan QR Code
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!scanning ? (
          <div className="text-center py-12 border-2 border-dashed border-border rounded-xl">
            <Camera className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground mb-4">
              Click to start camera scanning
            </p>
            <Button onClick={startCamera} size="lg">
              <Camera className="w-4 h-4 mr-2" />
              Start Camera
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="relative bg-black rounded-xl overflow-hidden">
              <div id="qr-reader" />
              
              {/* Scanning overlay */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-64 h-64 border-4 border-primary rounded-xl animate-pulse" />
              </div>
            </div>

            <Button
              onClick={stopCamera}
              variant="destructive"
              className="w-full"
            >
              <XCircle className="w-4 h-4 mr-2" />
              Stop Scanning
            </Button>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="mt-4 p-3 bg-error/10 border border-error/30 rounded-lg text-error text-sm">
            {error}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
