import { useState, useRef, useEffect } from 'react'
import { Card, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { useTranslation } from 'react-i18next'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Send,
  Mic,
  Bot,
  User,
  Sparkles,
  Leaf,
  Microscope,
  Lightbulb,
  Flame,
  Volume2,
  StopCircle,
  Heart
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useAuth } from '@/hooks/useAuth'
import { API_BASE_URL } from '@/lib/api'

// Web Speech API types
declare global {
  interface Window {
    SpeechRecognition: any
    webkitSpeechRecognition: any
  }
}

interface Message {
  id: string
  text: string
  isUser: boolean
  timestamp: string
}

// Waveform visualization component
function VoiceWaveform() {
  return (
    <div className="flex items-center gap-1 h-12">
      {[...Array(5)].map((_, i) => (
        <motion.div
          key={i}
          className="w-1 bg-gradient-to-t from-primary/60 to-primary rounded-full"
          animate={{
            height: ['20%', `${40 + Math.random() * 60}%`, '20%'],
          }}
          transition={{
            duration: 0.8 + Math.random() * 0.4,
            repeat: Infinity,
            ease: 'easeInOut',
            delay: i * 0.1,
          }}
        />
      ))}
    </div>
  )
}

export function Chat() {
  const { i18n } = useTranslation()
  const { user } = useAuth()

  const [messages, setMessages] = useState<Message[]>([])
  const [inputValue, setInputValue] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [useRecords, setUseRecords] = useState(false)

  // Voice states
  const [isListening, setIsListening] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [currentAudio, setCurrentAudio] = useState<HTMLAudioElement | null>(null)
  const [voiceError, setVoiceError] = useState<string | null>(null)

  const recognitionRef = useRef<any>(null)
  const shouldListenRef = useRef(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  // Voice Recognition with proper error handling
  const startListening = () => {
    setVoiceError(null)
    if (!shouldListenRef.current) {
      setInputValue('')
    }

    // Check browser support
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      setVoiceError('Voice input not supported. Please use Chrome or Edge.')
      return
    }

    shouldListenRef.current = true
    setIsListening(true)

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    const recognition = new SpeechRecognition()

    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = i18n.language === 'hi' ? 'hi-IN' : i18n.language === 'mr' ? 'mr-IN' : 'en-US'

    recognition.onstart = () => {
      console.log('🎤 Voice recognition started')
    }

    recognition.onresult = (event: any) => {
      let finalTranscript = ''
      let interimTranscript = ''

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript
        } else {
          interimTranscript += event.results[i][0].transcript
        }
      }

      const currentText = finalTranscript || interimTranscript
      if (currentText) {
        setInputValue(currentText)
      }
    }

    recognition.onerror = (event: any) => {
      console.warn('Speech error:', event.error)

      if (event.error === 'not-allowed') {
        shouldListenRef.current = false
        setIsListening(false)
        setVoiceError('Microphone access denied. Please allow microphone access.')
      } else if (event.error === 'no-speech') {
        // Continue listening, no need to stop
        return
      } else if (event.error === 'network') {
        shouldListenRef.current = false
        setIsListening(false)
        setVoiceError('Network error. Please check your connection and try again.')
      } else {
        // For any other error, stop listening but allow user to retry
        shouldListenRef.current = false
        setIsListening(false)
        setVoiceError(`Voice error: ${event.error}. Please try again.`)
      }
    }

    recognition.onend = () => {
      if (shouldListenRef.current) {
        console.log('🔄 Restarting voice recognition...')
        setTimeout(() => {
          if (shouldListenRef.current) {
            try {
              recognition.start()
            } catch (e) {
              console.error('Failed to restart recognition', e)
            }
          }
        }, 100)
      } else {
        setIsListening(false)
      }
    }

    recognitionRef.current = recognition
    try {
      recognition.start()
    } catch (e) {
      console.error('Failed to start recognition', e)
      setVoiceError('Could not start voice recognition')
    }
  }

  const stopListening = () => {
    shouldListenRef.current = false
    if (recognitionRef.current) {
      recognitionRef.current.stop()
      setIsListening(false)
    }
  }

  const playBase64Audio = (base64Data: string) => {
    try {
      if (currentAudio) {
        currentAudio.pause();
        currentAudio.src = "";
      }

      const audio = new Audio(`data:audio/mp3;base64,${base64Data}`);
      setCurrentAudio(audio);

      audio.onplay = () => setIsSpeaking(true);
      audio.onended = () => {
        setIsSpeaking(false);
        setCurrentAudio(null);
      };
      audio.onerror = (e) => {
        console.error("Audio playback error:", e);
        setIsSpeaking(false);
        setCurrentAudio(null);
      };

      audio.play();
    } catch (error) {
      console.error("Failed to play base64 audio:", error);
      setIsSpeaking(false);
    }
  };

  const stopSpeaking = () => {
    if (currentAudio) {
      currentAudio.pause();
      currentAudio.src = "";
      setCurrentAudio(null);
    }
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setIsSpeaking(false);
  };

  const speakText = (text: string, base64Audio?: string) => {
    if (base64Audio) {
      playBase64Audio(base64Audio);
      return;
    }

    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel()

      const cleanText = text
        .replace(/###/g, '')
        .replace(/\*\*/g, '')
        .replace(/\*/g, '')
        .replace(/[-]/g, '')
        .replace(/[\u{1F600}-\u{1F64F}]/gu, '')
        .replace(/[\u{1F300}-\u{1F5FF}]/gu, '')
        .replace(/[\u{1F680}-\u{1F6FF}]/gu, '')
        .replace(/[\u{1F1E0}-\u{1F1FF}]/gu, '')
        .replace(/[\u{2600}-\u{26FF}]/gu, '')
        .replace(/[\u{2700}-\u{27BF}]/gu, '')
        .replace(/[\u{FE00}-\u{FE0F}]/gu, '')
        .replace(/[\u{1F900}-\u{1F9FF}]/gu, '')
        .replace(/[\u{1FA70}-\u{1FAFF}]/gu, '')
        .trim()

      const utterance = new SpeechSynthesisUtterance(cleanText)
      utterance.lang = i18n.language === 'hi' ? 'hi-IN' : i18n.language === 'mr' ? 'mr-IN' : 'en-US'

      utterance.rate = 0.9
      utterance.onstart = () => setIsSpeaking(true)
      utterance.onend = () => setIsSpeaking(false)
      utterance.onerror = () => setIsSpeaking(false)

      window.speechSynthesis.speak(utterance)
    }
  }

  // Chat logic
  const addMessage = (text: string, isUser: boolean) => {
    const newMessage: Message = {
      id: Date.now().toString(),
      text,
      isUser,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    }
    setMessages(prev => [...prev, newMessage])
  }

  const handleSendMessage = async (overrideText?: string) => {
    stopListening()
    const textToSend = overrideText || inputValue

    if (!textToSend.trim()) return

    console.log('📤 Sending message with use_records:', useRecords)

    addMessage(textToSend, true)
    setInputValue('')
    setIsLoading(true)

    try {
      const response = await fetch(`${API_BASE_URL}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: textToSend,
          language: i18n.language || 'en',
          user_id: user?.id,
          use_records: useRecords,
          use_voice: true, // Always request high-quality audio
        }),
      })

      const result = await response.json()

      if (result.success) {
        addMessage(result.response, false)
        speakText(result.response, result.audio_data)
      } else {
        addMessage(`⚠️ ${result.error}`, false)
      }
    } catch (error) {
      addMessage('❌ Connection Error: Ensure the Python AI server is running.', false)
    } finally {
      setIsLoading(false)
    }
  }

  const quickActions = [
    { text: 'Severe Headache', icon: '🤕' },
    { text: 'Stomach Pain', icon: '🤢' },
    { text: 'High Fever', icon: '🌡️' },
    { text: 'Anxiety Relief', icon: '😌' },
  ]

  // Markdown components
  const MarkdownComponents = {
    h3: ({ node, ...props }: any) => {
      const text = props.children[0]?.toString().toLowerCase() || ''
      let icon = <Sparkles className="w-5 h-5 text-primary" />
      let colorClass = 'text-primary border-primary/20'

      if (text.includes('cause')) {
        icon = <Flame className="w-5 h-5 text-red-500" />
        colorClass = 'text-red-600 border-red-200'
      } else if (text.includes('scientific')) {
        icon = <Microscope className="w-5 h-5 text-blue-500" />
        colorClass = 'text-blue-600 border-blue-200'
      } else if (text.includes('ayurvedic')) {
        icon = <Leaf className="w-5 h-5 text-green-600" />
        colorClass = 'text-green-700 border-green-200'
      } else if (text.includes('golden')) {
        icon = <Lightbulb className="w-5 h-5 text-amber-500" />
        colorClass = 'text-amber-600 border-amber-200'
      }

      return (
        <div className={`flex items-center gap-2 mt-6 mb-3 pb-2 border-b ${colorClass} font-bold text-lg`}>
          {icon} <h3 {...props} />
        </div>
      )
    },
    ul: ({ node, ...props }: any) => <ul className="list-disc pl-5 space-y-1 mb-4" {...props} />,
    strong: ({ node, ...props }: any) => <span className="font-semibold bg-primary/10 px-1 rounded" {...props} />,
    p: ({ node, ...props }: any) => <p className="mb-3 leading-relaxed" {...props} />,
  }

  return (
    <div className="min-h-screen flex flex-col items-center p-4 md:p-6">
      {/* Floating AI Avatar Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-4xl mb-6 flex items-center justify-between"
      >
        <div className="flex items-center gap-4">
          <motion.div
            animate={{
              scale: isListening ? [1, 1.1, 1] : isSpeaking ? [1, 1.05, 1] : 1,
            }}
            transition={{
              duration: 1.5,
              repeat: isListening || isSpeaking ? Infinity : 0,
            }}
            className="relative"
          >
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary to-blue-600 flex items-center justify-center shadow-lg shadow-primary/30">
              <Heart className="w-7 h-7 text-white" fill="white" />
            </div>
            {(isListening || isSpeaking) && (
              <div className="absolute inset-0 rounded-2xl bg-primary/30 animate-ping" />
            )}
          </motion.div>
          <div>
            <h1 className="text-2xl font-bold">Holistic Wellness AI</h1>
            <p className="text-sm text-muted-foreground">Voice-Enabled Health Companion</p>
          </div>
        </div>
        {isSpeaking && (
          <Button
            variant="outline"
            size="sm"
            onClick={stopSpeaking}
            className="animate-pulse border-red-200 text-red-600 hover:bg-red-50 gap-2"
          >
            <StopCircle className="w-4 h-4" /> Stop
          </Button>
        )}
      </motion.div>

      {/* Chat Card */}
      <Card className="w-full max-w-4xl h-[75vh] flex flex-col shadow-2xl rounded-3xl overflow-hidden relative">
        {/* Voice Listening Overlay */}
        <AnimatePresence>
          {isListening && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-50 glass-card backdrop-blur-xl flex flex-col items-center justify-center"
            >
              <VoiceWaveform />
              <h3 className="text-2xl font-bold mt-6 mb-2">Listening...</h3>
              <p className="text-muted-foreground mb-4">Speak your symptoms clearly</p>
              {voiceError && (
                <p className="text-red-500 bg-red-50 px-4 py-2 rounded-lg text-sm mb-4">{voiceError}</p>
              )}
              {inputValue && (
                <div className="glass-card max-w-md px-6 py-3 rounded-xl mb-6">
                  <p className="text-sm italic">&quot;{inputValue}&quot;</p>
                </div>
              )}
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => {
                    stopListening()
                    setInputValue('')
                  }}
                  className="rounded-full px-8 border-red-200 text-red-600 hover:bg-red-50"
                >
                  Cancel
                </Button>
                <Button
                  variant="default"
                  onClick={() => handleSendMessage(inputValue)}
                  disabled={!inputValue.trim()}
                  className="rounded-full px-8"
                >
                  Send Message
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Messages Area */}
        <CardContent className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4">
          {messages.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-center p-8">
              <motion.div
                animate={{ rotate: [0, 10, -10, 0] }}
                transition={{ duration: 4, repeat: Infinity }}
                className="w-20 h-20 bg-gradient-to-br from-emerald-400 to-teal-500 rounded-full flex items-center justify-center mb-6 shadow-lg"
              >
                <Sparkles className="w-10 h-10 text-white" />
              </motion.div>
              <h2 className="text-xl font-semibold mb-6">How can I help you today?</h2>
              <div className="grid grid-cols-2 gap-3 w-full max-w-md">
                {quickActions.map((action, i) => (
                  <motion.button
                    key={i}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: i * 0.1 }}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => handleSendMessage(action.text)}
                    className="glass-card p-4 rounded-xl hover:border-primary/40 transition-all text-left"
                  >
                    <div className="text-2xl mb-1">{action.icon}</div>
                    <div className="text-sm font-medium">{action.text}</div>
                  </motion.button>
                ))}
              </div>
            </div>
          )}

          <AnimatePresence>
            {messages.map((m) => (
              <motion.div
                key={m.id}
                initial={{ opacity: 0, y: 20, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                className={`flex w-full gap-3 ${m.isUser ? 'justify-end' : 'justify-start'}`}
              >
                {!m.isUser && (
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center flex-shrink-0 mt-1 shadow-sm">
                    <Bot className="w-4 h-4 text-white" />
                  </div>
                )}

                <div
                  className={`max-w-[85%] md:max-w-[75%] rounded-2xl px-6 py-4 shadow-xl relative group ${m.isUser
                    ? 'bg-gradient-to-br from-primary to-blue-700 text-white rounded-br-sm'
                    : 'bg-white/90 backdrop-blur-md border border-white/50 rounded-bl-sm shadow-indigo-100/50'
                    }`}
                >
                  {m.isUser ? (
                    <p className="leading-relaxed">{m.text}</p>
                  ) : (
                    <div>
                      <div className="prose prose-sm max-w-none">
                        <ReactMarkdown remarkPlugins={[remarkGfm]} components={MarkdownComponents}>
                          {m.text}
                        </ReactMarkdown>
                      </div>
                      <button
                        onClick={() => speakText(m.text)}
                        className="absolute -right-10 top-2 p-2 rounded-full hover:bg-primary/10 text-primary opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Read Aloud"
                      >
                        <Volume2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                  <p className={`text-[10px] mt-2 ${m.isUser ? 'text-white/70' : 'text-muted-foreground'}`}>
                    {m.timestamp}
                  </p>
                </div>

                {m.isUser && (
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-slate-600 to-slate-800 flex items-center justify-center flex-shrink-0 mt-1 shadow-sm">
                    <User className="w-4 h-4 text-white" />
                  </div>
                )}
              </motion.div>
            ))}
          </AnimatePresence>

          {/* Typing Indicator */}
          {isLoading && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex gap-3"
            >
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center shadow-sm">
                <Bot className="w-4 h-4 text-white" />
              </div>
              <div className="glass-card rounded-2xl px-5 py-4 flex items-center gap-2">
                <div className="flex gap-1">
                  {[...Array(3)].map((_, i) => (
                    <motion.div
                      key={i}
                      className="w-2 h-2 bg-primary rounded-full"
                      animate={{ y: ['0%', '-50%', '0%'] }}
                      transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.1 }}
                    />
                  ))}
                </div>
                <span className="text-xs text-muted-foreground ml-2">Analyzing...</span>
              </div>
            </motion.div>
          )}
          <div ref={messagesEndRef} />
        </CardContent>

        {/* Input Bar */}
        <div className="p-4 glass-card border-t border-white/20">
          <div className="flex gap-2 relative">
            <Button
              variant="outline"
              onClick={() => (isListening ? stopListening() : startListening())}
              className={`rounded-full w-12 h-12 p-0 flex-shrink-0 transition-all ${isListening
                ? 'bg-red-500 border-red-600 text-white hover:bg-red-600 animate-pulse'
                : 'hover:border-primary hover:bg-primary/10 hover:text-primary'
                }`}
            >
              {isListening ? <StopCircle className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
            </Button>

            <Input
              value={inputValue}
              onChange={e => setInputValue(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSendMessage()}
              placeholder="Type or tap the mic to speak..."
              disabled={isLoading}
              className="pr-12 h-12 rounded-full glass-card border-white/30 focus:border-primary"
            />

            <Button
              onClick={() => handleSendMessage()}
              disabled={isLoading || !inputValue.trim()}
              className="absolute right-1 top-1 h-10 w-10 rounded-full p-0 bg-gradient-to-r from-primary to-blue-600 hover:shadow-lg hover:shadow-primary/30 transition-all"
            >
              <Send className="w-4 h-4 text-white" />
            </Button>
          </div>

          {/* Permission Toggle */}
          <div className="mt-3 flex justify-center">
            <button
              onClick={() => setUseRecords(!useRecords)}
              className={`flex items-center gap-2 px-4 py-2 rounded-full transition-all ${useRecords
                ? 'bg-emerald-500/20 border border-emerald-500/30 text-emerald-700'
                : 'glass-card border-white/20 text-muted-foreground hover:border-primary/30'
                }`}
            >
              <div className={`w-2 h-2 rounded-full ${useRecords ? 'bg-emerald-500' : 'bg-gray-300'}`} />
              <span className="text-xs font-medium">
                {useRecords ? 'Reading Medical Records' : 'Records Access Off'}
              </span>
            </button>
          </div>
        </div>
      </Card>
    </div >
  )
}