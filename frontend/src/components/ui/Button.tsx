import * as React from 'react'
import { motion, type MotionProps } from 'framer-motion'

import { cn } from '@/lib/utils'

export type ButtonVariant = 'default' | 'secondary' | 'outline' | 'ghost' | 'destructive'
export type ButtonSize = 'sm' | 'md' | 'lg' | 'icon'

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  MotionProps & {
    variant?: ButtonVariant
    size?: ButtonSize
    isLoading?: boolean
  }

const variants: Record<ButtonVariant, string> = {
  default: 'bg-primary text-white hover:bg-primary-hover',
  secondary: 'bg-secondary text-white hover:opacity-90',
  outline: 'border-2 border-primary text-primary hover:bg-primary hover:text-white',
  ghost: 'hover:bg-muted',
  destructive: 'bg-error text-white hover:opacity-90',
}

const sizes: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2',
  lg: 'px-6 py-3 text-lg',
  icon: 'h-9 w-9 p-0',
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'md', isLoading, children, disabled, ...props }, ref) => {
    const isDisabled = Boolean(disabled || isLoading)

    return (
      <motion.button
        ref={ref}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        disabled={isDisabled}
        className={cn(
          'inline-flex items-center justify-center rounded-lg font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 disabled:pointer-events-none',
          variants[variant],
          sizes[size],
          className
        )}
        {...props}
      >
        {isLoading ? 'Loading...' : children}
      </motion.button>
    )
  }
)

Button.displayName = 'Button'

export { Button }
