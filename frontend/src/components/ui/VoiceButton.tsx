import React, { useState } from 'react'
import { Mic, MicOff } from 'lucide-react'
import { cn } from '@/lib/utils'
import { motion } from 'framer-motion'

interface VoiceButtonProps {
  onRecordingComplete: (audioBlob: Blob) => void
  isProcessing?: boolean
}

export function VoiceButton({ onRecordingComplete, isProcessing }: VoiceButtonProps) {
  const [isRecording, setIsRecording] = useState(false)
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null)

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      const chunks: Blob[] = []

      recorder.ondataavailable = (e) => chunks.push(e.data)
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'audio/webm' })
        onRecordingComplete(blob)
        stream.getTracks().forEach(track => track.stop())
      }

      recorder.start()
      setMediaRecorder(recorder)
      setIsRecording(true)
    } catch (error) {
      console.error('Error accessing microphone:', error)
      alert('Unable to access microphone. Please check permissions.')
    }
  }

  const stopRecording = () => {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop()
      setIsRecording(false)
      setMediaRecorder(null)
    }
  }

  return (
    <motion.button
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      onMouseDown={startRecording}
      onMouseUp={stopRecording}
      onTouchStart={startRecording}
      onTouchEnd={stopRecording}
      disabled={isProcessing}
      className={cn(
        'w-16 h-16 rounded-full flex items-center justify-center transition-all shadow-lg',
        isRecording
          ? 'bg-error text-white pulse-glow'
          : 'bg-primary text-white hover:bg-primary-hover'
      )}
    >
      {isRecording ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
      {isRecording && (
        <motion.div
          className="absolute inset-0 rounded-full border-4 border-error"
          animate={{ scale: [1, 1.3, 1], opacity: [1, 0, 1] }}
          transition={{ duration: 1.5, repeat: Infinity }}
        />
      )}
    </motion.button>
  )
}
