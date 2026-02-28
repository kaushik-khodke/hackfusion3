import React, { useState } from 'react'
import { MessageBubble } from './MessageBubble'
import { VoiceInterface } from './VoiceInterface'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { Send } from 'lucide-react'

interface Message {
  id: string
  text: string
  isUser: boolean
  timestamp: string
}

interface ChatInterfaceProps {
  messages: Message[]
  onSendMessage: (message: string) => void
  onVoiceInput: (audioBlob: Blob) => void
  isLoading?: boolean
}

export function ChatInterface({
  messages,
  onSendMessage,
  onVoiceInput,
  isLoading
}: ChatInterfaceProps) {
  const [inputValue, setInputValue] = useState('')
  const [isVoiceMode, setIsVoiceMode] = useState(false)

  const handleSend = () => {
    if (inputValue.trim()) {
      onSendMessage(inputValue)
      setInputValue('')
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg) => (
          <MessageBubble
            key={msg.id}
            message={msg.text}
            isUser={msg.isUser}
            timestamp={msg.timestamp}
          />
        ))}
        {isLoading && (
          <div className="flex gap-2">
            <div className="w-2 h-2 rounded-full bg-primary animate-bounce" />
            <div className="w-2 h-2 rounded-full bg-primary animate-bounce delay-100" />
            <div className="w-2 h-2 rounded-full bg-primary animate-bounce delay-200" />
          </div>
        )}
      </div>

      {/* Input Area */}
      <div className="border-t p-4">
        <div className="flex gap-2 mb-3">
          <Button
            variant={!isVoiceMode ? 'default' : 'outline'}
            size="sm"
            onClick={() => setIsVoiceMode(false)}
          >
            Text
          </Button>
          <Button
            variant={isVoiceMode ? 'default' : 'outline'}
            size="sm"
            onClick={() => setIsVoiceMode(true)}
          >
            Voice
          </Button>
        </div>

        {!isVoiceMode ? (
          <div className="flex gap-2">
            <Input
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSend()}
              placeholder="Type your message..."
              disabled={isLoading}
            />
            <Button onClick={handleSend} disabled={isLoading || !inputValue.trim()}>
              <Send className="w-4 h-4" />
            </Button>
          </div>
        ) : (
          <VoiceInterface onRecordingComplete={onVoiceInput} />
        )}
      </div>
    </div>
  )
}
