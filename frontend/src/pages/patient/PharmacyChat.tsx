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
    StopCircle,
    ShieldCheck,
    Pill
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useAuth } from '@/hooks/useAuth'
import { API_BASE_URL } from '@/lib/api'

interface Message {
    id: string
    text: string
    isUser: boolean
    timestamp: string
}

function VoiceWaveform() {
    return (
        <div className="flex items-center gap-1 h-12">
            {[...Array(5)].map((_, i) => (
                <motion.div
                    key={i}
                    className="w-1 bg-gradient-to-t from-indigo-500 to-blue-500 rounded-full"
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

export function PharmacyChat() {
    const { i18n } = useTranslation()
    const { user } = useAuth()

    const [messages, setMessages] = useState<Message[]>([])
    const [inputValue, setInputValue] = useState('')
    const [isLoading, setIsLoading] = useState(false)

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

    const startListening = () => {
        setVoiceError(null)
        if (!shouldListenRef.current) setInputValue('')
        if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
            setVoiceError('Voice input not supported.')
            return
        }

        shouldListenRef.current = true
        setIsListening(true)
        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
        const recognition = new SpeechRecognition()
        recognition.continuous = true
        recognition.interimResults = true
        recognition.lang = i18n.language === 'hi' ? 'hi-IN' : i18n.language === 'mr' ? 'mr-IN' : 'en-US'

        recognition.onresult = (event: any) => {
            let currentText = ''
            for (let i = event.resultIndex; i < event.results.length; ++i) {
                currentText += event.results[i][0].transcript
            }
            if (currentText) setInputValue(currentText)
        }

        recognition.onerror = (event: any) => {
            setIsListening(false)
            setVoiceError(`Voice error: ${event.error}`)
        }

        recognition.onend = () => {
            if (shouldListenRef.current) {
                setTimeout(() => recognition.start(), 100)
            } else {
                setIsListening(false)
            }
        }

        recognitionRef.current = recognition
        recognition.start()
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
            const cleanText = text.replace(/[#*_-]/g, '').trim()
            const utterance = new SpeechSynthesisUtterance(cleanText)
            utterance.lang = i18n.language === 'hi' ? 'hi-IN' : i18n.language === 'mr' ? 'mr-IN' : 'en-US'
            utterance.onstart = () => setIsSpeaking(true)
            utterance.onend = () => setIsSpeaking(false)
            window.speechSynthesis.speak(utterance)
        }
    }

    const handleSendMessage = async (overrideText?: string) => {
        stopListening()
        const textToSend = overrideText || inputValue
        if (!textToSend.trim()) return

        const newMessage = {
            id: Date.now().toString(),
            text: textToSend,
            isUser: true,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        }
        setMessages(prev => [...prev, newMessage])
        setInputValue('')
        setIsLoading(true)

        try {
            const response = await fetch(`${API_BASE_URL}/pharmacy/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: textToSend,
                    patient_id: user?.id,
                    language: i18n.language || 'en',
                    use_voice: true, // Always request high-quality audio
                }),
            })
            const result = await response.json()
            if (result.success) {
                const aiMessage = {
                    id: (Date.now() + 1).toString(),
                    text: result.response,
                    isUser: false,
                    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                }
                setMessages(prev => [...prev, aiMessage])
                speakText(result.response, result.audio_data)
            } else {
                setMessages(prev => [...prev, {
                    id: Date.now().toString(),
                    text: `⚠️ ${result.error || "I'm having trouble connecting to pharmacy records. Please try again."}`,
                    isUser: false,
                    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                }])
            }
        } catch (error) {
            setMessages(prev => [...prev, {
                id: Date.now().toString(),
                text: "❌ Service connection failed. Please ensure the backend is running.",
                isUser: false,
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            }])
        } finally {
            setIsLoading(false)
        }
    }

    const quickActions = [
        { text: 'Medicines for Cough', icon: '💊' },
        { text: 'Check Paracetamol Stock', icon: '📦' },
        { text: 'Refill My Meds', icon: '🔄' },
        { text: 'Side Effects Query', icon: '❓' },
    ]

    const MarkdownComponents = {
        h3: ({ node, ...props }: any) => (
            <div className="flex items-center gap-2 mt-4 mb-2 font-bold text-lg text-indigo-600 border-b border-indigo-100 pb-1">
                <Pill className="w-5 h-5" /> <h3 {...props} />
            </div>
        ),
        ul: ({ node, ...props }: any) => <ul className="list-disc pl-5 space-y-1 mb-4" {...props} />,
        strong: ({ node, ...props }: any) => <span className="font-semibold text-indigo-700 bg-indigo-50 px-1 rounded" {...props} />,
    }

    return (
        <div className="min-h-screen flex flex-col items-center p-4 md:p-6 bg-slate-50/50">
            <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                className="w-full max-w-4xl mb-6 flex items-center justify-between"
            >
                <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-600 to-blue-500 flex items-center justify-center shadow-lg">
                        <ShieldCheck className="w-7 h-7 text-white" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-blue-600">Expert Pharmacy Agent</h1>
                        <p className="text-sm text-muted-foreground">Clinical Pharmacist AI Companion</p>
                    </div>
                </div>
                {isSpeaking && (
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={stopSpeaking}
                        className="animate-pulse border-red-200 text-red-600 hover:bg-red-50 gap-2 rounded-full"
                    >
                        <StopCircle className="w-4 h-4" /> Stop
                    </Button>
                )}
            </motion.div>

            <Card className="w-full max-w-4xl h-[75vh] flex flex-col shadow-2xl shadow-indigo-100/50 rounded-[2rem] overflow-hidden border-indigo-100/50 bg-white/80 backdrop-blur-xl relative">
                <AnimatePresence>
                    {isListening && (
                        <motion.div className="absolute inset-0 z-50 bg-white/90 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center">
                            <VoiceWaveform />
                            <h3 className="text-2xl font-bold mt-6">Listening...</h3>
                            <p className="text-muted-foreground mt-2">Describe your symptoms or ask about medicines</p>
                            {voiceError && <p className="text-red-500 mb-4">{voiceError}</p>}
                            <div className="mt-8 flex gap-3">
                                <Button variant="outline" onClick={stopListening} className="rounded-full px-8">Stop</Button>
                                <Button onClick={() => handleSendMessage()} className="rounded-full px-8 bg-indigo-600">Analyze</Button>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                <CardContent className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
                    {messages.length === 0 && (
                        <div className="h-full flex flex-col items-center justify-center text-center">
                            <div className="w-20 h-20 bg-indigo-50 rounded-full flex items-center justify-center mb-6">
                                <Pill className="w-10 h-10 text-indigo-500" />
                            </div>
                            <h2 className="text-xl font-semibold text-slate-800 mb-6">How can I assist you with your medications?</h2>
                            <div className="grid grid-cols-2 gap-3 w-full max-w-lg">
                                {quickActions.map((action, i) => (
                                    <button key={i} onClick={() => handleSendMessage(action.text)} className="p-4 rounded-2xl border border-slate-100 hover:border-indigo-200 hover:bg-indigo-50/30 transition-all text-left group">
                                        <span className="text-xl mb-1 block">{action.icon}</span>
                                        <span className="text-sm font-medium text-slate-700 group-hover:text-indigo-700">{action.text}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {messages.map((m) => (
                        <motion.div
                            key={m.id}
                            initial={{ opacity: 0, y: 20, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            transition={{ duration: 0.3 }}
                            className={`flex gap-4 ${m.isUser ? 'justify-end' : 'justify-start'}`}
                        >
                            {!m.isUser && (
                                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center flex-shrink-0 mt-1 shadow-md shadow-indigo-200">
                                    <Bot className="w-5 h-5 text-white" />
                                </div>
                            )}
                            <div
                                className={`max-w-[85%] md:max-w-[75%] rounded-2xl px-6 py-4 shadow-sm relative group ${m.isUser
                                    ? 'bg-gradient-to-br from-indigo-600 to-blue-700 text-white rounded-br-sm'
                                    : 'bg-white border border-slate-100/80 rounded-bl-sm'
                                    }`}
                            >
                                <div className={`prose prose-sm max-w-none ${m.isUser ? 'prose-invert' : ''}`}>
                                    <ReactMarkdown remarkPlugins={[remarkGfm]} components={MarkdownComponents}>{m.text}</ReactMarkdown>
                                </div>
                                <span className={`text-[10px] mt-2 block ${m.isUser ? 'text-indigo-100' : 'text-slate-400'}`}>
                                    {m.timestamp}
                                </span>
                            </div>
                        </motion.div>
                    ))}
                    {isLoading && <div className="flex gap-2 items-center text-xs text-muted-foreground ml-10"><Bot className="w-4 h-4 animate-bounce" /> Analyzing records...</div>}
                    <div ref={messagesEndRef} />
                </CardContent>

                <div className="p-6 border-t border-slate-100 bg-white/50 backdrop-blur-md">
                    <div className="flex gap-3">
                        <Button
                            variant="ghost"
                            onClick={startListening}
                            className={`rounded-2xl w-14 h-14 p-0 shadow-sm transition-all ${isListening
                                ? 'bg-red-500 text-white shadow-red-200'
                                : 'bg-white border border-slate-100 text-indigo-600 hover:bg-indigo-50 hover:border-indigo-100'
                                }`}
                        >
                            {isListening ? <StopCircle className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
                        </Button>
                        <Input
                            value={inputValue}
                            onChange={e => setInputValue(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleSendMessage()}
                            placeholder="Ask about medicines or health advice..."
                            className="rounded-2xl bg-white border-slate-100 h-14 px-6 focus:ring-2 focus:ring-indigo-500/20 transition-all text-base"
                        />
                        <Button
                            onClick={() => handleSendMessage()}
                            className="rounded-2xl w-14 h-14 p-0 bg-gradient-to-br from-indigo-600 to-blue-600 shadow-lg shadow-indigo-200 hover:shadow-indigo-300 transition-all"
                        >
                            <Send className="w-6 h-6" />
                        </Button>
                    </div>
                </div>
            </Card>
        </div>
    )
}
