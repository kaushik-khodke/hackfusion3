import React from 'react'
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion'
import { cn } from '@/lib/utils'

interface TiltCardProps {
    children: React.ReactNode
    className?: string
}

export function TiltCard({ children, className }: TiltCardProps) {
    const x = useMotionValue(0)
    const y = useMotionValue(0)

    const mouseX = useSpring(x, { stiffness: 500, damping: 100 })
    const mouseY = useSpring(y, { stiffness: 500, damping: 100 })

    const rotateX = useTransform(mouseY, [-0.5, 0.5], ["15deg", "-15deg"])
    const rotateY = useTransform(mouseX, [-0.5, 0.5], ["-15deg", "15deg"])

    function onMouseMove(event: React.MouseEvent<HTMLDivElement>) {
        const rect = event.currentTarget.getBoundingClientRect()
        const width = rect.width
        const height = rect.height
        const mouseX = event.clientX - rect.left
        const mouseY = event.clientY - rect.top
        const xPct = mouseX / width - 0.5
        const yPct = mouseY / height - 0.5
        x.set(xPct)
        y.set(yPct)
    }

    function onMouseLeave() {
        x.set(0)
        y.set(0)
    }

    return (
        <motion.div
            onMouseMove={onMouseMove}
            onMouseLeave={onMouseLeave}
            style={{
                rotateX,
                rotateY,
                transformStyle: "preserve-3d",
            }}
            className={cn("relative perspective-1000", className)}
        >
            <div
                style={{ transform: "translateZ(50px)" }}
                className="absolute inset-4 rounded-3xl bg-secondary/20 blur-2xl -z-10 group-hover:bg-secondary/30 transition-colors pointer-events-none"
            />
            {children}
        </motion.div>
    )
}
