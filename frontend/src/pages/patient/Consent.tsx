import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Separator } from '@/components/ui/separator'
import { Input } from '@/components/ui/Input'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

import { AlertTriangle, Ban, CheckCircle2, Clock, ShieldCheck } from 'lucide-react'
import { TiltCard } from '@/components/ui/TiltCard'

type ConsentStatus = 'pending' | 'approved' | 'rejected' | 'expired'

type ConsentRequest = {
  id: string
  status: ConsentStatus
  access_type: string | null
  reason: string | null
  created_at: string
  expires_at: string | null
  doctor_id: string | null
}

type Stats = {
  pending: number
  approved: number
  denied: number
  expired: number
}

function StatCard({
  label,
  value,
  icon,
  tone,
}: {
  label: string
  value: number
  icon: React.ReactNode
  tone: 'primary' | 'success' | 'danger' | 'muted'
}) {
  const toneClasses =
    tone === 'primary'
      ? 'border-primary/25 bg-primary/5'
      : tone === 'success'
        ? 'border-emerald-400/30 bg-emerald-500/5'
        : tone === 'danger'
          ? 'border-destructive/40 bg-destructive/5'
          : 'border-border bg-card'

  return (
    <Card className={`${toneClasses} hover:shadow-sm transition-shadow`}>
      <CardContent className="p-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
          <p className="text-2xl font-semibold mt-1">{value}</p>
        </div>
        <div className="h-9 w-9 rounded-xl bg-background/70 border flex items-center justify-center text-muted-foreground">
          {icon}
        </div>
      </CardContent>
    </Card>
  )
}

function SkeletonRequestCard() {
  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="h-4 w-40 bg-muted rounded" />
          <div className="h-3 w-24 bg-muted rounded" />
        </div>
        <div className="h-3 w-64 bg-muted rounded" />
        <div className="grid grid-cols-3 gap-3">
          <div className="h-8 bg-muted rounded" />
          <div className="h-8 bg-muted rounded" />
          <div className="h-8 bg-muted rounded" />
        </div>
      </CardContent>
    </Card>
  )
}

import { useTranslation } from 'react-i18next'

