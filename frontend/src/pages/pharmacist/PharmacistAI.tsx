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
        <div className="flex items-center gap-[4px] h-12">
            {[...Array(5)].map((_, i) => (
                <motion.div
                    key={i}
                    className="w-[5px] bg-white rounded-full shadow-sm"
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
            <div className="flex items-center gap-2 mt-4 mb-2 font-semibold text-base text-[#B02BE0] border-b border-slate-100 pb-1">
                <Activity className="w-4 h-4" /> <h3 {...props} />
            </div>
        ),
        ul: ({ node, ...props }: any) => <ul className="list-disc pl-5 space-y-2 mb-4 text-[#3A3F45] text-[13px]" {...props} />,
        li: ({ node, ...props }: any) => <li className="leading-snug marker:text-[#B02BE0]" {...props} />,
        strong: ({ node, ...props }: any) => <span className="font-semibold text-[#B02BE0]" {...props} />,
        p: ({ node, ...props }: any) => <p className="leading-relaxed mb-3 text-[#3A3F45] text-[13px]" {...props} />,
    }

    if (!isOpen) return null;

    return (
        <Card className="fixed bottom-6 right-6 w-[400px] h-[600px] flex flex-col shadow-[0_15px_40px_-5px_rgba(0,0,0,0.15)] rounded-[20px] overflow-hidden border border-slate-200 bg-white z-50">
            <CardHeader className="bg-[#B02BE0] p-[18px] shrink-0 relative z-10 shadow-sm rounded-t-[20px] border-b-0">
                <div className="flex justify-between items-center text-white">
                    <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full border border-white/20 flex items-center justify-center bg-white/10">
                            <BrainCircuit className="w-4 h-4 text-white" />
                        </div>
                        <div className="flex flex-col">
                            <CardTitle className="text-[15px] font-medium tracking-wide">Pharmacist AI Copilot</CardTitle>
                        </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <select
                            value={language}
                            onChange={(e) => setLanguage(e.target.value as any)}
                            className="bg-white/20 hover:bg-white/30 text-white border-none rounded-md px-1.5 py-0.5 text-[11px] font-medium outline-none cursor-pointer transition-colors appearance-none text-center"
                        >
                            <option value="en" className="text-black">EN</option>
                            <option value="hi" className="text-black">HI</option>
                            <option value="mr" className="text-black">MR</option>
                        </select>
                        {isSpeaking && (
                            <Button variant="ghost" size="sm" onClick={stopSpeaking} className="h-7 w-7 p-0 text-white hover:bg-white/20 rounded-full transition-colors relative">
                                <span className="absolute inset-0 rounded-full border border-white/40 animate-ping"></span>
                                <StopCircle className="w-4 h-4" />
                            </Button>
                        )}
                        <Button variant="ghost" size="sm" onClick={onToggle} className="h-7 w-7 p-0 text-white hover:bg-white/20 rounded-full transition-colors">
                            <ChevronDown className="w-5 h-5" />
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
                        className="absolute inset-0 z-50 bg-[#B02BE0]/95 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center mt-[70px]"
                    >
                        <VoiceWaveform />
                        <h3 className="text-xl font-semibold mt-8 text-white tracking-tight">Listening...</h3>
                        <p className="text-white/80 mt-2 text-sm font-medium">Ask about inventory, sales, or orders.</p>
                        {inputValue && (
                            <p className="mt-6 text-sm italic text-white/90 max-w-[80%] line-clamp-2">"{inputValue}"</p>
                        )}
                        {voiceError && <p className="text-red-200 mt-4 text-sm bg-red-900/30 px-3 py-1.5 rounded-md">{voiceError}</p>}
                        <div className="mt-8 flex gap-3 relative z-10">
                            <Button variant="outline" onClick={stopListening} className="rounded-full px-6 bg-transparent border-white/30 text-white hover:bg-white/10 hover:text-white">Cancel</Button>
                            <Button onClick={() => handleSendMessage()} className="rounded-full px-6 bg-white hover:bg-slate-100 text-[#B02BE0] font-semibold">Send</Button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            <CardContent className="flex-1 overflow-y-auto p-5 space-y-5 bg-[#fafafa] scrollbar-thin scrollbar-thumb-slate-200">
                {messages.length === 0 && (
                    <div className="h-full flex flex-col items-center justify-center text-center px-4">
                        <div className="w-16 h-16 bg-[#F3E5F5] rounded-full flex items-center justify-center mb-4">
                            <Bot className="w-8 h-8 text-[#B02BE0]" />
                        </div>
                        <h2 className="text-lg font-semibold text-slate-800 tracking-tight">How can I assist you?</h2>
                        <p className="text-sm text-slate-500 mb-8 max-w-[260px] leading-relaxed">I am integrated with your pharmacy's database and ML models. Ask me anything.</p>

                        <div className="grid grid-cols-1 gap-2.5 w-full">
                            {quickActions.map((action, i) => (
                                <motion.button
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.1 + i * 0.1, duration: 0.3 }}
                                    key={i}
                                    onClick={() => handleSendMessage(action.text)}
                                    className="p-3.5 rounded-[14px] border border-slate-200 bg-white hover:border-[#B02BE0]/40 hover:bg-[#F3E5F5]/30 transition-all text-left text-[14px] text-slate-700 font-medium flex items-center gap-3 shadow-sm hover:shadow-md"
                                >
                                    <span className="text-lg">{action.icon}</span>
                                    <span>{action.text}</span>
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
                        className={`flex gap-3 relative ${m.isUser ? 'justify-end' : 'justify-start'}`}
                    >
                        {!m.isUser && (
                            <div className="w-[34px] h-[34px] rounded-[10px] bg-[#B02BE0] flex items-center justify-center flex-shrink-0 mt-0.5 shadow-sm">
                                <Bot className="w-[18px] h-[18px] text-white" />
                            </div>
                        )}
                        <div
                            className={`max-w-[85%] text-[14px] leading-relaxed ${m.isUser
                                ? 'bg-[#B02BE0] text-white px-4 py-2.5 rounded-[18px] rounded-tr-[4px] shadow-sm font-medium'
                                : 'text-slate-800'
                                }`}
                        >
                            <div className={`prose prose-sm max-w-none ${m.isUser ? 'text-white' : ''}`}>
                                {m.isUser ? (
                                    <p className="m-0">{m.text}</p>
                                ) : (
                                    <ReactMarkdown remarkPlugins={[remarkGfm]} components={MarkdownComponents}>{m.text}</ReactMarkdown>
                                )}
                            </div>
                        </div>
                    </motion.div>
                ))}

                {isLoading && (
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex gap-3 justify-start items-center ml-1 mt-2">
                        <div className="w-[34px] h-[34px] rounded-[10px] bg-[#B02BE0] flex items-center justify-center flex-shrink-0 shadow-sm">
                            <Bot className="w-[18px] h-[18px] text-white animate-pulse" />
                        </div>
                        <div className="flex gap-1.5 items-center bg-white px-4 py-3 rounded-[16px] rounded-tl-[4px] shadow-sm border border-slate-100">
                            <span className="w-1.5 h-1.5 bg-[#B02BE0] rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                            <span className="w-1.5 h-1.5 bg-[#B02BE0] rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                            <span className="w-1.5 h-1.5 bg-[#B02BE0] rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                        </div>
                    </motion.div>
                )}
                <div ref={messagesEndRef} />
            </CardContent>

            <div className="p-4 bg-white shrink-0 border-t border-slate-100 relative z-10 rounded-b-[20px]">
                <div className="flex gap-2.5 items-center">
                    <Button
                        title="Voice Input Option"
                        variant="ghost"
                        onClick={startListening}
                        className={`rounded-full w-10 h-10 p-0 shrink-0 transition-all ${isListening
                            ? 'bg-red-50 text-red-500 hover:bg-red-100'
                            : 'bg-transparent text-[#B02BE0] hover:bg-slate-100'
                            }`}
                    >
                        {isListening ? <StopCircle className="w-5 h-5 animate-pulse" /> : <Mic className="w-5 h-5" />}
                    </Button>
                    <div className="flex-1">
                        <Input
                            value={inputValue}
                            onChange={e => setInputValue(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleSendMessage()}
                            placeholder="Ask the analyst..."
                            className="w-full bg-white border border-slate-200 rounded-full h-10 px-4 text-slate-700 placeholder:text-slate-400 focus-visible:ring-1 focus-visible:ring-[#B02BE0]/40 focus-visible:border-[#B02BE0]/40 transition-all shadow-sm"
                        />
                    </div>
                    <Button
                        onClick={() => handleSendMessage()}
                        disabled={!inputValue.trim() || isLoading}
                        className="rounded-full w-10 h-10 p-0 bg-[#B02BE0] hover:bg-[#9922C3] shadow-md text-white disabled:opacity-50 transition-all shrink-0"
                    >
                        <Send className="w-4 h-4 ml-[1px] mt-[1px]" />
                    </Button>
                </div>
            </div>
        </Card>
    )
}
