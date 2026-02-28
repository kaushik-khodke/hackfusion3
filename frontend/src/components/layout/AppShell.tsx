import React from 'react'
import { Navbar } from '@/components/layout/Navbar'
import { cn } from '@/lib/utils'

type AppShellProps = {
  title?: string
  subtitle?: string
  rightSlot?: React.ReactNode
  children?: React.ReactNode
  className?: string
}

export function AppShell({ title, subtitle, rightSlot, children, className }: AppShellProps) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/30">
      <Navbar />
      <main className={cn('container mx-auto px-4 py-8', className)}>
        {(title || subtitle || rightSlot) ? (
          <header className="mb-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                {title ? (
                  <h1 className="text-3xl md:text-4xl font-bold tracking-tight">{title}</h1>
                ) : null}
                {subtitle ? <p className="text-muted-foreground mt-1">{subtitle}</p> : null}
              </div>
              {rightSlot ? <div className="pt-1">{rightSlot}</div> : null}
            </div>
          </header>
        ) : null}

        {children}
      </main>
    </div>
  )
}
