import { useNavigate } from 'react-router-dom'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { AlertCircle } from 'lucide-react'

export default function PaymentCancel() {
    const navigate = useNavigate()

    return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
            <Card className="max-w-md w-full p-8 rounded-3xl shadow-xl flex flex-col items-center text-center space-y-6 bg-white shrink-0 border-amber-100">
                <div className="w-20 h-20 bg-amber-50 rounded-full flex items-center justify-center mb-2">
                    <AlertCircle className="w-10 h-10 text-amber-500" />
                </div>
                <h1 className="text-2xl font-bold text-slate-900">Checkout Cancelled</h1>
                <p className="text-slate-500">
                    Your Stripe checkout session was cancelled. The order remains pending and will not be shipped until a payment is complete.
                </p>
                <div className="flex gap-4 w-full mt-4">
                    <Button
                        onClick={() => navigate('/dashboard/medicines')}
                        className="w-full bg-slate-900 hover:bg-slate-800 rounded-xl h-12 text-white"
                    >
                        Return to Medicines
                    </Button>
                </div>
            </Card>
        </div>
    )
}
