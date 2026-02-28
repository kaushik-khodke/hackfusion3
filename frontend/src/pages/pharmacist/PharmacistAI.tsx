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
        <div className="flex items-center gap-[3px] h-12">
            {[...Array(6)].map((_, i) => (
                <motion.div
                    key={i}
                    className="w-1.5 bg-cyan-400 rounded-full shadow-[0_0_8px_rgba(34,211,238,0.6)]"
                    animate={{
                        height: ['20%', `${40 + Math.random() * 60}%`, '20%'],
                    }}
                    transition={{
                        duration: 0.7 + Math.random() * 0.3,
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
    const [language, setLanguage] = useState<'en' | 'hi' | 'mr'>('en')

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

        const langMap = { 'en': 'en-US', 'hi': 'hi-IN', 'mr': 'mr-IN' }
        recognition.lang = langMap[language] || 'en-US'

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
                    language: language,
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
            <div className="flex items-center gap-2 mt-4 mb-2 font-semibold text-base text-cyan-300 border-b border-slate-700/50 pb-1">
                <Activity className="w-4 h-4" /> <h3 {...props} />
            </div>
        ),
        ul: ({ node, ...props }: any) => <ul className="list-disc pl-5 space-y-1 mb-4 text-slate-300" {...props} />,
        strong: ({ node, ...props }: any) => <span className="font-semibold text-cyan-100 bg-slate-800/80 px-1 rounded" {...props} />,
        p: ({ node, ...props }: any) => <p className="leading-relaxed mb-3 text-slate-200" {...props} />,
    }

    if (!isOpen) return null;

    return (
        <Card className="fixed bottom-6 right-6 w-[420px] h-[650px] flex flex-col shadow-[0_30px_80px_-15px_rgba(0,0,0,0.7)] rounded-[24px] overflow-hidden border border-slate-700/50 bg-slate-900/80 backdrop-blur-3xl z-50 transition-all duration-300">
            {/* Animated glowing orbs in the background */}
            <div className="absolute top-[-10%] left-[-10%] w-[60%] h-[40%] bg-cyan-500/20 rounded-full blur-[80px] opacity-60 pointer-events-none animate-pulse" />
            <div className="absolute bottom-[-10%] right-[-10%] w-[60%] h-[40%] bg-indigo-500/20 rounded-full blur-[80px] opacity-60 pointer-events-none animate-pulse" style={{ animationDelay: '1s' }} />

            <CardHeader className="bg-transparent p-5 shrink-0 border-b border-slate-700/30 relative z-10 backdrop-blur-xl">
                <div className="flex justify-between items-center text-slate-100">
                    <div className="flex items-center gap-3">
                        <div className="relative flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700 shadow-inner">
                            <BrainCircuit className="w-4 h-4 text-cyan-400 drop-shadow-[0_0_8px_rgba(34,211,238,0.8)]" />
                            {isLoading && (
                                <span className="absolute -top-1 -right-1 flex h-3 w-3">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-3 w-3 bg-cyan-500 shadow-[0_0_8px_rgba(34,211,238,1)]"></span>
                                </span>
                            )}
                        </div>
                        <div className="flex flex-col">
                            <CardTitle className="text-[15px] font-bold tracking-wide bg-gradient-to-r from-cyan-300 to-indigo-300 bg-clip-text text-transparent">Pharmacist Copilot</CardTitle>
                            <span className="text-[10px] uppercase tracking-widest text-slate-500 font-semibold">{isLoading ? 'Processing...' : 'Online'}</span>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        {isSpeaking && (
                            <Button variant="ghost" size="sm" onClick={stopSpeaking} className="h-8 w-8 p-0 text-slate-400 hover:bg-slate-800 hover:text-cyan-400 rounded-full transition-colors relative">
                                <span className="absolute inset-0 rounded-full border border-cyan-400/30 animate-ping"></span>
                                <StopCircle className="w-4 h-4" />
                            </Button>
                        )}
                        <Button variant="ghost" size="sm" onClick={onToggle} className="h-8 w-8 p-0 text-slate-400 hover:bg-slate-800 hover:text-slate-100 rounded-full transition-colors">
                            <ChevronDown className="w-4 h-4" />
                        </Button>
                    </div>
                </div>
            </CardHeader>

            <AnimatePresence>
                {isListening && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="absolute inset-0 z-50 bg-slate-900/95 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center mt-[65px]"
                    >
                        <VoiceWaveform />
                        <h3 className="text-xl font-semibold mt-8 text-slate-100 tracking-tight">Listening...</h3>
                        <p className="text-slate-400 mt-2 text-sm font-medium">Ask about inventory, sales, or orders.</p>
                        {inputValue && (
                            <p className="mt-6 text-sm italic text-cyan-300/80 max-w-[80%] line-clamp-2">"{inputValue}"</p>
                        )}
                        {voiceError && <p className="text-red-400 mt-4 text-sm bg-red-400/10 px-3 py-1.5 rounded-md border border-red-400/20">{voiceError}</p>}
                        <div className="mt-8 flex gap-3 relative z-10">
                            <Button variant="outline" onClick={stopListening} className="rounded-full px-6 bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700 hover:text-white">Cancel</Button>
                            <Button onClick={() => handleSendMessage()} className="rounded-full px-6 bg-cyan-500 hover:bg-cyan-400 text-slate-900 font-semibold shadow-[0_0_15px_rgba(6,182,212,0.4)]">Send</Button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            <CardContent className="flex-1 overflow-y-auto p-4 space-y-5 bg-gradient-to-b from-slate-900 to-slate-950 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
                {messages.length === 0 && (
                    <div className="h-full flex flex-col items-center justify-center text-center px-5 flex-1 relative z-10">
                        <motion.div
                            initial={{ scale: 0.8, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            transition={{ duration: 0.6, type: "spring" }}
                            className="w-20 h-20 bg-gradient-to-br from-slate-800/80 to-slate-900/80 rounded-3xl flex items-center justify-center mb-6 border border-slate-700/50 shadow-[0_0_30px_rgba(34,211,238,0.15)] relative overflow-hidden"
                        >
                            <div className="absolute inset-0 bg-cyan-400/10 blur-xl opacity-50 animate-pulse"></div>
                            <Bot className="w-10 h-10 text-cyan-400 relative z-10 drop-shadow-[0_0_8px_rgba(34,211,238,0.6)]" />
                        </motion.div>
                        <h2 className="text-xl font-bold bg-gradient-to-r from-slate-100 to-slate-400 bg-clip-text text-transparent mb-2 tracking-tight">How can I assist you?</h2>
                        <p className="text-sm text-slate-400 mb-10 max-w-[260px] leading-relaxed">I am integrated with your pharmacy's database and ML models. Ask me anything.</p>

                        <div className="grid grid-cols-1 gap-3 w-full max-w-[300px]">
                            {quickActions.map((action, i) => (
                                <motion.button
                                    initial={{ opacity: 0, y: 15 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.3 + i * 0.1, duration: 0.4 }}
                                    key={i}
                                    onClick={() => handleSendMessage(action.text)}
                                    className="p-3.5 rounded-2xl border border-slate-700/30 bg-slate-800/40 hover:bg-slate-800/80 hover:border-cyan-500/30 transition-all duration-300 text-left text-sm group flex items-center gap-3 backdrop-blur-md shadow-sm hover:shadow-[0_4px_20px_-5px_rgba(34,211,238,0.15)]"
                                >
                                    <span className="text-lg bg-slate-900/50 p-2 rounded-xl group-hover:scale-110 transition-transform duration-300 shadow-inner">{action.icon}</span>
                                    <span className="font-medium text-slate-300 group-hover:text-cyan-100 transition-colors tracking-wide">{action.text}</span>
                                </motion.button>
                            ))}
                        </div>
                    </div>
                )}

                {messages.map((m) => (
                    <motion.div
                        key={m.id}
                        initial={{ opacity: 0, y: 10, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        transition={{ duration: 0.3 }}
                        className={`flex gap-3 relative z-10 ${m.isUser ? 'justify-end' : 'justify-start'}`}
                    >
                        {!m.isUser && (
                            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700/80 flex items-center justify-center flex-shrink-0 mt-1 shadow-[0_2px_10px_rgba(0,0,0,0.3)]">
                                <Bot className="w-4 h-4 text-cyan-400 drop-shadow-[0_0_5px_rgba(34,211,238,0.5)]" />
                            </div>
                        )}
                        <div
                            className={`max-w-[85%] rounded-2xl px-4 py-3.5 shadow-lg text-[14.5px] leading-relaxed backdrop-blur-md ${m.isUser
                                ? 'bg-gradient-to-br from-cyan-600 to-indigo-600 text-white rounded-tr-sm border border-cyan-400/20 shadow-[0_4px_15px_-3px_rgba(34,211,238,0.2)]'
                                : 'bg-slate-800/60 border border-slate-700/50 text-slate-200 rounded-tl-sm'
                                }`}
                        >
                            <div className={`prose prose-sm max-w-none ${m.isUser ? 'prose-invert' : ''}`}>
                                {m.isUser ? (
                                    <p className="m-0 font-medium tracking-wide">{m.text}</p>
                                ) : (
                                    <ReactMarkdown remarkPlugins={[remarkGfm]} components={MarkdownComponents}>{m.text}</ReactMarkdown>
                                )}
                            </div>
                        </div>
                    </motion.div>
                ))}

                {isLoading && (
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex gap-3 justify-start items-center ml-1 relative z-10 mt-2">
                        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700/80 flex items-center justify-center flex-shrink-0 shadow-[0_2px_10px_rgba(0,0,0,0.3)] relative overflow-hidden">
                            <div className="absolute inset-0 bg-cyan-400/20 animate-pulse"></div>
                            <Bot className="w-4 h-4 text-cyan-400 relative z-10 drop-shadow-[0_0_5px_rgba(34,211,238,0.5)]" />
                        </div>
                        <div className="bg-slate-800/60 backdrop-blur-md border border-slate-700/50 rounded-2xl rounded-tl-sm px-4 py-3.5 flex gap-1.5 items-center shadow-lg">
                            <span className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-bounce shadow-[0_0_5px_rgba(34,211,238,0.8)]" style={{ animationDelay: '0ms' }} />
                            <span className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-bounce shadow-[0_0_5px_rgba(34,211,238,0.8)]" style={{ animationDelay: '150ms' }} />
                            <span className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-bounce shadow-[0_0_5px_rgba(34,211,238,0.8)]" style={{ animationDelay: '300ms' }} />
                        </div>
                    </motion.div>
                )}
                <div ref={messagesEndRef} />
            </CardContent>

            <div className="p-5 bg-transparent shrink-0 relative z-20 before:absolute before:inset-x-0 before:-top-10 before:h-10 before:bg-gradient-to-t before:from-slate-900/90 before:to-transparent before:pointer-events-none backdrop-blur-xl border-t border-slate-700/30">
                <div className="flex gap-2 mb-3">
                    <div className="flex-1 text-[10px] text-slate-500 font-bold flex items-center justify-end gap-2 pr-1 uppercase tracking-widest">
                        <span>Language ⠇</span>
                        <select
                            value={language}
                            onChange={(e) => setLanguage(e.target.value as any)}
                            className="bg-slate-800/80 border border-slate-700/50 rounded-md text-cyan-400 font-semibold outline-none cursor-pointer hover:border-cyan-500/50 transition-colors appearance-none text-center px-2 py-0.5 shadow-sm"
                        >
                            <option value="en" className="bg-slate-900 text-slate-200">ENG</option>
                            <option value="hi" className="bg-slate-900 text-slate-200">HIN</option>
                            <option value="mr" className="bg-slate-900 text-slate-200">MAR</option>
                        </select>
                    </div>
                </div>

                <div className="flex gap-2.5 items-end">
                    <Button
                        title="Voice Input Option"
                        variant="ghost"
                        onClick={startListening}
                        className={`rounded-2xl w-[46px] h-[46px] p-0 shrink-0 transition-all duration-300 border shadow-sm ${isListening
                            ? 'bg-red-500/20 border-red-500/40 text-red-400 shadow-[0_0_15px_rgba(239,68,68,0.3)] hover:bg-red-500/30'
                            : 'bg-slate-800/80 border-slate-700/60 text-slate-300 hover:bg-slate-700 hover:text-cyan-300 hover:border-cyan-500/30'
                            }`}
                    >
                        {isListening ? <StopCircle className="w-5 h-5 animate-pulse" /> : <Mic className="w-5 h-5" />}
                    </Button>
                    <div className="relative flex-1 group">
                        <Input
                            value={inputValue}
                            onChange={e => setInputValue(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleSendMessage()}
                            placeholder="Message Copilot..."
                            className="w-full rounded-2xl bg-slate-800/50 border-slate-700/60 h-[46px] px-4 text-slate-100 placeholder:text-slate-500 focus-visible:ring-1 focus-visible:ring-cyan-500 focus-visible:border-cyan-500 focus-visible:bg-slate-800 transition-all duration-300 text-[15px] shadow-inner group-hover:border-slate-600"
                        />
                    </div>
                    <Button
                        onClick={() => handleSendMessage()}
                        disabled={!inputValue.trim() || isLoading}
                        className="rounded-2xl w-[46px] h-[46px] p-0 bg-gradient-to-br from-cyan-500 to-indigo-500 shadow-[0_4px_15px_rgba(6,182,212,0.3)] text-white hover:opacity-90 disabled:opacity-50 disabled:shadow-none transition-all duration-300 shrink-0 border border-cyan-400/20"
                    >
                        <Send className="w-4 h-4 transform translate-x-[1px] drop-shadow-md" />
                    </Button>
                </div>
            </div>
        </Card >
    )
}
