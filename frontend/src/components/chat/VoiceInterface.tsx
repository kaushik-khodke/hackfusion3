import React from 'react'
import { VoiceButton } from '@/components/ui/VoiceButton'
import { motion } from 'framer-motion'

interface VoiceInterfaceProps {
  onRecordingComplete: (audioBlob: Blob) => void
  isProcessing?: boolean
}

export function VoiceInterface({ onRecordingComplete, isProcessing }: VoiceInterfaceProps) {
  return (
    <div className="flex flex-col items-center gap-4 py-6">
      <motion.div
        animate={{
          scale: isProcessing ? [1, 1.1, 1] : 1,
        }}
        transition={{
          duration: 1.5,
          repeat: isProcessing ? Infinity : 0,
        }}
      >
        <VoiceButton
          onRecordingComplete={onRecordingComplete}
          isProcessing={isProcessing}
        />
      </motion.div>

      <p className="text-sm text-muted-foreground text-center">
        {isProcessing ? 'Processing your voice...' : 'Press & hold to speak'}
      </p>

      {/* Waveform animation (optional) */}
      {isProcessing && (
        <div className="flex gap-1 h-8 items-end">
          {[...Array(5)].map((_, i) => (
            <motion.div
              key={i}
              className="w-1 bg-primary rounded-full"
              animate={{
                height: ['20%', '100%', '20%'],
              }}
              transition={{
                duration: 0.8,
                repeat: Infinity,
                delay: i * 0.1,
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}
