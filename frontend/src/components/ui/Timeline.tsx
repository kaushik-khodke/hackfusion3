import React from 'react'
import { cn } from '@/lib/utils'
import { motion } from 'framer-motion'

interface TimelineItem {
  title: string
  date: string
  description?: string
  icon?: React.ReactNode
  actions?: React.ReactNode
}

interface TimelineProps {
  items: TimelineItem[]
}

export function Timeline({ items }: TimelineProps) {
  return (
    <div className="relative">
      <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-border" />
      <div className="space-y-6">
        {items.map((item, index) => (
          <motion.div
            key={index}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.1 }}
            className="relative pl-10"
          >
            <div className="absolute left-0 w-8 h-8 rounded-full bg-primary flex items-center justify-center text-white">
              {item.icon || <span className="text-xs">{index + 1}</span>}
            </div>
            <div className="bg-card rounded-lg p-4 border shadow-sm">
              <div className="flex justify-between items-start gap-4 mb-2">
                <h4 className="font-semibold">{item.title}</h4>
                <span className="text-xs text-muted-foreground shrink-0">{item.date}</span>
              </div>
              {item.description && (
                <p className="text-sm text-muted-foreground mb-3">{item.description}</p>
              )}
              {item.actions && (
                <div className="flex flex-wrap gap-2 pt-2 border-t border-border/50">
                  {item.actions}
                </div>
              )}
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  )
}
