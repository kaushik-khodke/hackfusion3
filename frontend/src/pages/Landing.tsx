import React, { useRef } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { TiltCard } from '@/components/ui/TiltCard'
import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import { Shield, Lock, Bot, Activity, Database, HeartPulse, ArrowRight } from 'lucide-react'

/* removed local TiltCard */

export function Landing() {
  const { t } = useTranslation()

  const features = [
    {
      icon: <Database className="w-8 h-8" />,
      title: t('landing.feature_1_title', 'Decentralized Records'),
      description: t('landing.feature_1_desc', 'Your health data, encrypted and stored across a secure blockchain network. No single point of failure.'),
    },
    {
      icon: <Lock className="w-8 h-8" />,
      title: t('landing.feature_2_title', 'Patient-Owned Keys'),
      description: t('landing.feature_2_desc', 'You own the encryption keys. Grant temporary access to doctors instantly via QR code or consent request.'),
    },
    {
      icon: <Bot className="w-8 h-8" />,
      title: t('landing.feature_3_title', 'AI Diagnostics'),
      description: t('landing.feature_3_desc', 'Integrated AI analyzes your records for early warning signs and provides personalized health insights.'),
    },
  ]

  const steps = [
    { number: 1, text: t('landing.step_1', 'Sign up and verify your identity securely.') },
    { number: 2, text: t('landing.step_2', 'Upload existing records or connect providers.') },
    { number: 3, text: t('landing.step_3', 'Grant specific access to doctors when needed.') },
    { number: 4, text: t('landing.step_4', 'Receive AI-powered health alerts automatically.') },
  ]

  return (
    <div className="min-h-screen text-foreground overflow-hidden font-sans selection:bg-primary/30">

      {/* Hero Section */}
      <section className="relative min-h-screen flex items-center pt-20 pb-20 overflow-hidden perspective-1000">
        <div className="container mx-auto px-4 grid lg:grid-cols-2 gap-12 items-center">

          <motion.div
            initial={{ opacity: 0, x: -50 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="space-y-8 z-10"
          >
            <div className="inline-flex items-center gap-3 px-4 py-2 rounded-full glass-panel-3d text-sm font-medium text-primary animate-float-slow">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
              </span>
              Web3 Integrated Healthcare Protocol
            </div>

            <h1 className="text-6xl md:text-8xl font-bold font-heading tracking-tight leading-[0.9]">
              <span className="block text-foreground">Future of</span>
              <span className="text-gradient-tech">Medi-Care.</span>
            </h1>

            <p className="text-xl text-muted-foreground/90 max-w-xl leading-relaxed text-balance">
              The first truly decentralized health platform. Secure your records on the blockchain, powered by predictive AI diagnostics.
            </p>

            <div className="flex flex-wrap gap-4 pt-4">
              <Link to="/signup?role=patient">
                <Button size="lg" className="h-14 px-8 text-lg rounded-2xl btn-gradient transition-all hover:scale-105 active:scale-95 shadow-glow-primary">
                  {t('landing.cta_patient', 'Patient Portal')}
                  <ArrowRight className="w-5 h-5 ml-2" />
                </Button>
              </Link>
              <Link to="/signup?role=doctor">
                <Button size="lg" variant="outline" className="h-14 px-8 text-lg rounded-2xl glass-card hover:bg-white/50 transition-all hover:scale-105 active:scale-95 border-primary/20">
                  {t('landing.cta_doctor', 'Doctor Portal')}
                </Button>
              </Link>
            </div>

            <div className="flex gap-8 pt-8 border-t border-border/50">
              <div className="space-y-1">
                <div className="text-2xl font-bold font-heading">256-bit</div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground">Encryption</div>
              </div>
              <div className="space-y-1">
                <div className="text-2xl font-bold font-heading">0%</div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground">Data Leaks</div>
              </div>
              <div className="space-y-1">
                <div className="text-2xl font-bold font-heading">Instant</div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground">Global Access</div>
              </div>
            </div>
          </motion.div>

          {/* 3D Floating Hero Graphics */}
          <div className="relative h-[600px] hidden lg:flex items-center justify-center perspective-1000">
            <motion.div
              className="relative w-80 h-[500px] bg-gradient-to-br from-slate-900 to-slate-800 rounded-[2.5rem] border-[8px] border-slate-700 shadow-2xl z-20 flex flex-col overflow-hidden"
              animate={{ rotateY: [-5, 5], rotateX: [2, -2], y: [-10, 10] }}
              transition={{ duration: 6, repeat: Infinity, repeatType: "mirror", ease: "easeInOut" }}
              style={{ transformStyle: "preserve-3d" }}
            >
              {/* Screen Content for Phone Mockup */}
              <div className="flex-1 bg-background relative p-6 space-y-4">
                <div className="flex justify-between items-center mb-6">
                  <Activity className="w-6 h-6 text-primary" />
                  <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700" />
                </div>
                <div className="space-y-3">
                  <div className="h-32 rounded-2xl bg-gradient-to-br from-blue-500/10 to-teal-500/10 border border-blue-500/20 p-4">
                    <div className="w-12 h-12 rounded-xl bg-blue-500/20 mb-3 flex items-center justify-center">
                      <HeartPulse className="w-6 h-6 text-blue-500" />
                    </div>
                    <div className="h-2 w-24 bg-slate-200 dark:bg-slate-700 rounded mb-2" />
                    <div className="h-2 w-16 bg-slate-200 dark:bg-slate-700 rounded" />
                  </div>
                  <div className="h-20 rounded-2xl glass-card border border-border p-3 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-teal-500/20" />
                    <div className="space-y-2">
                      <div className="h-2 w-32 bg-slate-200 dark:bg-slate-700 rounded" />
                      <div className="h-2 w-20 bg-slate-200 dark:bg-slate-700 rounded" />
                    </div>
                  </div>
                  <div className="h-20 rounded-2xl glass-card border border-border p-3 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-purple-500/20" />
                    <div className="space-y-2">
                      <div className="h-2 w-32 bg-slate-200 dark:bg-slate-700 rounded" />
                      <div className="h-2 w-20 bg-slate-200 dark:bg-slate-700 rounded" />
                    </div>
                  </div>
                </div>

                {/* Floating Alert */}
                <motion.div
                  className="absolute bottom-8 left-4 right-4 bg-white dark:bg-slate-800 rounded-xl p-3 shadow-xl border border-red-500/30 flex items-center gap-3"
                  animate={{ y: [0, -5, 0] }}
                  transition={{ duration: 4, repeat: Infinity }}
                >
                  <div className="w-8 h-8 rounded-full bg-red-500/10 flex items-center justify-center text-red-500">
                    <Activity className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-red-500">AI Alert</div>
                    <div className="text-[10px] text-muted-foreground">Abnormal heart rate detected</div>
                  </div>
                </motion.div>
              </div>
            </motion.div>

            {/* Background Floating Elements */}
            <motion.div
              className="absolute top-20 right-20 w-40 h-40 glass-panel-3d rounded-3xl z-10 flex items-center justify-center"
              animate={{ y: [-20, 20], rotate: [0, 10] }}
              transition={{ duration: 7, repeat: Infinity, repeatType: "mirror" }}
            >
              <Shield className="w-16 h-16 text-primary/50" />
            </motion.div>
            <motion.div
              className="absolute bottom-40 left-10 w-32 h-32 glass-panel-3d rounded-full z-30 flex items-center justify-center border-teal-500/30"
              animate={{ y: [20, -20], x: [10, -10] }}
              transition={{ duration: 8, repeat: Infinity, repeatType: "mirror" }}
            >
              <Database className="w-12 h-12 text-teal-500/50" />
            </motion.div>
          </div>

        </div>
      </section>

      {/* 3D Features Section */}
      <section className="py-32 relative">
        <div className="container mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-20"
          >
            <h2 className="text-4xl md:text-5xl font-bold font-heading mb-6">Engineered for <span className="text-gradient-tech">Trust</span></h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">Web3 security meets AI intelligence.</p>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-10">
            {features.map((feature, index) => (
              <TiltCard key={index} className="h-full">
                <div className="group h-full p-8 rounded-[2rem] glass-card relative overflow-hidden flex flex-col items-center text-center hover:border-primary/50 transition-colors duration-500">
                  <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

                  <div className="w-20 h-20 rounded-2xl bg-background shadow-lg mb-8 flex items-center justify-center text-primary group-hover:scale-110 transition-transform duration-500 border border-border">
                    {feature.icon}
                  </div>

                  <h3 className="text-2xl font-bold font-heading mb-4 text-foreground">{feature.title}</h3>
                  <p className="text-muted-foreground leading-relaxed text-balance">{feature.description}</p>
                </div>
              </TiltCard>
            ))}
          </div>
        </div>
      </section>

      {/* Connected Steps */}
      <section className="py-32 relative overflow-hidden">
        {/* Background Trace Line */}
        <div className="absolute left-1/2 top-0 bottom-0 w-[1px] bg-gradient-to-b from-transparent via-primary/30 to-transparent -translate-x-1/2 hidden md:block" />

        <div className="container mx-auto px-4 relative">
          <div className="max-w-4xl mx-auto">
            {steps.map((step, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.15 }}
                viewport={{ once: true }}
                className={`flex items-center gap-12 mb-20 ${index % 2 === 0 ? 'flex-row' : 'flex-row-reverse text-right'}`}
              >
                <div className="flex-1">
                  <div className={`text-6xl font-black text-slate-200 dark:text-slate-800 mb-2 font-heading`}>0{step.number}</div>
                  <h3 className="text-2xl font-bold mb-2">Step {step.number}</h3>
                  <p className="text-muted-foreground text-lg">{step.text}</p>
                </div>

                {/* Center Node */}
                <div className="relative z-10 w-4 h-4 rounded-full bg-primary shadow-glow-primary hidden md:block">
                  <div className="absolute inset-[-8px] rounded-full border border-primary/30 animate-ping" />
                </div>

                <div className="flex-1 hidden md:block" />
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24">
        <div className="container mx-auto px-4">
          <div className="rounded-[3rem] bg-gradient-to-br from-primary to-blue-700 p-12 md:p-24 text-center relative overflow-hidden border border-white/20 shadow-2xl">
            <div className="absolute inset-0 bg-grid-pattern opacity-10" />
            <div className="relative z-10 max-w-3xl mx-auto space-y-8">
              <h2 className="text-4xl md:text-6xl font-bold font-heading text-white">Ready to Secure Your Health?</h2>
              <p className="text-xl text-blue-100">Join the decentralized healthcare revolution today.</p>
              <Link to="/signup">
                <Button size="lg" className="h-16 px-10 text-xl rounded-full bg-white text-primary hover:bg-blue-50 transition-all shadow-xl hover:scale-105">
                  Get Started Now
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
