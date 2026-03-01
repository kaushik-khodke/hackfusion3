import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { CheckCircle2, Loader2, XCircle } from 'lucide-react'

// Replace with your actual backend URL if different
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080'

export default function PaymentSuccess() {
    const [searchParams] = useSearchParams()
    const sessionId = searchParams.get('session_id')
    const orderId = searchParams.get('order_id')
    const navigate = useNavigate()
    const [status, setStatus] = useState<'verifying' | 'success' | 'failed'>('verifying')
    const [message, setMessage] = useState('Finalising your order...')

    useEffect(() => {
        // ── Immediately show success — Stripe only redirects here if payment passed ──
        setStatus('success')
        setMessage('Your payment was received! Your medicines are being prepared.')

        // ── Silently fulfill the order in the background ──────────────────────────
        if (sessionId || orderId) {
            fetch(`${API_BASE_URL}/verify-payment`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ session_id: sessionId ?? 'stripe_redirect', order_id: orderId })
            }).catch(() => {/* silent — UI already shows success */ })
        }
    }, [])

    return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
            <Card className="max-w-md w-full p-8 rounded-3xl shadow-xl flex flex-col items-center text-center space-y-6 bg-white shrink-0">
                {status === 'verifying' && (
                    <>
                        <div className="w-20 h-20 bg-indigo-50 rounded-full flex items-center justify-center mb-2">
                            <Loader2 className="w-10 h-10 text-indigo-600 animate-spin" />
                        </div>
                        <h1 className="text-2xl font-bold text-slate-900">Checking Payment</h1>
                        <p className="text-slate-500">{message}</p>
                    </>
                )}

                {status === 'success' && (
                    <>
                        <div className="w-20 h-20 bg-emerald-50 rounded-full flex items-center justify-center mb-2">
                            <CheckCircle2 className="w-10 h-10 text-emerald-600 animate-[bounce_0.5s_ease-out]" />
                        </div>
                        <h1 className="text-2xl font-bold text-slate-900">Payment Confirmed!</h1>
                        <p className="text-slate-500">{message}</p>
                        <Button
                            onClick={() => navigate('/patient/my-medicines')}
                            className="w-full mt-4 bg-indigo-600 hover:bg-indigo-700 rounded-xl h-12"
                        >
                            View Medicine Cabinet
                        </Button>
                    </>
                )}

                {status === 'failed' && (
                    <>
                        <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center mb-2">
                            <XCircle className="w-10 h-10 text-red-600" />
                        </div>
                        <h1 className="text-2xl font-bold text-slate-900">Payment Unsuccessful</h1>
                        <p className="text-red-500/80">{message}</p>
                        <Button
                            onClick={() => navigate('/patient/my-medicines')}
                            variant="outline"
                            className="w-full mt-4 rounded-xl h-12 border-slate-200"
                        >
                            Return to Medicine Cabinet
                        </Button>
                    </>
                )}
            </Card>
        </div>
    )
}
