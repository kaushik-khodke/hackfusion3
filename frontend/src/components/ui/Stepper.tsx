import React from 'react'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { motion } from 'framer-motion'

interface Step {
  title: string
  description?: string
}

interface StepperProps {
  steps: Step[]
  currentStep: number
}

export function Stepper({ steps, currentStep }: StepperProps) {
  return (
    <div className="w-full py-4">
      <div className="flex items-center justify-between">
        {steps.map((step, index) => (
          <React.Fragment key={index}>
            <div className="flex flex-col items-center flex-1">
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: index * 0.1 }}
                className={cn(
                  'w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all',
                  index < currentStep
                    ? 'bg-primary border-primary text-white'
                    : index === currentStep
                    ? 'border-primary text-primary'
                    : 'border-gray-300 text-gray-400'
                )}
              >
                {index < currentStep ? (
                  <Check className="w-5 h-5" />
                ) : (
                  <span>{index + 1}</span>
                )}
              </motion.div>
              <div className="mt-2 text-center">
                <p
                  className={cn(
                    'text-sm font-medium',
                    index <= currentStep ? 'text-foreground' : 'text-muted-foreground'
                  )}
                >
                  {step.title}
                </p>
                {step.description && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {step.description}
                  </p>
                )}
              </div>
            </div>
            {index < steps.length - 1 && (
              <div className="flex-1 h-0.5 mx-2 bg-gray-300 relative top-[-20px]">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: index < currentStep ? '100%' : '0%' }}
                  transition={{ duration: 0.3 }}
                  className="h-full bg-primary"
                />
              </div>
            )}
          </React.Fragment>
        ))}
      </div>
    </div>
  )
}
