import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Separator } from "@/components/ui/separator";
import { motion } from "framer-motion";
import { Activity, QrCode, Users, Clock, ArrowRight, CheckCircle2 } from "lucide-react";
import { TiltCard } from "@/components/ui/TiltCard";

type HospitalRow = {
  hospital_uid: string;
  name: string;
  phone?: string | null;
  address?: string | null;
};

type AccessReqRow = {
  id: string;
  patient_id: string;
  status: "pending" | "approved" | "rejected";
  access_type: "read" | "read_write";
  expires_at: string | null;
  created_at: string;
};

type DelegationReqRow = {
  id: string;
  doctor_id: string;
  patient_id: string;
  status: "pending" | "approved" | "rejected";
  access_type: "read" | "read_write";
  expires_at: string | null;
  created_at: string;
};

type MembershipRow = {
  doctor_id: string;
  status: "pending" | "approved" | "rejected";
};

type Stats = {
  activePatients: number;
  pendingPatientApprovals: number;
  pendingDoctorRequests: number;
  approvedDoctors: number;
};

function StatCard({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  tone: "primary" | "warning" | "success";
}) {
  const toneClasses =
    tone === "primary"
      ? "border-primary/20 bg-primary/5"
      : tone === "warning"
      ? "border-warning/20 bg-warning/5"
      : "border-emerald-500/20 bg-emerald-500/5";

  const textClasses =
    tone === "primary" ? "text-primary" : tone === "warning" ? "text-warning" : "text-emerald-500";

  return (
    <TiltCard>
      <Card className={`glass-card ${toneClasses} h-full`}>
        <CardContent className="p-6 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">{label}</p>
            <p className={`text-3xl font-bold mt-2 ${textClasses}`}>{value}</p>
          </div>
          <div className={`h-12 w-12 rounded-xl border bg-background/50 flex items-center justify-center ${textClasses}`}>
            {icon}
          </div>
        </CardContent>
      </Card>
    </TiltCard>
  );
}

function isActive(expiresAt: string | null) {
  if (!expiresAt) return true;
  return new Date(expiresAt).getTime() > Date.now();
}

