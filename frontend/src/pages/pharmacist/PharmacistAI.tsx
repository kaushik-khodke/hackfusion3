import { useState, useRef, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { motion, AnimatePresence } from 'framer-motion'
import {
    Send,
    Mic,
    Bot,
    StopCircle,
    Activity,
    BrainCircuit,
    ChevronDown,
    ChevronUp
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
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
                    className="w-1 bg-gradient-to-t from-fuchsia-500 to-purple-500 rounded-full"
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

export function PharmacistAI({ isOpen, onToggle }: { isOpen: boolean, onToggle: () => void }) {
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
    }, [messages, isOpen])

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
        recognition.lang = 'en-US'

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
            utterance.lang = 'en-US'
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
            const response = await fetch(`${API_BASE_URL}/pharmacist/ai-query`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: textToSend,
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
                    text: `⚠️ ${result.response || result.error || "I'm having trouble analyzing the store dataset."}`,
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
        { text: 'Analyze daily sales trends', icon: '📈' },
        { text: 'Which meds are running low?', icon: '⚠️' },
        { text: 'Pending order summary', icon: '📋' },
    ]

    const MarkdownComponents = {
        h3: ({ node, ...props }: any) => (
            <div className="flex items-center gap-2 mt-4 mb-2 font-bold text-lg text-fuchsia-600 border-b border-fuchsia-100 pb-1">
                <Activity className="w-5 h-5" /> <h3 {...props} />
            </div>
        ),
        ul: ({ node, ...props }: any) => <ul className="list-disc pl-5 space-y-1 mb-4" {...props} />,
        strong: ({ node, ...props }: any) => <span className="font-semibold text-fuchsia-700 bg-fuchsia-50 px-1 rounded" {...props} />,
    }

    if (!isOpen) return null;

    return (
        <Card className="fixed bottom-6 right-6 w-[400px] h-[600px] flex flex-col shadow-2xl shadow-fuchsia-100/50 rounded-2xl overflow-hidden border-fuchsia-100/50 bg-white/95 backdrop-blur-xl z-50">
            <CardHeader className="bg-gradient-to-r from-fuchsia-600 to-purple-600 p-4 shrink-0 shadow-sm relative">
                <div className="flex justify-between items-center text-white">
                    <div className="flex items-center gap-2">
                        <BrainCircuit className="w-5 h-5" />
                        <CardTitle className="text-lg font-medium text-white">Pharmacist AI Copilot</CardTitle>
                    </div>
                    <div className="flex gap-2">
                        {isSpeaking && (
                            <Button variant="ghost" size="sm" onClick={stopSpeaking} className="h-8 w-8 p-0 text-white/80 hover:bg-white/20 hover:text-white rounded-full">
                                <StopCircle className="w-4 h-4" />
                            </Button>
                        )}
                        <Button variant="ghost" size="sm" onClick={onToggle} className="h-8 w-8 p-0 text-white/80 hover:bg-white/20 hover:text-white rounded-full">
                            <ChevronDown className="w-5 h-5" />
                        </Button>
                    </div>
                </div>
            </CardHeader>

            <AnimatePresence>
                {isListening && (
                    <motion.div className="absolute inset-0 z-50 bg-white/95 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center mt-[60px]">
                        <VoiceWaveform />
                        <h3 className="text-xl font-bold mt-6 text-fuchsia-900">Listening to command...</h3>
                        <p className="text-muted-foreground mt-2 text-sm">Ask about inventory, sales, or orders.</p>
                        {voiceError && <p className="text-red-500 mb-4 text-sm">{voiceError}</p>}
                        <div className="mt-8 flex gap-3">
                            <Button variant="outline" onClick={stopListening} className="rounded-full px-6">Cancel</Button>
                            <Button onClick={() => handleSendMessage()} className="rounded-full px-6 bg-fuchsia-600 hover:bg-fuchsia-700">Analyze Query</Button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            <CardContent className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages.length === 0 && (
                    <div className="h-full flex flex-col items-center justify-center text-center">
                        <div className="w-16 h-16 bg-fuchsia-50 rounded-full flex items-center justify-center mb-4 border border-fuchsia-100">
                            <BrainCircuit className="w-8 h-8 text-fuchsia-500" />
                        </div>
                        <h2 className="text-md font-semibold text-slate-800 mb-4">Command Center Copilot</h2>
                        <div className="grid grid-cols-1 gap-2 w-full">
                            {quickActions.map((action, i) => (
                                <button key={i} onClick={() => handleSendMessage(action.text)} className="p-3 rounded-lg border border-slate-100 hover:border-fuchsia-200 hover:bg-fuchsia-50/50 transition-all text-left text-sm group flex items-center gap-2">
                                    <span className="text-base">{action.icon}</span>
                                    <span className="font-medium text-slate-700 group-hover:text-fuchsia-700">{action.text}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {messages.map((m) => (
                    <motion.div
                        key={m.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={`flex gap-3 ${m.isUser ? 'justify-end' : 'justify-start'}`}
                    >
                        {!m.isUser && (
                            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-fuchsia-500 to-purple-600 flex items-center justify-center flex-shrink-0 mt-1 shadow-sm">
                                <Bot className="w-4 h-4 text-white" />
                            </div>
                        )}
                        <div
                            className={`max-w-[85%] rounded-2xl px-4 py-3 shadow-sm text-sm ${m.isUser
                                ? 'bg-gradient-to-br from-fuchsia-600 to-purple-600 text-white rounded-tr-sm'
                                : 'bg-slate-50 border border-slate-100 rounded-tl-sm'
                                }`}
                        >
                            <div className={`prose prose-sm max-w-none ${m.isUser ? 'prose-invert text-white' : 'text-slate-800'}`}>
                                <ReactMarkdown remarkPlugins={[remarkGfm]} components={MarkdownComponents}>{m.text}</ReactMarkdown>
                            </div>
                        </div>
                    </motion.div>
                ))}
                {isLoading && <div className="flex gap-2 items-center text-xs text-muted-foreground ml-10"><Bot className="w-4 h-4 animate-bounce text-fuchsia-500" /> Executing backend query...</div>}
                <div ref={messagesEndRef} />
            </CardContent>

            <div className="p-4 border-t border-slate-100 bg-white/80 backdrop-blur-md shrink-0">
                <div className="flex gap-2">
                    <Button
                        variant="ghost"
                        onClick={startListening}
                        className={`rounded-xl w-10 h-10 p-0 shadow-sm shrink-0 transition-all ${isListening
                            ? 'bg-red-500 text-white hover:bg-red-600'
                            : 'bg-slate-50 border border-slate-200 text-fuchsia-600 hover:bg-fuchsia-50 hover:border-fuchsia-200 hover:text-fuchsia-700'
                            }`}
                    >
                        {isListening ? <StopCircle className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                    </Button>
                    <Input
                        value={inputValue}
                        onChange={e => setInputValue(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleSendMessage()}
                        placeholder="Ask the analyst..."
                        className="rounded-xl bg-white border-slate-200 h-10 px-4 focus-visible:ring-fuchsia-500/30 transition-all text-sm flex-1"
                    />
                    <Button
                        onClick={() => handleSendMessage()}
                        className="rounded-xl w-10 h-10 p-0 bg-gradient-to-r from-fuchsia-600 to-purple-600 shadow-md text-white hover:opacity-90 transition-all shrink-0"
                    >
                        <Send className="w-4 h-4 transform translate-x-[1px] translate-y-[-1px]" />
                    </Button>
                </div>
            </div>
        </Card>
    )
} 
