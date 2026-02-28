import React from 'react'
import { cn } from '@/lib/utils'
import { motion } from 'framer-motion'
import { Bot, User } from 'lucide-react'

interface ChatBubbleProps {
  message: string
  isUser: boolean
  timestamp?: string
}

export function ChatBubble({ message, isUser, timestamp }: ChatBubbleProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn('flex gap-3 mb-4', isUser ? 'flex-row-reverse' : 'flex-row')}
    >
      <div
        className={cn(
          'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0',
          isUser ? 'bg-primary text-white' : 'bg-muted'
        )}
      >
        {isUser ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
      </div>
      <div className={cn('flex flex-col', isUser ? 'items-end' : 'items-start')}>
        <div
          className={cn(
            'rounded-2xl px-4 py-2 max-w-[80%]',
            isUser
              ? 'bg-primary text-white rounded-tr-none'
              : 'bg-muted rounded-tl-none'
          )}
        >
          <p className="text-sm whitespace-pre-wrap">{message}</p>
        </div>
        {timestamp && (
          <span className="text-xs text-muted-foreground mt-1">{timestamp}</span>
        )}
      </div>
    </motion.div>
  )
}