export default function Consent() {
  const { t } = useTranslation()
  const { user } = useAuth()

  const [patientRowId, setPatientRowId] = useState<string | null>(null) // patients.id
  const [requests, setRequests] = useState<ConsentRequest[]>([])
  const [stats, setStats] = useState<Stats>({ pending: 0, approved: 0, denied: 0, expired: 0 })
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const [pinDialogOpen, setPinDialogOpen] = useState(false)
  const [pin, setPin] = useState('')
  const [pinError, setPinError] = useState<string | null>(null)
  const [pendingAction, setPendingAction] = useState<{ id: string; type: 'approve' | 'reject' } | null>(
    null
  )

  const hasPending = useMemo(() => requests.length > 0, [requests])

  const fetchData = async () => {
    if (!user) return
    setLoading(true)

    // 1) Resolve auth uid -> patients.id
    const { data: patient, error: patientError } = await supabase
      .from('patients')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle()

    if (patientError) {
      console.error(patientError)
      alert(patientError.message)
      setRequests([])
      setStats({ pending: 0, approved: 0, denied: 0, expired: 0 })
      setLastUpdated(new Date())
      setLoading(false)
      return
    }

    const pid = (patient?.id as string | undefined) ?? null
    setPatientRowId(pid)

    if (!pid) {
      setRequests([])
      setStats({ pending: 0, approved: 0, denied: 0, expired: 0 })
      setLastUpdated(new Date())
      setLoading(false)
      return
    }

    // 2) Stats: fetch statuses for this patient
    const { data: allRows, error: allError } = await supabase
      .from('consent_requests')
      .select('status')
      .eq('patient_id', pid)

    if (allError) console.error(allError)

    const nextStats: Stats = { pending: 0, approved: 0, denied: 0, expired: 0 }
      ; (allRows ?? []).forEach((r: any) => {
        if (r.status === 'pending') nextStats.pending++
        else if (r.status === 'approved') nextStats.approved++
        else if (r.status === 'rejected') nextStats.denied++
        else if (r.status === 'expired') nextStats.expired++
      })
    setStats(nextStats)

    // 3) Pending list
    const { data: pendingRows, error: pendingError } = await supabase
      .from('consent_requests')
      .select('id, status, access_type, reason, created_at, expires_at, doctor_id')
      .eq('patient_id', pid)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })

    if (pendingError) {
      console.error(pendingError)
      alert(pendingError.message)
      setRequests([])
      setLastUpdated(new Date())
      setLoading(false)
      return
    }

    setRequests((pendingRows ?? []) as ConsentRequest[])
    setLastUpdated(new Date())
    setLoading(false)
  }

  useEffect(() => {
    fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id])

  const openPinDialog = (id: string, type: 'approve' | 'reject') => {
    setPendingAction({ id, type })
    setPin('')
    setPinError(null)
    setPinDialogOpen(true)
  }

  const submitAction = async () => {
    if (!user || !pendingAction) return

    if (pin.length !== 6) {
      setPinError('Please enter your 6-digit Smart PIN.')
      return
    }

    setActionLoading(pendingAction.id)

    const newStatus = pendingAction.type === 'approve' ? 'approved' : 'rejected'

    const { error } = await supabase
      .from('consent_requests')
      .update({ status: newStatus })
      .eq('id', pendingAction.id)

    setActionLoading(null)

    if (error) {
      console.error(error)
      alert(error.message)
      return
    }

    setPinDialogOpen(false)
    setPendingAction(null)
    await fetchData()
  }

  return (
    <>
      <div className="mx-auto w-full max-w-7xl px-4 md:px-6 py-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Consent Requests</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Approve or deny doctor access to your medical records.
            </p>
          </div>

          <div className="flex items-center gap-3">
            {lastUpdated ? (
              <span className="text-xs text-muted-foreground">
                Updated:{' '}
                <span className="font-medium">
                  {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </span>
            ) : null}

            <Button size="sm" variant="outline" onClick={fetchData}>
              Refresh
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <TiltCard><StatCard label={t('consent.pending')} value={stats.pending} icon={<Clock className="h-4 w-4" />} tone="primary" /></TiltCard>
          <TiltCard><StatCard label={t('consent.approved')} value={stats.approved} icon={<CheckCircle2 className="h-4 w-4" />} tone="success" /></TiltCard>
          <TiltCard><StatCard label={t('consent.denied')} value={stats.denied} icon={<Ban className="h-4 w-4" />} tone="danger" /></TiltCard>
          <TiltCard><StatCard label={t('consent.expired')} value={stats.expired} icon={<AlertTriangle className="h-4 w-4" />} tone="muted" /></TiltCard>
        </div>

        {/* Info */}
        <Card className="glass-card border-primary/20 bg-primary/5">
          <CardContent className="p-4 flex items-start gap-3">
            <ShieldCheck className="h-5 w-5 text-primary mt-0.5" />
            <div>
              <p className="text-sm font-medium">{t('consent.subtitle')}</p>
              <p className="text-xs text-muted-foreground mt-1">
                You control access. Approve/deny requests and optionally use expiry. All actions are logged for security.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Pending list */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Pending requests</h2>
            <Badge variant={hasPending ? 'default' : 'outline'}>
              {hasPending ? `${requests.length} awaiting action` : 'No pending requests'}
            </Badge>
          </div>

          {loading ? (
            <div className="grid gap-3">
              <SkeletonRequestCard />
              <SkeletonRequestCard />
            </div>
          ) : !hasPending ? (
            <Card className="border-dashed">
              <CardContent className="p-10 text-center space-y-2">
                <p className="text-base font-semibold">No pending requests</p>
                <p className="text-sm text-muted-foreground">
                  When a doctor scans your Smart Health Card and requests access, it will appear here.
                </p>
                <div className="pt-4">
                  <Button variant="outline" onClick={fetchData}>
                    Check again
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {requests.map((r) => (
                <TiltCard key={r.id}>
                  <Card className="glass-card hover:border-primary/30 transition-colors">
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between gap-3">
                        <CardTitle className="text-base font-semibold text-primary">Request from Doctor</CardTitle>
                        <span className="text-xs text-muted-foreground whitespace-nowrap bg-secondary/10 px-2 py-1 rounded-full border border-secondary/20">
                          {new Date(r.created_at).toLocaleString()}
                        </span>
                      </div>
                    </CardHeader>

                    <CardContent className="space-y-4">
                      <div className="grid gap-3 md:grid-cols-3">
                        <div className="p-3 rounded-lg border border-white/10 bg-white/5">
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold">{t('consent.access_level')}</p>
                          <p className="text-sm font-medium mt-1 text-foreground">
                            {r.access_type ? r.access_type.toUpperCase().replace('_', ' ') : 'NOT SPECIFIED'}
                          </p>
                        </div>

                        <div className="p-3 rounded-lg border border-white/10 bg-white/5">
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold">{t('consent.duration')}</p>
                          <p className="text-sm font-medium mt-1 text-foreground">
                            {r.expires_at ? new Date(r.expires_at).toLocaleString() : 'Until revoked'}
                          </p>
                        </div>

                        <div className="p-3 rounded-lg border border-white/10 bg-white/5">
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold">Doctor ID</p>
                          <p className="text-[10px] font-mono break-all mt-1 text-muted-foreground">{r.doctor_id ?? 'Unknown'}</p>
                        </div>
                      </div>

                      <div className="p-3 rounded-lg border border-primary/10 bg-primary/5">
                        <p className="text-[10px] text-primary uppercase tracking-wider font-bold">{t('consent.reason')}</p>
                        <p className="text-sm mt-1 text-foreground italic">
                          "{r.reason ?? 'No specific reason provided.'}"
                        </p>
                      </div>

                      <Separator className="bg-white/10" />

                      <div className="flex flex-wrap items-center gap-3">
                        <Button
                          className="btn-gradient shadow-lg shadow-primary/20"
                          disabled={actionLoading === r.id}
                          onClick={() => openPinDialog(r.id, 'approve')}
                        >
                          <CheckCircle2 className="w-4 h-4 mr-2" />
                          {t('consent.approve')}
                        </Button>

                        <Button
                          variant="outline"
                          className="border-destructive/30 text-destructive hover:bg-destructive/10"
                          disabled={actionLoading === r.id}
                          onClick={() => openPinDialog(r.id, 'reject')}
                        >
                          <Ban className="w-4 h-4 mr-2" />
                          {t('consent.deny')}
                        </Button>

                        <p className="text-xs text-muted-foreground ml-auto flex items-center gap-1">
                          <ShieldCheck className="w-3 h-3" />
                          Protected by Smart PIN
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                </TiltCard>
              ))}
            </div>
          )}
        </section >
      </div >

      <Dialog open={pinDialogOpen} onOpenChange={setPinDialogOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Confirm with Smart PIN</DialogTitle>
            <DialogDescription>
              Enter your 6-digit Smart PIN to{' '}
              {pendingAction?.type === 'approve' ? 'approve this request' : 'deny this request'}.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <Input
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
              maxLength={6}
              className="text-center tracking-[0.4em] text-lg font-semibold"
              placeholder="••••••"
              autoFocus
            />
            {pinError ? <p className="text-xs text-destructive">{pinError}</p> : null}
          </div>

          <DialogFooter className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setPinDialogOpen(false)
                setPendingAction(null)
              }}
            >
              Cancel
            </Button>

            <Button
              variant={pendingAction?.type === 'approve' ? 'default' : 'destructive'}
              onClick={submitAction}
              disabled={actionLoading != null}
            >
              {pendingAction?.type === 'approve' ? 'Confirm approval' : 'Confirm deny'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
