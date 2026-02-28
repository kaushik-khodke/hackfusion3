import React from 'react'
import { Card, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Activity, ArrowRight, Sparkles } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

export function RiskAnalysisCard() {
  const navigate = useNavigate()

  return (
    <Card className="border-l-4 border-l-violet-500 shadow-md relative overflow-hidden group">
      {/* Dynamic background effect */}
      <div className="absolute top-0 right-0 w-32 h-32 bg-violet-500/10 rounded-full blur-2xl -mr-10 -mt-10 transition-transform group-hover:scale-110" />

      <CardContent className="p-6 flex flex-col items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="p-2 bg-violet-100 rounded-lg">
              <Activity className="w-5 h-5 text-violet-600" />
            </div>
            <h3 className="font-bold text-lg text-slate-800">Health AI Insight</h3>
          </div>

          <p className="text-sm text-slate-500 leading-relaxed">
            Run a predictive analysis on your records to detect early risks using our advanced Random Forest + Gemini engine.
          </p>
        </div>

        <Button
          onClick={() => navigate('/patient/analysis')}
          className="w-full bg-violet-50 hover:bg-violet-100 text-violet-700 border border-violet-200 justify-between group-hover:bg-violet-600 group-hover:text-white group-hover:border-transparent transition-all"
        >
          <span>Run Analysis</span>
          <ArrowRight className="w-4 h-4" />
        </Button>
      </CardContent>
    </Card>
  )
}