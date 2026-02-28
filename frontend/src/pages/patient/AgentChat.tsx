import React, { useState, useRef, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/lib/supabase";

// ─── Types ────────────────────────────────────────────────────────────────────
interface Step {
    agent: string;
    message: string;
    success: boolean;
}

interface Message {
    id: string;
    role: "user" | "assistant";
    content: string;
    agents_used?: string[];
    steps?: Step[];
    timestamp: Date;
}

// ─── Agent cosmetics ──────────────────────────────────────────────────────────
const AGENT_META: Record<string, { label: string; emoji: string; color: string }> = {
    pharmacy_agent: { label: "Pharmacy", emoji: "💊", color: "#7c3aed" },
    refill_agent: { label: "Refill", emoji: "🔄", color: "#2563eb" },
    notification_agent: { label: "Notification", emoji: "📧", color: "#059669" },
    health_agent: { label: "Health", emoji: "🩺", color: "#dc2626" },
    orchestrator: { label: "Orchestrator", emoji: "🧠", color: "#d97706" },
};

// ─── Sub-components ───────────────────────────────────────────────────────────
function AgentPill({ name }: { name: string }) {
    const meta = AGENT_META[name] ?? { label: name, emoji: "🤖", color: "#6b7280" };
    return (
        <span
            style={{ background: meta.color + "22", border: `1px solid ${meta.color}44`, color: meta.color }}
            className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium mr-1.5 mb-1"
        >
            {meta.emoji} {meta.label}
        </span>
    );
}

function StepCard({ step }: { step: Step }) {
    const meta = AGENT_META[step.agent] ?? { label: step.agent, emoji: "🤖", color: "#6b7280" };
    return (
        <div
            className="flex items-start gap-2 text-xs py-1.5 px-2 rounded-lg mb-1"
            style={{ background: step.success ? meta.color + "11" : "#fef2f2" }}
        >
            <span className="text-base leading-none mt-0.5">{step.success ? meta.emoji : "❌"}</span>
            <div>
                <span className="font-semibold" style={{ color: meta.color }}>{meta.label}</span>
                <p className="text-gray-600 mt-0.5 leading-snug">{step.message}</p>
            </div>
        </div>
    );
}

function ChatBubble({ msg }: { msg: Message }) {
    const isUser = msg.role === "user";
    const [showSteps, setShowSteps] = useState(false);

    return (
        <div className={`flex ${isUser ? "justify-end" : "justify-start"} mb-4`}>
            {!isUser && (
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm mr-2 flex-shrink-0 mt-1"
                    style={{ background: "linear-gradient(135deg,#7c3aed,#2563eb)" }}>
                    🧠
                </div>
            )}
            <div className={`max-w-[78%] ${isUser ? "items-end" : "items-start"} flex flex-col`}>
                {/* Agent pills */}
                {!isUser && msg.agents_used && msg.agents_used.length > 0 && (
                    <div className="flex flex-wrap mb-1.5">
                        {msg.agents_used.map((a) => <AgentPill key={a} name={a} />)}
                    </div>
                )}

                {/* Bubble */}
                <div
                    className={`rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${isUser
                            ? "text-white rounded-tr-sm"
                            : "bg-gray-800 text-gray-100 rounded-tl-sm"
                        }`}
                    style={isUser ? { background: "linear-gradient(135deg,#7c3aed,#4f46e5)" } : {}}
                >
                    {msg.content}
                </div>

                {/* Steps toggle */}
                {!isUser && msg.steps && msg.steps.length > 0 && (
                    <div className="mt-2 w-full">
                        <button
                            onClick={() => setShowSteps((s) => !s)}
                            className="text-xs text-gray-400 hover:text-gray-200 flex items-center gap-1 transition-colors"
                        >
                            <span>{showSteps ? "▾" : "▸"}</span>
                            {showSteps ? "Hide" : "Show"} agent steps ({msg.steps.length})
                        </button>
                        {showSteps && (
                            <div className="mt-2 border border-gray-700 rounded-xl p-2">
                                {msg.steps.map((step, i) => <StepCard key={i} step={step} />)}
                            </div>
                        )}
                    </div>
                )}

                <span className="text-xs text-gray-500 mt-1 px-1">
                    {msg.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
            </div>

            {isUser && (
                <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-xs text-white ml-2 flex-shrink-0 mt-1">
                    You
                </div>
            )}
        </div>
    );
}

function TypingIndicator() {
    return (
        <div className="flex justify-start mb-4">
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm mr-2 flex-shrink-0"
                style={{ background: "linear-gradient(135deg,#7c3aed,#2563eb)" }}>
                🧠
            </div>
            <div className="bg-gray-800 rounded-2xl rounded-tl-sm px-4 py-3">
                <div className="flex gap-1.5 items-center h-4">
                    {[0, 1, 2].map((i) => (
                        <div key={i} className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce"
                            style={{ animationDelay: `${i * 0.15}s` }} />
                    ))}
                    <span className="text-xs text-gray-400 ml-2">Agents coordinating…</span>
                </div>
            </div>
        </div>
    );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
const BACKEND = import.meta.env.VITE_BACKEND_URL ?? "http://localhost:8000";

const SUGGESTIONS = [
    "Do I have any medicines running low?",
    "Order 1 Paracetamol for me",
    "Search for Ibuprofen",
    "Analyse my health records",
    "What medicines do I currently have ordered?",
];

export default function AgentChat() {
    const { user } = useAuth();
    const [messages, setMessages] = useState<Message[]>([
        {
            id: "welcome",
            role: "assistant",
            content:
                "👋 Hi! I'm your **AI Health Assistant** — powered by multiple specialist agents.\n\nI can help you:\n• 💊 Search and order medicines\n• 🔄 Check and act on refill alerts\n• 🩺 Review your health records\n• 📧 Send you order confirmations\n\nWhat can I do for you today?",
            timestamp: new Date(),
        },
    ]);
    const [input, setInput] = useState("");
    const [loading, setLoading] = useState(false);
    const [language, setLanguage] = useState("en");
    const bottomRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages, loading]);

    const send = async (text: string) => {
        if (!text.trim() || loading || !user) return;
        setInput("");

        const userMsg: Message = {
            id: Date.now().toString(),
            role: "user",
            content: text.trim(),
            timestamp: new Date(),
        };
        setMessages((prev) => [...prev, userMsg]);
        setLoading(true);

        try {
            // Get fresh auth token for the request
            const { data: { session } } = await supabase.auth.getSession();
            const userId = session?.user?.id ?? user.id;

            const res = await fetch(`${BACKEND}/agent/chat`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    message: text.trim(),
                    user_id: userId,
                    language,
                }),
            });

            const json = await res.json();
            const aiMsg: Message = {
                id: (Date.now() + 1).toString(),
                role: "assistant",
                content: json.response ?? "Something went wrong. Please try again.",
                agents_used: json.agents_used ?? [],
                steps: json.steps ?? [],
                timestamp: new Date(),
            };
            setMessages((prev) => [...prev, aiMsg]);
        } catch (err) {
            setMessages((prev) => [
                ...prev,
                {
                    id: (Date.now() + 1).toString(),
                    role: "assistant",
                    content: "⚠️ Network error — please check that the backend is running.",
                    timestamp: new Date(),
                },
            ]);
        } finally {
            setLoading(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            send(input);
        }
    };

    return (
        <div className="min-h-screen flex flex-col" style={{ background: "#0f1117" }}>
            {/* ── Header ── */}
            <div className="sticky top-16 z-10 border-b border-gray-800 px-4 py-3"
                style={{ background: "rgba(15,17,23,0.95)", backdropFilter: "blur(12px)" }}>
                <div className="max-w-3xl mx-auto flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl"
                            style={{ background: "linear-gradient(135deg,#7c3aed,#2563eb)" }}>🧠</div>
                        <div>
                            <h1 className="font-bold text-white text-base">AI Health Assistant</h1>
                            <p className="text-xs text-gray-400">Multi-agent · pharmacy · refill · health</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                        <span className="text-xs text-gray-400">Live · DB connected</span>
                    </div>
                </div>
            </div>

            {/* ── Agent legend ── */}
            <div className="border-b border-gray-800/60 py-2 px-4">
                <div className="max-w-3xl mx-auto flex flex-wrap gap-2">
                    {Object.entries(AGENT_META).filter(([k]) => k !== "orchestrator").map(([key, meta]) => (
                        <span key={key} className="text-xs px-2 py-0.5 rounded-full"
                            style={{ background: meta.color + "22", color: meta.color }}>
                            {meta.emoji} {meta.label}
                        </span>
                    ))}
                </div>
            </div>

            {/* ── Messages ── */}
            <div className="flex-1 overflow-y-auto px-4 py-6">
                <div className="max-w-3xl mx-auto">
                    {messages.map((msg) => <ChatBubble key={msg.id} msg={msg} />)}
                    {loading && <TypingIndicator />}
                    <div ref={bottomRef} />
                </div>
            </div>

            {/* ── Suggestions (only when idle) ── */}
            {messages.length <= 1 && !loading && (
                <div className="px-4 pb-2">
                    <div className="max-w-3xl mx-auto flex flex-wrap gap-2">
                        {SUGGESTIONS.map((s) => (
                            <button key={s} onClick={() => send(s)}
                                className="text-xs px-3 py-1.5 rounded-full border border-gray-700 text-gray-300 hover:bg-gray-800 transition-colors">
                                {s}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* ── Input ── */}
            <div className="sticky bottom-0 border-t border-gray-800 px-4 py-3"
                style={{ background: "rgba(15,17,23,0.97)", backdropFilter: "blur(12px)" }}>
                <div className="max-w-3xl mx-auto flex items-end gap-2">
                    {/* Language selector */}
                    <select
                        value={language}
                        onChange={(e) => setLanguage(e.target.value)}
                        className="text-xs bg-gray-800 text-gray-300 border border-gray-700 rounded-lg px-2 py-2 h-10 outline-none"
                    >
                        <option value="en">EN</option>
                        <option value="hi">HI</option>
                        <option value="mr">MR</option>
                    </select>

                    <textarea
                        ref={textareaRef}
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        rows={1}
                        placeholder="Ask me anything — order medicine, check refills, search records…"
                        className="flex-1 bg-gray-800 text-gray-100 border border-gray-700 rounded-xl px-4 py-2.5 text-sm resize-none outline-none focus:border-indigo-500 transition-colors placeholder:text-gray-500"
                        style={{ minHeight: "42px", maxHeight: "160px" }}
                        disabled={loading || !user}
                    />

                    <button
                        onClick={() => send(input)}
                        disabled={loading || !input.trim() || !user}
                        className="w-10 h-10 rounded-xl flex items-center justify-center disabled:opacity-40 transition-all active:scale-95"
                        style={{ background: "linear-gradient(135deg,#7c3aed,#4f46e5)" }}
                        title="Send (Enter)"
                    >
                        <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
                        </svg>
                    </button>
                </div>
                <p className="text-center text-xs text-gray-600 mt-2">
                    Enter ↵ to send · Shift+Enter for new line · Data scoped to your account only
                </p>
            </div>
        </div>
    );
}
