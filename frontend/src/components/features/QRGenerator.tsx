import React, { useEffect, useRef } from 'react'
import QRCode from 'qrcode'

interface QRGeneratorProps {
  value: string
  size?: number
}

export function QRGenerator({ value, size = 200 }: QRGeneratorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (canvasRef.current) {
      QRCode.toCanvas(canvasRef.current, value, {
        width: size,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF',
        },
      })
    }
  }, [value, size])

  return (
    <div className="inline-block p-4 bg-white rounded-xl shadow-lg">
      <canvas ref={canvasRef} />
      <p className="text-xs text-center text-muted-foreground mt-2">
        Scan to grant access
      </p>
    </div>
  )
}
