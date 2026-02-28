import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '@/hooks/useAuth'
import { API_BASE_URL } from '@/lib/api'
import {
    Pill,
    ShoppingCart,
    ClipboardList,
    Search,
    Plus,
    Minus,
    CheckCircle,
    AlertCircle,
    Clock,
    Package,
    Loader2,
    ChevronDown,
    ChevronUp,
    ShieldCheck,
    X,
    Upload,
    ExternalLink,
    Zap,
    CalendarClock,
    FileText,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { Card, CardContent } from '@/components/ui/Card'

// ─── Types ────────────────────────────────────────────
interface Medicine {
    id: string
    name: string
    strength?: string
    unit_type?: string
    stock: number
    prescription_required: boolean
    price_rec?: number
    description?: string
}

interface OrderItem {
    id: string
    qty: number
    dosage_text?: string
    frequency_per_day?: number
    days_supply?: number
    medicines: Medicine
    created_at?: string
    // order_item_id stored in id for consume-dose API
}

interface Order {
    id: string
    status: string
    total_items: number
    channel?: string
    created_at: string
    finalized_at?: string
    items: OrderItem[]
}

interface CartItem {
    medicine: Medicine
    qty: number
    freq?: number
    dosage?: string
}

// ─── Helpers ──────────────────────────────────────────
const FREQ_LABELS: Record<number, string> = {
    1: 'Once a day',
    2: 'Twice a day',
    3: 'Three times a day',
    4: 'Four times a day',
}

function getNextDoseTimes(freq: number, createdAtStr?: string): string[] {
    const windows = [8, 14, 20]

    // Default to the standard static times if no creation date is provided (e.g., in Shop view)
    if (!createdAtStr) {
        if (freq === 1) return ['08:00']
        if (freq === 2) return ['08:00', '20:00']
        if (freq === 3) return ['08:00', '14:00', '20:00']
        if (freq === 4) return ['08:00', '12:00', '16:00', '20:00']
        return []
    }

    // Convert order creation to IST hour
    const createdDate = new Date(createdAtStr)
    // Add 5 hours 30 minutes for IST offset roughly (if createdDate is UTC)
    // To be precise and robust across environments, we just pull getUTCHours() and add 5.5
    let currentHour = createdDate.getUTCHours() + 5.5
    if (currentHour >= 24) currentHour -= 24

    const result: string[] = []

    if (freq === 1) {
        // Find the First window AFTER the current hour
        const nextWindow = windows.find(w => w >= currentHour) ?? windows[0]
        result.push(`${nextWindow.toString().padStart(2, '0')}:00`)
    }
    else if (freq === 2) {
        // Find the nearest window
        let nextWindow = windows.find(w => w >= currentHour) ?? windows[0]
        // Often 2/day is morning and night (8 and 20). Just pick the next sequential one in that pair.
        if (nextWindow === 14) nextWindow = 20
        result.push(`${nextWindow.toString().padStart(2, '0')}:00`)
        result.push(`${(nextWindow === 20 ? 8 : 20).toString().padStart(2, '0')}:00`)
    }
    else if (freq === 3) {
        // Collect the next 3 windows cycling through [8, 14, 20]
        let startIndex = windows.findIndex(w => w >= currentHour)
        if (startIndex === -1) startIndex = 0

        for (let i = 0; i < 3; i++) {
            const w = windows[(startIndex + i) % 3]
            result.push(`${w.toString().padStart(2, '0')}:00`)
        }
    }
    else if (freq === 4) {
        // Just generic 4 times
        result.push('08:00', '12:00', '16:00', '20:00')
    }

    return result
}

function FreqBadges({ freq, createdAt }: { freq?: number, createdAt?: string }) {
    if (!freq) return <span className="text-xs text-slate-400">—</span>

    const label = FREQ_LABELS[freq] ?? `${freq}×/day`
    const times = getNextDoseTimes(freq, createdAt)

    return (
        <div className="flex flex-wrap gap-1 mt-1">
            <span className="text-xs font-semibold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full">
                {label}
            </span>
            {times.map((t, idx) => (
                <span key={`${t}-${idx}`} className="text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full flex items-center gap-1">
                    <Clock className="w-3 h-3" /> {t}
                </span>
            ))}
        </div>
    )
}

function StatusBadge({ status }: { status: string }) {
    const cfg: Record<string, string> = {
        fulfilled: 'bg-emerald-50 text-emerald-700 border-emerald-200',
        approved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
        pending: 'bg-amber-50   text-amber-700   border-amber-200',
        rejected: 'bg-red-50     text-red-700     border-red-200',
        cancelled: 'bg-red-50     text-red-700     border-red-200',
    }
    return (
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${cfg[status] ?? 'bg-slate-50 text-slate-600 border-slate-200'}`}>
            {status}
        </span>
    )
}

// ─── Tabs ─────────────────────────────────────────────
const TABS = [
    { id: 'cabinet', label: 'Medicine Cabinet', icon: Pill },
    { id: 'history', label: 'Order History', icon: ClipboardList },
    { id: 'shop', label: 'Buy Medicines', icon: ShoppingCart },
] as const
type Tab = typeof TABS[number]['id']

// ──────────────────────────────────────────────────────
export default function MyMedicines() {
    const { user } = useAuth()

    const [tab, setTab] = useState<Tab>('cabinet')
    const [orders, setOrders] = useState<Order[]>([])
    const [catalogue, setCatalogue] = useState<Medicine[]>([])
    const [search, setSearch] = useState('')
    const [loadingOrders, setLoadingOrders] = useState(false)
    const [loadingCat, setLoadingCat] = useState(false)
    const [cart, setCart] = useState<CartItem[]>([])
    const [ordering, setOrdering] = useState(false)
    const [orderResult, setOrderResult] = useState<{ success: boolean; message: string } | null>(null)
    const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set())
    const [rxStatus, setRxStatus] = useState<Record<string, boolean | null>>({})
    const rxChecked = useRef<Set<string>>(new Set())
    // For as-needed: track per order-item qty locally after Taken clicks
    const [localQty, setLocalQty] = useState<Record<string, number>>({})
    const [takingDose, setTakingDose] = useState<Record<string, boolean>>({})
    // History filter
    const [historyFilter, setHistoryFilter] = useState<'all' | 'active' | 'completed'>('all')
    // Rx upload modal
    const [rxModal, setRxModal] = useState<{ open: boolean; medicine: Medicine | null; freq?: number; dosage?: string }>({
        open: false, medicine: null
    })
    // Freq modal
    const [freqModal, setFreqModal] = useState<{ open: boolean; medicine: Medicine | null }>({
        open: false, medicine: null
    })
    const [rxFile, setRxFile] = useState<File | null>(null)
    const [rxVerifying, setRxVerifying] = useState(false)
    const [rxModalResult, setRxModalResult] = useState<{ valid: boolean; message: string } | null>(null)

    // ── Fetch orders ────────────────────────────────────
    const fetchOrders = useCallback(async () => {
        if (!user?.id) return
        setLoadingOrders(true)
        try {
            const res = await fetch(`${API_BASE_URL}/my-medicines?patient_id=${user.id}`)
            const data = await res.json()
            if (data.success) setOrders(data.orders)
        } catch (e) {
            console.error(e)
        } finally {
            setLoadingOrders(false)
        }
    }, [user?.id])

    // ── Fetch catalogue ─────────────────────────────────
    const fetchCatalogue = useCallback(async (q = '') => {
        setLoadingCat(true)
        try {
            const url = `${API_BASE_URL}/available-medicines?limit=60${q ? `&search=${encodeURIComponent(q)}` : ''}`
            const res = await fetch(url)
            const data = await res.json()
            if (data.success) setCatalogue(data.medicines)
        } catch (e) {
            console.error(e)
        } finally {
            setLoadingCat(false)
        }
    }, [])

    useEffect(() => { fetchOrders() }, [fetchOrders])
    useEffect(() => {
        if (tab === 'shop') fetchCatalogue(search)
    }, [tab, search, fetchCatalogue])

    // ── Derived: ALL medicines from fulfilled orders (including finished) ─
    const activeMeds = orders
        .filter(o => o.status === 'fulfilled' || o.status === 'approved')
        .flatMap(o => o.items)
        .filter(i => i.medicines)

    // Consolidate duplicates — keep per-medicine/dosage item with highest id (latest)
    const medMap = new Map<string, OrderItem>()
    for (const item of activeMeds) {
        // Group by medicine ID and frequency/dosage so different regimens stay separate
        const key = `${item.medicines.id}_${item.frequency_per_day}_${item.dosage_text}`
        if (!medMap.has(key)) {
            medMap.set(key, { ...item, qty: 0 })
        }
        medMap.get(key)!.qty += item.qty
        // Keep the latest order item ID to ensure the Take Dose button works correctly
        // for the most recently fulfilled order_item representing this regimen.
        medMap.get(key)!.id = item.id
    }
    const cabinet = Array.from(medMap.values())

    // ── Handle Add to cart: gate Rx medicines behind upload modal ────
    function handleAddToCartWithFreq(med: Medicine, freq?: number, dosage?: string) {
        if (med.prescription_required) {
            setRxModal({ open: true, medicine: med, freq, dosage })
            setRxFile(null)
            setRxModalResult(null)
        } else {
            addToCart(med, freq, dosage)
        }
    }

    // ── Verify prescription image via Gemini Vision ──────────────────
    async function submitRxUpload() {
        if (!rxFile || !rxModal.medicine || !user?.id) return
        setRxVerifying(true)
        setRxModalResult(null)
        try {
            const fd = new FormData()
            fd.append('patient_id', user.id)
            fd.append('medicine_name', rxModal.medicine.name)
            fd.append('file', rxFile)
            const res = await fetch(`${API_BASE_URL}/verify-rx-upload`, { method: 'POST', body: fd })
            const data = await res.json()
            if (data.valid) {
                setRxModalResult({ valid: true, message: data.message })
                setTimeout(() => {
                    addToCart(rxModal.medicine!, rxModal.freq, rxModal.dosage)
                    setRxModal({ open: false, medicine: null, freq: undefined, dosage: undefined })
                    setRxFile(null)
                    setRxModalResult(null)
                }, 1200)
            } else {
                setRxModalResult({ valid: false, message: data.message })
            }
        } catch {
            setRxModalResult({ valid: false, message: '❌ Network error. Is the backend running?' })
        } finally {
            setRxVerifying(false)
        }
    }

    // ── addToCart (no Rx gating — handled by handleAddToCart) ────────
    function addToCart(med: Medicine, freq?: number, dosage?: string) {
        setCart(prev => {
            const ex = prev.find(c => c.medicine.id === med.id)
            if (ex) return prev.map(c => c.medicine.id === med.id ? { ...c, qty: c.qty + 1, freq, dosage } : c)
            return [...prev, { medicine: med, qty: 1, freq, dosage }]
        })
    }
    function changeQty(id: string, delta: number) {
        setCart(prev =>
            prev
                .map(c => c.medicine.id === id ? { ...c, qty: Math.max(0, c.qty + delta) } : c)
                .filter(c => c.qty > 0)
        )
    }
    function removeFromCart(id: string) {
        setCart(prev => prev.filter(c => c.medicine.id !== id))
    }

    // ── Place order ──────────────────────────────────────
    async function placeOrder() {
        if (!user?.id || cart.length === 0) return
        setOrdering(true)
        setOrderResult(null)
        try {
            const res = await fetch(`${API_BASE_URL}/manual-order`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    patient_id: user.id,
                    items: cart.map(c => ({
                        medicine_id: c.medicine.id,
                        qty: c.qty,
                        frequency_per_day: c.freq,
                        dosage_text: c.dosage
                    })),
                }),
            })
            const data = await res.json()
            if (data.success) {
                setOrderResult({
                    success: true,
                    message: `✅ Order placed! (${data.items_ordered?.map((i: any) => `${i.qty}× ${i.name}`).join(', ')})${data.warnings?.length ? `\n⚠️ ${data.warnings.join('; ')}` : ''}`,
                })
                setCart([])
                fetchOrders()
            } else {
                setOrderResult({ success: false, message: `❌ ${data.error || 'Order failed'}` })
            }
        } catch (e) {
            setOrderResult({ success: false, message: '❌ Network error. Is the backend running?' })
        } finally {
            setOrdering(false)
        }
    }

    // ── Take a dose (as-needed) ──────────────────────────
    async function takeDose(orderItemId: string, currentQty: number) {
        if (!user?.id || currentQty <= 0) return
        setTakingDose(prev => ({ ...prev, [orderItemId]: true }))
        try {
            const res = await fetch(`${API_BASE_URL}/consume-dose`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ patient_id: user.id, order_item_id: orderItemId }),
            })
            const data = await res.json()
            if (data.success) {
                setLocalQty(prev => ({ ...prev, [orderItemId]: data.remaining }))
                setTimeout(fetchOrders, 1500)
            }
        } catch (e) {
            console.error(e)
        } finally {
            setTakingDose(prev => ({ ...prev, [orderItemId]: false }))
        }
    }

    // ── Toggle order expand ──────────────────────────────
    function toggleOrder(id: string) {
        setExpandedOrders(prev => {
            const n = new Set(prev)
            n.has(id) ? n.delete(id) : n.add(id)
            return n
        })
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-indigo-50/20 to-blue-50/30 p-4 md:p-8">
            {/* Header */}
            <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
                <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-600 to-blue-500 flex items-center justify-center shadow-lg shadow-indigo-300/40">
                        <Pill className="w-7 h-7 text-white" />
                    </div>
                    <div>
                        <h1 className="text-2xl md:text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-700 to-blue-600">
                            My Medicines
                        </h1>
                        <p className="text-slate-500 text-sm mt-0.5">Cabinet · History · Shop</p>
                    </div>
                </div>
            </motion.div>

            {/* Tab bar */}
            <div className="flex gap-2 mb-8 bg-white/70 backdrop-blur-md rounded-2xl p-1.5 shadow-sm border border-slate-100 w-fit">
                {TABS.map(t => {
                    const Icon = t.icon
                    const active = tab === t.id
                    return (
                        <button
                            key={t.id}
                            onClick={() => setTab(t.id)}
                            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${active ? 'bg-indigo-600 text-white shadow-md shadow-indigo-300/40' : 'text-slate-500 hover:text-indigo-600 hover:bg-indigo-50'
                                }`}
                        >
                            <Icon className="w-4 h-4" />
                            {t.label}
                            {t.id === 'shop' && cart.length > 0 && (
                                <span className="ml-1 bg-white text-indigo-600 text-xs font-bold px-1.5 py-0.5 rounded-full">
                                    {cart.length}
                                </span>
                            )}
                        </button>
                    )
                })}
            </div>

            <AnimatePresence mode="wait">
                {/* ─── CABINET ──────────────────────────────────── */}
                {tab === 'cabinet' && (
                    <motion.div key="cabinet" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
                        {loadingOrders ? (
                            <div className="flex items-center justify-center h-48">
                                <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
                            </div>
                        ) : cabinet.length === 0 ? (
                            <div className="text-center py-24 text-slate-400">
                                <Pill className="w-12 h-12 mx-auto mb-4 opacity-30" />
                                <p className="font-medium">No medicines yet</p>
                                <p className="text-sm mt-1">Place your first order from the Shop tab</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                                {cabinet.map(item => {
                                    const isAsNeeded = !item.frequency_per_day ||
                                        (item.dosage_text?.toLowerCase().includes('as needed') ?? false) ||
                                        (item.dosage_text?.toLowerCase().includes('prn') ?? false)
                                    const remainingQty = localQty[item.id] ?? item.qty
                                    const isTaking = takingDose[item.id] ?? false
                                    const isEmpty = remainingQty <= 0

                                    return (
                                        <motion.div key={item.medicines.id} layout>
                                            <Card className={`rounded-2xl border border-slate-100/80 backdrop-blur-sm shadow-sm hover:shadow-md transition-all ${isEmpty ? 'opacity-50 bg-slate-50' : 'bg-white/80'
                                                }`}>
                                                <CardContent className="p-5">
                                                    <div className="flex items-start justify-between gap-2 mb-3">
                                                        <div>
                                                            <h3 className="font-bold text-slate-800 leading-tight">{item.medicines.name}</h3>
                                                            {item.medicines.strength && (
                                                                <p className="text-xs text-slate-500 mt-0.5">{item.medicines.strength} · {item.medicines.unit_type ?? ''}</p>
                                                            )}
                                                        </div>
                                                        <div className="text-right">
                                                            <span className={`text-2xl font-black ${isEmpty ? 'text-red-400' : 'text-indigo-600'}`}>
                                                                {remainingQty}×
                                                            </span>
                                                            {isEmpty && <p className="text-[10px] text-red-400 font-semibold">Out of stock</p>}
                                                        </div>
                                                    </div>

                                                    <div className="space-y-2 text-sm">
                                                        {item.dosage_text && (
                                                            <p className="text-slate-600">
                                                                <span className="font-semibold">Dosage:</span> {item.dosage_text}
                                                            </p>
                                                        )}

                                                        {isAsNeeded ? (
                                                            // AS-NEEDED: show Taken button
                                                            <div className="flex items-center gap-2 mt-2">
                                                                <span className="text-xs bg-purple-50 text-purple-700 px-2 py-0.5 rounded-full font-semibold flex items-center gap-1">
                                                                    <Zap className="w-3 h-3" /> As needed
                                                                </span>
                                                                <button
                                                                    onClick={() => takeDose(item.id, remainingQty)}
                                                                    disabled={isTaking || isEmpty}
                                                                    className={`ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${isEmpty
                                                                        ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                                                                        : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm shadow-indigo-300/40 active:scale-95'
                                                                        }`}
                                                                >
                                                                    {isTaking
                                                                        ? <Loader2 className="w-3 h-3 animate-spin" />
                                                                        : <Pill className="w-3 h-3" />
                                                                    }
                                                                    Taken
                                                                </button>
                                                            </div>
                                                        ) : (
                                                            // SCHEDULED: show schedule + auto-decrement note
                                                            <div>
                                                                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Schedule</span>
                                                                <FreqBadges freq={item.frequency_per_day} createdAt={item.created_at || undefined} />
                                                                <div className="mt-1.5 flex items-center gap-1 text-[11px] text-emerald-700 bg-emerald-50 px-2 py-1 rounded-lg">
                                                                    <CalendarClock className="w-3 h-3" />
                                                                    Auto-deducted at each dose time
                                                                </div>
                                                            </div>
                                                        )}

                                                        {item.days_supply && (
                                                            <p className="text-xs text-slate-500">{item.days_supply}-day supply</p>
                                                        )}
                                                        {item.medicines.prescription_required && (
                                                            <div className="flex items-center gap-1 text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded-lg">
                                                                <ShieldCheck className="w-3 h-3" /> Prescription required
                                                            </div>
                                                        )}
                                                    </div>
                                                </CardContent>
                                            </Card>
                                        </motion.div>
                                    )
                                })}
                            </div>
                        )}
                    </motion.div>
                )}

                {/* ─── HISTORY ──────────────────────────────────── */}
                {tab === 'history' && (
                    <motion.div key="history" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="space-y-4">

                        {/* Filter bar */}
                        {orders.length > 0 && (() => {
                            // classify orders
                            const classify = (o: Order) => {
                                const allDone = o.items.length > 0 && o.items.every(i => (localQty[i.id] ?? i.qty) === 0)
                                return allDone ? 'completed' : 'active'
                            }
                            const activeCount = orders.filter(o => classify(o) === 'active').length
                            const completedCount = orders.filter(o => classify(o) === 'completed').length

                            return (
                                <div className="flex items-center gap-2 flex-wrap">
                                    {(['all', 'active', 'completed'] as const).map(f => (
                                        <button
                                            key={f}
                                            onClick={() => setHistoryFilter(f)}
                                            className={`px-4 py-1.5 rounded-full text-xs font-semibold border transition-all ${historyFilter === f
                                                ? f === 'active'
                                                    ? 'bg-indigo-600 text-white border-indigo-600'
                                                    : f === 'completed'
                                                        ? 'bg-slate-700 text-white border-slate-700'
                                                        : 'bg-indigo-600 text-white border-indigo-600'
                                                : 'bg-white text-slate-500 border-slate-200 hover:border-indigo-300'
                                                }`}
                                        >
                                            {f === 'all' && `All (${orders.length})`}
                                            {f === 'active' && `🟢 Active (${activeCount})`}
                                            {f === 'completed' && `✅ Finished (${completedCount})`}
                                        </button>
                                    ))}
                                </div>
                            )
                        })()}

                        {loadingOrders ? (
                            <div className="flex items-center justify-center h-48">
                                <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
                            </div>
                        ) : orders.length === 0 ? (
                            <div className="text-center py-24 text-slate-400">
                                <ClipboardList className="w-12 h-12 mx-auto mb-4 opacity-30" />
                                <p className="font-medium">No orders yet</p>
                            </div>
                        ) : (() => {
                            const classifyOrder = (o: Order) => {
                                const allDone = o.items.length > 0 && o.items.every(i => (localQty[i.id] ?? i.qty) === 0)
                                return allDone ? 'completed' : 'active'
                            }
                            const filtered = historyFilter === 'all'
                                ? orders
                                : orders.filter(o => classifyOrder(o) === historyFilter)

                            if (filtered.length === 0) return (
                                <div className="text-center py-20 text-slate-400">
                                    <ClipboardList className="w-10 h-10 mx-auto mb-3 opacity-30" />
                                    <p className="font-medium">
                                        {historyFilter === 'active' ? 'No active orders' : 'No finished orders'}
                                    </p>
                                </div>
                            )

                            return <>{filtered.map(order => {
                                const expanded = expandedOrders.has(order.id)
                                const isOrderCompleted = order.items.length > 0 && order.items.every(i => (localQty[i.id] ?? i.qty) === 0)
                                return (
                                    <Card key={order.id} className="rounded-2xl border border-slate-100/80 bg-white/80 backdrop-blur-sm shadow-sm">
                                        <CardContent className="p-0">
                                            <button
                                                onClick={() => toggleOrder(order.id)}
                                                className="w-full flex items-center justify-between p-5 text-left hover:bg-slate-50/50 transition-colors rounded-2xl"
                                            >
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center">
                                                        <Package className="w-5 h-5 text-indigo-500" />
                                                    </div>
                                                    <div>
                                                        <p className="font-semibold text-slate-800 text-sm">Order #{order.id.slice(-8).toUpperCase()}</p>
                                                        <p className="text-xs text-slate-400 mt-0.5">
                                                            {new Date(order.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                                                        </p>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-3">
                                                    <StatusBadge status={order.status} />
                                                    {isOrderCompleted
                                                        ? <span className="text-[10px] font-bold bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">✅ Finished</span>
                                                        : <span className="text-[10px] font-bold bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full">🟢 Active</span>
                                                    }
                                                    <span className="text-xs text-slate-400">{order.total_items} items</span>
                                                    {expanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                                                </div>
                                            </button>

                                            <AnimatePresence>
                                                {expanded && (
                                                    <motion.div
                                                        initial={{ height: 0, opacity: 0 }}
                                                        animate={{ height: 'auto', opacity: 1 }}
                                                        exit={{ height: 0, opacity: 0 }}
                                                        transition={{ duration: 0.2 }}
                                                        className="overflow-hidden"
                                                    >
                                                        <div className="px-5 pb-5 border-t border-slate-100">
                                                            {order.items.length === 0 ? (
                                                                <p className="text-xs text-slate-400 pt-4">No items</p>
                                                            ) : (
                                                                <div className="space-y-3 pt-4">
                                                                    {order.items.map(item => (
                                                                        <div key={item.id} className="flex items-start gap-3 p-3 bg-slate-50 rounded-xl">
                                                                            <div className="w-8 h-8 bg-indigo-100 rounded-lg flex items-center justify-center flex-shrink-0">
                                                                                <Pill className="w-4 h-4 text-indigo-600" />
                                                                            </div>
                                                                            <div className="flex-1 min-w-0">
                                                                                <p className="font-semibold text-sm text-slate-800">{item.medicines?.name ?? 'Unknown'}</p>
                                                                                {item.medicines?.strength && (
                                                                                    <p className="text-xs text-slate-500">{item.medicines.strength}</p>
                                                                                )}
                                                                                <FreqBadges freq={item.frequency_per_day} createdAt={order.created_at} />
                                                                                {item.dosage_text && (
                                                                                    <p className="text-xs text-slate-500 mt-1">{item.dosage_text}</p>
                                                                                )}
                                                                            </div>
                                                                            <span className="font-bold text-indigo-600 text-sm">{item.qty}×</span>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </motion.div>
                                                )}
                                            </AnimatePresence>
                                        </CardContent>
                                    </Card>
                                )
                            })}</>
                        })()}
                    </motion.div>
                )}

                {/* ─── SHOP ─────────────────────────────────────── */}
                {tab === 'shop' && (
                    <motion.div key="shop" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
                        <div className="flex flex-col lg:flex-row gap-6">
                            {/* Catalogue */}
                            <div className="flex-1">
                                <div className="relative mb-5">
                                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                    <Input
                                        value={search}
                                        onChange={e => setSearch(e.target.value)}
                                        placeholder="Search medicines..."
                                        className="pl-10 rounded-xl h-12 bg-white border-slate-200"
                                    />
                                </div>

                                {loadingCat ? (
                                    <div className="flex items-center justify-center h-40">
                                        <Loader2 className="w-7 h-7 animate-spin text-indigo-500" />
                                    </div>
                                ) : catalogue.length === 0 ? (
                                    <div className="text-center py-16 text-slate-400">
                                        <Search className="w-10 h-10 mx-auto mb-3 opacity-30" />
                                        <p>No medicines found</p>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        {catalogue.map(med => {
                                            const inCart = cart.find(c => c.medicine.id === med.id)
                                            return (
                                                <motion.div key={med.id} layout>
                                                    <Card className="rounded-2xl border border-slate-100 bg-white/90 shadow-sm hover:shadow-md transition-all">
                                                        <CardContent className="p-4">
                                                            <div className="flex justify-between items-start gap-2 mb-2">
                                                                <div>
                                                                    <h3 className="font-bold text-slate-800 text-sm leading-tight">{med.name}</h3>
                                                                    {med.strength && <p className="text-xs text-slate-500 mt-0.5">{med.strength}</p>}
                                                                </div>
                                                                {med.prescription_required && (
                                                                    <span className="text-[10px] bg-amber-50 text-amber-600 border border-amber-200 px-1.5 py-0.5 rounded-full flex-shrink-0">Rx</span>
                                                                )}
                                                            </div>

                                                            <div className="flex items-center justify-between mt-3">
                                                                <div>
                                                                    {med.price_rec && (
                                                                        <p className="text-sm font-bold text-emerald-600">€{Number(med.price_rec).toFixed(2)}</p>
                                                                    )}
                                                                    <p className="text-xs text-slate-400">{med.stock} in stock</p>
                                                                </div>
                                                                {inCart ? (
                                                                    <div className="flex items-center gap-2">
                                                                        <button onClick={() => changeQty(med.id, -1)} className="w-7 h-7 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center hover:bg-indigo-200 transition-colors">
                                                                            <Minus className="w-3 h-3" />
                                                                        </button>
                                                                        <span className="font-bold text-sm text-indigo-700 w-5 text-center">{inCart.qty}</span>
                                                                        <button onClick={() => changeQty(med.id, 1)} className="w-7 h-7 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center hover:bg-indigo-200 transition-colors">
                                                                            <Plus className="w-3 h-3" />
                                                                        </button>
                                                                    </div>
                                                                ) : (
                                                                    <Button
                                                                        size="sm"
                                                                        onClick={() => setFreqModal({ open: true, medicine: med })}
                                                                        className="rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs px-3 h-8 gap-1"
                                                                    >
                                                                        <Plus className="w-3 h-3" /> Add
                                                                    </Button>
                                                                )}
                                                            </div>
                                                        </CardContent>
                                                    </Card>
                                                </motion.div>
                                            )
                                        })}
                                    </div>
                                )}
                            </div>

                            {/* Cart Sidebar */}
                            <div className="lg:w-80 flex-shrink-0">
                                <div className="sticky top-20">
                                    <Card className="rounded-2xl border border-slate-100 bg-white/90 shadow-sm">
                                        <CardContent className="p-5">
                                            <h2 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                                                <ShoppingCart className="w-5 h-5 text-indigo-600" />
                                                Cart
                                                {cart.length > 0 && (
                                                    <Badge variant="secondary" className="ml-auto">{cart.length}</Badge>
                                                )}
                                            </h2>

                                            {cart.length === 0 ? (
                                                <p className="text-sm text-slate-400 text-center py-6">Your cart is empty</p>
                                            ) : (
                                                <>
                                                    <div className="space-y-2 mb-4">
                                                        {cart.map(c => {
                                                            const needsRx = c.medicine.prescription_required
                                                            const rxOk = rxStatus[c.medicine.id]
                                                            return (
                                                                <div key={c.medicine.id}>
                                                                    <div className="flex items-center gap-2 p-2 bg-slate-50 rounded-xl">
                                                                        <div className="flex-1 min-w-0">
                                                                            <p className="text-sm font-semibold text-slate-800 truncate">{c.medicine.name}</p>
                                                                            {c.medicine.price_rec && (
                                                                                <p className="text-xs text-slate-500">€{(Number(c.medicine.price_rec) * c.qty).toFixed(2)}</p>
                                                                            )}
                                                                        </div>
                                                                        <div className="flex items-center gap-1">
                                                                            <button onClick={() => changeQty(c.medicine.id, -1)} className="w-6 h-6 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center hover:bg-indigo-100 hover:text-indigo-700 transition-colors">
                                                                                <Minus className="w-3 h-3" />
                                                                            </button>
                                                                            <span className="text-sm font-bold text-indigo-700 w-5 text-center">{c.qty}</span>
                                                                            <button onClick={() => changeQty(c.medicine.id, 1)} className="w-6 h-6 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center hover:bg-indigo-100 hover:text-indigo-700 transition-colors">
                                                                                <Plus className="w-3 h-3" />
                                                                            </button>
                                                                            <button onClick={() => removeFromCart(c.medicine.id)} className="w-6 h-6 rounded-full bg-red-50 text-red-400 flex items-center justify-center hover:bg-red-100 ml-1 transition-colors">
                                                                                <X className="w-3 h-3" />
                                                                            </button>
                                                                        </div>
                                                                    </div>
                                                                    {/* Rx status chip */}
                                                                    {needsRx && (
                                                                        <div className={`mt-1 mx-1 px-2 py-1 rounded-lg text-[11px] flex items-center gap-1.5 ${rxOk === null ? 'bg-slate-50 text-slate-400'
                                                                            : rxOk ? 'bg-emerald-50 text-emerald-700'
                                                                                : 'bg-amber-50 text-amber-700'
                                                                            }`}>
                                                                            {rxOk === null && <Loader2 className="w-3 h-3 animate-spin" />}
                                                                            {rxOk === true && <ShieldCheck className="w-3 h-3" />}
                                                                            {rxOk === false && <AlertCircle className="w-3 h-3" />}
                                                                            {rxOk === null && 'Checking prescription…'}
                                                                            {rxOk === true && 'Valid prescription found ✓'}
                                                                            {rxOk === false && (
                                                                                <>
                                                                                    No prescription found —{' '}
                                                                                    <a href="/patient/records" className="underline font-semibold flex items-center gap-0.5">
                                                                                        Upload <ExternalLink className="w-2.5 h-2.5" />
                                                                                    </a>
                                                                                </>
                                                                            )}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            )
                                                        })}
                                                    </div>

                                                    {/* Block Place Order if any Rx item has no prescription */}
                                                    {(() => {
                                                        const missingRx = cart.filter(c => c.medicine.prescription_required && rxStatus[c.medicine.id] === false)
                                                        return missingRx.length > 0 ? (
                                                            <div className="mb-3 p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 flex items-start gap-2">
                                                                <Upload className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                                                                <span>
                                                                    <strong>Prescription required</strong> for: {missingRx.map(c => c.medicine.name).join(', ')}.<br />
                                                                    Please <a href="/patient/records" className="underline font-semibold">upload a prescription</a> that mentions the medicine name, then try again.
                                                                </span>
                                                            </div>
                                                        ) : null
                                                    })()}

                                                    <Button
                                                        onClick={placeOrder}
                                                        disabled={ordering}
                                                        className="w-full rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white h-11 font-semibold gap-2"
                                                    >
                                                        {ordering ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShoppingCart className="w-4 h-4" />}
                                                        {ordering ? 'Placing order...' : 'Place Order'}
                                                    </Button>
                                                </>
                                            )}

                                            <AnimatePresence>
                                                {orderResult && (
                                                    <motion.div
                                                        initial={{ opacity: 0, y: 8 }}
                                                        animate={{ opacity: 1, y: 0 }}
                                                        exit={{ opacity: 0 }}
                                                        className={`mt-4 p-3 rounded-xl text-sm whitespace-pre-line ${orderResult.success
                                                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                                            : 'bg-red-50 text-red-700 border border-red-200'
                                                            }`}
                                                    >
                                                        <div className="flex items-start gap-2">
                                                            {orderResult.success
                                                                ? <CheckCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                                                                : <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                                                            }
                                                            <span>{orderResult.message}</span>
                                                        </div>
                                                    </motion.div>
                                                )}
                                            </AnimatePresence>
                                        </CardContent>
                                    </Card>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ─── Rx Upload Modal ─────────────────────────────────── */}
            <AnimatePresence>
                {rxModal.open && rxModal.medicine && (
                    <motion.div
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm"
                    >
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
                            className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden relative"
                        >
                            <button
                                onClick={() => !rxVerifying && setRxModal({ open: false, medicine: null })}
                                className="absolute right-4 top-4 p-2 text-slate-400 hover:bg-slate-100 rounded-full transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>

                            <div className="p-6">
                                <div className="w-12 h-12 bg-amber-100 rounded-2xl flex items-center justify-center mb-4">
                                    <ShieldCheck className="w-6 h-6 text-amber-600" />
                                </div>
                                <h2 className="text-xl font-bold text-slate-800 mb-2">Prescription Required</h2>
                                <p className="text-slate-600 text-sm mb-6">
                                    Please upload a clear photo or PDF of your doctor's prescription for <span className="font-bold text-slate-800">{rxModal.medicine.name}</span>. Our AI will verify it instantly.
                                </p>

                                <div className="space-y-4">
                                    <div className="border-2 border-dashed border-slate-200 rounded-2xl p-6 text-center hover:bg-slate-50 transition-colors relative cursor-pointer group">
                                        <input
                                            type="file"
                                            accept="image/*,.pdf"
                                            onChange={e => setRxFile(e.target.files?.[0] || null)}
                                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                            disabled={rxVerifying}
                                        />
                                        {rxFile ? (
                                            <div className="flex flex-col items-center">
                                                <FileText className="w-8 h-8 text-indigo-500 mb-2" />
                                                <p className="text-sm font-semibold text-slate-800 truncate px-4 w-full">{rxFile.name}</p>
                                                <p className="text-xs text-slate-500 mt-1">Ready to verify</p>
                                            </div>
                                        ) : (
                                            <div className="flex flex-col items-center">
                                                <Upload className="w-8 h-8 text-slate-300 group-hover:text-indigo-400 mb-2 transition-colors" />
                                                <p className="text-sm font-semibold text-slate-700">Tap to browse files</p>
                                                <p className="text-xs text-slate-400 mt-1">Image or PDF</p>
                                            </div>
                                        )}
                                    </div>

                                    <AnimatePresence>
                                        {rxModalResult && (
                                            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} className="overflow-hidden">
                                                <div className={`p-3 rounded-xl text-sm font-medium ${rxModalResult.valid ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                                                    {rxModalResult.message}
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>

                                    <div className="flex gap-3 pt-2">
                                        <Button
                                            variant="outline"
                                            className="flex-1 rounded-xl cursor-default"
                                            onClick={() => setRxModal({ open: false, medicine: null })}
                                            disabled={rxVerifying}
                                        >
                                            Cancel
                                        </Button>
                                        <Button
                                            onClick={submitRxUpload}
                                            disabled={!rxFile || rxVerifying}
                                            className="flex-1 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white cursor-default"
                                        >
                                            {rxVerifying ? (
                                                <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Verifying</>
                                            ) : 'Verify & Add'}
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ─── Frequency Selection Modal ───────────────────────────────── */}
            <AnimatePresence>
                {freqModal.open && freqModal.medicine && (
                    <motion.div
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm"
                    >
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
                            className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden relative"
                        >
                            <button
                                onClick={() => setFreqModal({ open: false, medicine: null })}
                                className="absolute right-4 top-4 p-2 text-slate-400 hover:bg-slate-100 rounded-full transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>

                            <div className="p-6">
                                <div className="w-12 h-12 bg-indigo-100 rounded-2xl flex items-center justify-center mb-4">
                                    <Clock className="w-6 h-6 text-indigo-600" />
                                </div>
                                <h2 className="text-xl font-bold text-slate-800 mb-2">Select Frequency</h2>
                                <p className="text-slate-600 text-sm mb-6">
                                    How often will you take <span className="font-bold text-slate-800">{freqModal.medicine.name}</span>?
                                </p>

                                <div className="space-y-2">
                                    {[
                                        { label: 'Once a day', freq: 1, dosage: 'Once a day' },
                                        { label: 'Twice a day', freq: 2, dosage: 'Twice a day' },
                                        { label: 'Three times a day', freq: 3, dosage: 'Three times a day' },
                                        { label: 'As required or needed', freq: 0, dosage: 'As needed' },
                                    ].map((opt) => (
                                        <button
                                            key={opt.label}
                                            onClick={() => {
                                                handleAddToCartWithFreq(freqModal.medicine!, opt.freq, opt.dosage)
                                                setFreqModal({ open: false, medicine: null })
                                            }}
                                            className="w-full text-left p-4 rounded-2xl border border-slate-200 hover:border-indigo-500 hover:bg-indigo-50 transition-colors"
                                        >
                                            <p className="font-semibold text-slate-800">{opt.label}</p>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}