export default function Dashboard() {
  const { profile } = useAuth();
  const navigate = useNavigate();

  const [hospital, setHospital] = useState<HospitalRow | null>(null);
  const [stats, setStats] = useState<Stats>({
    activePatients: 0,
    pendingPatientApprovals: 0,
    pendingDoctorRequests: 0,
    approvedDoctors: 0,
  });

  const [recentPatientRequests, setRecentPatientRequests] = useState<AccessReqRow[]>([]);
  const [recentDoctorRequests, setRecentDoctorRequests] = useState<DelegationReqRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const headerTitle = useMemo(() => {
    const n = hospital?.name?.trim();
    return n ? `Welcome, ${n}` : "Hospital Dashboard";
  }, [hospital?.name]);

  const fetchHospitalDashboard = async () => {
    setLoading(true);
    try {
      // 1) Hospital profile (RLS allows hospital to read own row)
      const { data: h, error: hErr } = await supabase
        .from("hospitals")
        .select("hospital_uid, name, phone, address")
        .maybeSingle();

      if (hErr) throw hErr;
      setHospital((h as any) ?? null);

      // 2) Patient->hospital access requests
      const { data: har, error: harErr } = await supabase
        .from("hospital_access_requests")
        .select("id, patient_id, status, access_type, expires_at, created_at")
        .order("created_at", { ascending: false })
        .limit(8);

      if (harErr) throw harErr;

      // 3) Doctor->hospital delegation requests
      const { data: hdpr, error: hdprErr } = await supabase
        .from("hospital_doctor_patient_requests")
        .select("id, doctor_id, patient_id, status, access_type, expires_at, created_at")
        .order("created_at", { ascending: false })
        .limit(8);

      if (hdprErr) throw hdprErr;

      // 4) Hospital doctors membership
      const { data: members, error: memErr } = await supabase
        .from("hospital_doctors")
        .select("doctor_id, status");

      if (memErr) throw memErr;

      const allAccess = (har ?? []) as AccessReqRow[];
      const allDelegations = (hdpr ?? []) as DelegationReqRow[];
      const allMembers = (members ?? []) as MembershipRow[];

      const activePatients = allAccess.filter((r) => r.status === "approved" && isActive(r.expires_at)).length;
      const pendingPatientApprovals = allAccess.filter((r) => r.status === "pending").length;
      const pendingDoctorRequests = allDelegations.filter((r) => r.status === "pending").length;
      const approvedDoctors = allMembers.filter((m) => m.status === "approved").length;

      setStats({ activePatients, pendingPatientApprovals, pendingDoctorRequests, approvedDoctors });
      setRecentPatientRequests(allAccess);
      setRecentDoctorRequests(allDelegations);
      setLastUpdated(new Date());
    } catch (e: any) {
      console.error(e);
      // Keep UI stable; show minimal info
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHospitalDashboard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id]);

  return (
    <div className="mx-auto w-full max-w-7xl px-4 md:px-6 py-6 space-y-8 relative font-sans selection:bg-primary/30">
      <div className="fixed inset-0 -z-10 bg-background" />
      <div className="absolute inset-0 bg-grid-pattern opacity-20" />
      <div className="absolute inset-0 mask-radial-faded bg-background/0" />

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-4xl font-bold tracking-tight font-heading gradient-text">{headerTitle}</h1>
          <p className="text-sm text-muted-foreground mt-2 font-medium">
            {hospital?.hospital_uid ? `Hospital ID: ${hospital.hospital_uid}` : "Complete hospital profile to get ID"}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {lastUpdated ? (
            <span className="text-xs text-muted-foreground bg-secondary/10 px-2 py-1 rounded-full border border-secondary/20">
              Upda <span className="font-medium text-secondary">{lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
            </span>
          ) : null}
          <Button variant="outline" size="sm" onClick={fetchHospitalDashboard} className="shadow-sm hover:shadow-md transition-all">
            Refresh
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <TiltCard>
            <Card className="glass-card h-full">
              <CardContent className="p-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div className="flex items-start gap-4">
                  <div className="h-12 w-12 rounded-2xl border bg-primary/10 flex items-center justify-center text-primary">
                    <QrCode className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="text-lg font-semibold">Scan Patient QR</p>
                    <p className="text-sm text-muted-foreground">Request patient consent for the hospital.</p>
                  </div>
                </div>

                <Button onClick={() => navigate("@/hospital/Scan")} className="gap-2 btn-gradient shadow-lg shadow-primary/20">
                  Scan Now <ArrowRight className="h-4 w-4" />
                </Button>
              </CardContent>
            </Card>
          </TiltCard>
        </div>

        <TiltCard>
          <Card className="glass-card border-emerald-500/20 bg-emerald-500/5 h-full">
            <CardContent className="p-6 flex items-center justify-between">
              <div className="flex items-start gap-3">
                <div className="h-12 w-12 rounded-2xl border bg-emerald-500/10 flex items-center justify-center text-emerald-600">
                  <Activity className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">Quick Overview</p>
                  <div className="flex gap-4 mt-1">
                    <div>
                      <p className="text-2xl font-bold text-foreground">{stats.activePatients}</p>
                      <p className="text-[10px] uppercase text-muted-foreground">Active patients</p>
                    </div>
                    <div className="w-px h-8 bg-border" />
                    <div>
                      <p className="text-2xl font-bold text-foreground">{stats.pendingDoctorRequests}</p>
                      <p className="text-[10px] uppercase text-muted-foreground">Doctor requests</p>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TiltCard>
      </div>

      <div className="grid gap-6 md:grid-cols-4">
        <StatCard label="Active patients" value={stats.activePatients} icon={<Users className="h-5 w-5" />} tone="primary" />
        <StatCard label="Pending patient approvals" value={stats.pendingPatientApprovals} icon={<Clock className="h-5 w-5" />} tone="warning" />
        <StatCard label="Pending doctor requests" value={stats.pendingDoctorRequests} icon={<Clock className="h-5 w-5" />} tone="warning" />
        <StatCard label="Approved doctors" value={stats.approvedDoctors} icon={<CheckCircle2 className="h-5 w-5" />} tone="success" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="glass-card">
          <CardHeader className="flex flex-row items-start justify-between gap-3 border-b border-white/5 pb-4 mb-4">
            <div>
              <CardTitle className="text-xl font-heading">Recent patient requests</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">Requests the hospital sent to patients.</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => navigate("/hospital/patients")}>
              View patients
            </Button>
          </CardHeader>

          <CardContent className="space-y-3">
            {loading ? (
              <p className="text-sm text-muted-foreground animate-pulse">Loading...</p>
            ) : recentPatientRequests.length === 0 ? (
              <div className="rounded-xl border border-dashed border-white/20 bg-white/5 p-8 text-center">
                <p className="text-sm font-semibold">No requests yet</p>
                <p className="text-sm text-muted-foreground mt-1">Go to Scan to request patient consent.</p>
              </div>
            ) : (
              recentPatientRequests.map((r) => {
                const active = r.status === "approved" && isActive(r.expires_at);
                return (
                  <div key={r.id} className="rounded-xl border border-white/10 bg-white/5 p-4 hover:bg-white/10 transition-colors">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={r.status === "pending" ? "secondary" : r.status === "approved" ? "default" : "destructive"}>
                        {r.status.toUpperCase()}
                      </Badge>
                      <Badge variant="outline" className="text-[10px] h-5 border-primary/20 text-primary">
                        {(r.access_type ?? "read").toUpperCase()}
                      </Badge>
                      {r.status === "approved" ? (
                        <Badge variant={active ? "default" : "secondary"} className="text-[10px] h-5">
                          {active ? "ACTIVE" : "EXPIRED"}
                        </Badge>
                      ) : null}
                    </div>
                    <p className="text-xs text-muted-foreground font-mono break-all mt-2">patient_id: {r.patient_id}</p>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardHeader className="flex flex-row items-start justify-between gap-3 border-b border-white/5 pb-4 mb-4">
            <div>
              <CardTitle className="text-xl font-heading">Doctor delegation requests</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">Doctors asking access via hospital.</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => navigate("/hospital/requests")}>
              Review
            </Button>
          </CardHeader>

          <CardContent className="space-y-3">
            {loading ? (
              <p className="text-sm text-muted-foreground animate-pulse">Loading...</p>
            ) : recentDoctorRequests.length === 0 ? (
              <div className="rounded-xl border border-dashed border-white/20 bg-white/5 p-8 text-center">
                <p className="text-sm font-semibold">No doctor requests yet</p>
                <p className="text-sm text-muted-foreground mt-1">Doctors will appear here after requesting delegation.</p>
              </div>
            ) : (
              recentDoctorRequests.map((r) => (
                <div key={r.id} className="rounded-xl border border-white/10 bg-white/5 p-4 hover:bg-white/10 transition-colors">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={r.status === "pending" ? "secondary" : r.status === "approved" ? "default" : "destructive"}>
                      {r.status.toUpperCase()}
                    </Badge>
                    <Badge variant="outline" className="text-[10px] h-5 border-primary/20 text-primary">
                      {(r.access_type ?? "read").toUpperCase()}
                    </Badge>
                  </div>

                  <Separator className="my-3" />

                  <p className="text-xs text-muted-foreground font-mono break-all">doctor_id: {r.doctor_id}</p>
                  <p className="text-xs text-muted-foreground font-mono break-all">patient_id: {r.patient_id}</p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
