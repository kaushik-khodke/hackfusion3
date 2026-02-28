import { useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { AlertCircle, ArrowRight, Pill, Calendar } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useAuth } from '@/hooks/useAuth'
import { API_BASE_URL } from '@/lib/api'

interface RefillAlert {
    medicine_id: string
    medicine_name: string
    runout_date: string
    days_left: number
}

export function PharmacyRefillAlerts() {
    const { user } = useAuth()
    const navigate = useNavigate()
    const [alerts, setAlerts] = useState<RefillAlert[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        if (user?.id) {
            fetchAlerts()
        }
    }, [user?.id])

    const fetchAlerts = async () => {
        try {
            const response = await fetch(`${API_BASE_URL}/pharmacy/refill-alerts/${user?.id}`)
            const data = await response.json()
            if (data.success) {
                setAlerts(data.alerts)
            }
        } catch (error) {
            console.error('Error fetching refill alerts:', error)
        } finally {
            setLoading(false)
        }
    }

    if (loading || alerts.length === 0) return null

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="mb-6"
        >
            <Card className="border-l-4 border-l-amber-500 bg-amber-50/30 overflow-hidden group">
                <CardContent className="p-6">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="p-2 bg-amber-100 rounded-lg">
                            <AlertCircle className="w-5 h-5 text-amber-600" />
                        </div>
                        <div>
                            <h3 className="font-bold text-lg text-slate-800">Proactive Refill Alerts</h3>
                            <p className="text-sm text-slate-500">Our AI predicts you'll run out of these soon.</p>
                        </div>
                    </div>

                    <div className="space-y-3">
                        {alerts.map((alert) => (
                            <div
                                key={alert.medicine_id}
                                className="flex items-center justify-between p-3 rounded-xl bg-white border border-amber-100 shadow-sm transition-transform hover:scale-[1.01]"
                            >
                                <div className="flex items-center gap-3">
                                    <div className="p-1.5 bg-indigo-50 rounded-md text-indigo-600">
                                        <Pill className="w-4 h-4" />
                                    </div>
                                    <div>
                                        <h4 className="text-sm font-semibold text-slate-700">{alert.medicine_name}</h4>
                                        <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
                                            <Calendar className="w-3 h-3" />
                                            <span>{alert.days_left} days left</span>
                                        </div>
                                    </div>
                                </div>
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => navigate('/patient/pharmacy-chat')}
                                    className="text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 gap-2"
                                >
                                    Refill
                                    <ArrowRight className="w-3 h-3" />
                                </Button>
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>
        </motion.div>
    )
}
