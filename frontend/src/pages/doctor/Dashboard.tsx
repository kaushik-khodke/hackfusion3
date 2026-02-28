import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import {
  QrCode,
  Users,
  Clock,
  CheckCircle2,
  RefreshCcw,
  ArrowRight,
  Stethoscope,
  UserCheck,
  FileText,
} from "lucide-react";

type DoctorRow = {
  id: string;
  user_id: string;
  name: string | null;
  hospital: string | null;
  license_id: string | null;
};

type ConsentRow = {
  id: string;
  patient_id: string;
  doctor_id: string;
  status: string;
  expires_at: string | null;
  created_at: string;
};

type PatientRow = {
  id: string;
  uhid: string;
  full_name?: string | null;
};

function formatTime(ts: string | null) {
  if (!ts) return "Never";
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return String(ts);
  }
}

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.05, delayChildren: 0.05 },
  },
};

const item = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0 },
};

export default function Dashboard() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const [doctorData, setDoctorData] = useState<DoctorRow | null>(null);
  const [doctorLoading, setDoctorLoading] = useState(true);
  const [approvedConsents, setApprovedConsents] = useState<ConsentRow[]>([]);
  const [pendingConsents, setPendingConsents] = useState<ConsentRow[]>([]);
  const [consentsLoading, setConsentsLoading] = useState(true);
  const [patients, setPatients] = useState<PatientRow[]>([]);
  const [patientsLoading, setPatientsLoading] = useState(true);
  const [error, setError] = useState<string>("");
  const [lastUpdated, setLastUpdated] = useState<string>("");

  const stats = useMemo(() => {
    const uniquePatientIds = new Set<string>();
    [...approvedConsents, ...pendingConsents].forEach((c) => uniquePatientIds.add(c.patient_id));
    return {
      uniquePatients: uniquePatientIds.size,
      pending: pendingConsents.length,
      active: approvedConsents.length,
    };
  }, [approvedConsents, pendingConsents]);

  const loadAll = useCallback(async () => {
    setError("");
    setDoctorLoading(true);
    setConsentsLoading(true);
    setPatientsLoading(true);

    try {
      const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
      if (sessionErr) throw sessionErr;

      const uid = sessionData.session?.user?.id ?? null;
      setAuthUserId(uid);

      if (!uid) {
        setDoctorData(null);
        setApprovedConsents([]);
        setPendingConsents([]);
        setPatients([]);
        setError("Please login.");
        return;
      }

      const { data: doc, error: docErr } = await supabase
        .from("doctors")
        .select("id,user_id,name,hospital,license_id")
        .eq("user_id", uid)
        .maybeSingle();

      if (docErr) throw docErr;

      if (!doc) {
        setDoctorData(null);
        setApprovedConsents([]);
        setPendingConsents([]);
        setPatients([]);
        setError("Doctor profile not found. Please complete doctor setup.");
        return;
      }

      setDoctorData(doc);

      const { data: consents, error: consErr } = await supabase
        .from("consent_requests")
        .select("id,patient_id,doctor_id,status,expires_at,created_at")
        .eq("doctor_id", doc.id)
        .order("created_at", { ascending: false });

      if (consErr) throw consErr;

      const approved = (consents ?? []).filter((c) => c.status === "approved");
      const pending = (consents ?? []).filter((c) => c.status === "pending");
      setApprovedConsents(approved);
      setPendingConsents(pending);

      const patientIds = Array.from(new Set((consents ?? []).map((c) => c.patient_id)));
      if (patientIds.length === 0) {
        setPatients([]);
      } else {
        const { data: pats, error: patsErr } = await supabase
          .from("patients")
          .select("id,uhid,full_name")
          .in("id", patientIds);
        if (patsErr) throw patsErr;
        setPatients(pats ?? []);
      }

      setLastUpdated(new Date().toLocaleTimeString());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setDoctorLoading(false);
      setConsentsLoading(false);
      setPatientsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const patientById = useMemo(() => {
    const map = new Map<string, PatientRow>();
    patients.forEach((p) => map.set(p.id, p));
    return map;
  }, [patients]);

  const goScan = () => navigate("/doctor/scan");
  const viewPatientRecords = (patientId: string) => navigate(`/doctor/patient/${patientId}`);

  if (!authUserId && !doctorLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <Card className="glass-card rounded-2xl p-6 max-w-md border-destructive/20">
          <p className="text-muted-foreground text-center">{error || "Please login."}</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative overflow-hidden font-sans selection:bg-primary/30">
      {/* Blurred, soft background */}
      <div className="dashboard-backdrop" aria-hidden />
      <div className="absolute inset-0 -z-10 bg-grid-pattern opacity-[0.06]" />
      <div className="absolute top-0 right-0 w-[50%] h-[55%] rounded-full bg-primary/10 blur-3xl -z-10" />
      <div className="absolute bottom-0 left-0 w-[45%] h-[50%] rounded-full bg-teal-400/10 blur-3xl -z-10" />
      <div className="absolute inset-0 -z-10 mask-radial-faded bg-background/20" />

      <div className="container mx-auto px-4 py-8 relative">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-8"
        >
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-2 text-sm font-medium text-primary mb-4">
              <Stethoscope className="h-4 w-4" />
              Doctor Dashboard
            </div>
            <h1 className="text-3xl md:text-4xl font-bold font-heading tracking-tight text-foreground mb-2">
              Welcome back
            </h1>
            <p className="text-muted-foreground">
              {doctorData?.hospital ?? "—"} • License: {doctorData?.license_id ?? "N/A"}
            </p>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            {lastUpdated ? (
              <span className="text-xs text-muted-foreground border border-border/60 rounded-full px-3 py-1.5 bg-muted/30">
                Updated {lastUpdated}
              </span>
            ) : null}
            <Button
              variant="outline"
              onClick={loadAll}
              disabled={doctorLoading || consentsLoading}
              className="rounded-xl gap-2"
            >
              <RefreshCcw className="h-4 w-4" />
              Refresh
            </Button>
          </div>
        </motion.div>

        {error ? (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          >
            {error}
          </motion.div>
        ) : null}

        {/* Top CTA: Scan */}
        <motion.div
          variants={container}
          initial="hidden"
          animate="show"
          className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8"
        >
          <motion.div variants={item} className="lg:col-span-2">
            <Card className="glass-card rounded-2xl overflow-hidden border-primary/15 shadow-lg shadow-primary/5 hover:border-primary/25 transition-colors">
              <CardContent className="p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
                <div className="flex items-start gap-4">
                  <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-primary/20 to-teal-500/20 flex items-center justify-center flex-shrink-0">
                    <QrCode className="w-7 h-7 text-primary" />
                  </div>
                  <div>
                    <h2 className="font-semibold text-lg font-heading text-foreground mb-1">
                      Scan Patient QR
                    </h2>
                    <p className="text-sm text-muted-foreground max-w-md">
                      Instantly request access to patient records via QR code
                    </p>
                  </div>
                </div>
                <Button
                  onClick={goScan}
                  className="w-full sm:w-auto rounded-xl gradient-primary gap-2 h-12 px-6"
                >
                  Scan Now
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div variants={item}>
            <Card className="glass-card rounded-2xl overflow-hidden border-border/50 h-full">
              <CardContent className="p-6">
                <p className="text-sm font-medium text-muted-foreground mb-3">Quick Overview</p>
                <div className="flex gap-6">
                  <div>
                    <p className="text-3xl font-bold font-heading text-foreground">{stats.uniquePatients}</p>
                    <p className="text-xs text-muted-foreground uppercase tracking-wider mt-0.5">Patients</p>
                  </div>
                  <div>
                    <p className="text-3xl font-bold font-heading text-amber-600 dark:text-amber-400">
                      {stats.pending}
                    </p>
                    <p className="text-xs text-muted-foreground uppercase tracking-wider mt-0.5">Pending</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </motion.div>

        {/* Stats */}
        <motion.div
          variants={container}
          initial="hidden"
          animate="show"
          className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8"
        >
          <motion.div variants={item}>
            <Card className="glass-card rounded-2xl overflow-hidden border-border/50">
              <CardContent className="p-6 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">My Patients</p>
                  <p className="text-3xl font-bold font-heading text-primary">{stats.uniquePatients}</p>
                </div>
                <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Users className="w-6 h-6 text-primary" />
                </div>
              </CardContent>
            </Card>
          </motion.div>
          <motion.div variants={item}>
            <Card className="glass-card rounded-2xl overflow-hidden border-amber-500/20">
              <CardContent className="p-6 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">Pending Requests</p>
                  <p className="text-3xl font-bold font-heading text-amber-600 dark:text-amber-400">
                    {stats.pending}
                  </p>
                </div>
                <div className="h-12 w-12 rounded-xl bg-amber-500/10 flex items-center justify-center">
                  <Clock className="w-6 h-6 text-amber-600 dark:text-amber-400" />
                </div>
              </CardContent>
            </Card>
          </motion.div>
          <motion.div variants={item}>
            <Card className="glass-card rounded-2xl overflow-hidden border-emerald-500/20">
              <CardContent className="p-6 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">Active Consents</p>
                  <p className="text-3xl font-bold font-heading text-emerald-600 dark:text-emerald-400">
                    {stats.active}
                  </p>
                </div>
                <div className="h-12 w-12 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                  <CheckCircle2 className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </motion.div>

        {/* Active Consents */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="mb-8"
        >
          <Card className="glass-card rounded-2xl overflow-hidden border-border/50">
            <CardHeader className="pb-2">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <CardTitle className="flex items-center gap-2 text-lg font-heading">
                    <UserCheck className="w-5 h-5 text-muted-foreground" />
                    Active Consents
                  </CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">
                    Patients who approved your access. Use “View Records” to open their health records.
                  </p>
                </div>
                <span className="text-xs font-medium text-muted-foreground border border-border/60 rounded-full px-3 py-1.5 bg-muted/30 w-fit">
                  {approvedConsents.length === 0 ? "No approvals" : `${approvedConsents.length} approved`}
                </span>
              </div>
            </CardHeader>
            <CardContent className="p-6 pt-2">
              {consentsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="h-8 w-8 rounded-lg border-2 border-primary border-t-transparent animate-spin" />
                </div>
              ) : approvedConsents.length === 0 ? (
                <div className="text-center py-12 rounded-xl bg-muted/30 border border-dashed border-border/60">
                  <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-3">
                    <UserCheck className="w-7 h-7 text-muted-foreground" />
                  </div>
                  <p className="font-semibold text-foreground mb-1">No active consents yet</p>
                  <p className="text-sm text-muted-foreground mb-5">
                    Ask the patient to approve your request from their Consent page.
                  </p>
                  <Button variant="outline" onClick={goScan} className="rounded-xl gap-2">
                    Scan a patient QR
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  {approvedConsents.map((c) => {
                    const p = patientById.get(c.patient_id);
                    return (
                      <motion.div
                        key={c.id}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="rounded-xl border border-border/60 bg-muted/20 p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4"
                      >
                        <div className="min-w-0">
                          <p className="font-semibold text-foreground">Patient</p>
                          <p className="text-sm text-muted-foreground">
                            UHID: {p?.uhid ?? "—"} • ID: {c.patient_id.slice(0, 8)}…
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            Expires: {formatTime(c.expires_at)}
                          </p>
                        </div>
                        <div className="flex gap-3 flex-shrink-0">
                          <Button
                            variant="outline"
                            onClick={() => viewPatientRecords(c.patient_id)}
                            className="rounded-xl gap-2"
                          >
                            <FileText className="h-4 w-4" />
                            View Records
                          </Button>
                          <Button onClick={goScan} className="rounded-xl gradient-primary gap-2">
                            Scan
                          </Button>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* My Patients */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
        >
          <Card className="glass-card rounded-2xl overflow-hidden border-border/50">
            <CardHeader className="pb-2">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <CardTitle className="flex items-center gap-2 text-lg font-heading">
                  <Users className="w-5 h-5 text-muted-foreground" />
                  My Patients
                </CardTitle>
                <span className="text-xs font-medium text-muted-foreground border border-border/60 rounded-full px-3 py-1.5 bg-muted/30 w-fit">
                  {patients.length} total
                </span>
              </div>
            </CardHeader>
            <CardContent className="p-6 pt-2">
              {patientsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="h-8 w-8 rounded-lg border-2 border-primary border-t-transparent animate-spin" />
                </div>
              ) : patients.length === 0 ? (
                <div className="text-center py-12 rounded-xl bg-muted/30 border border-dashed border-border/60">
                  <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-3">
                    <Users className="w-7 h-7 text-muted-foreground" />
                  </div>
                  <p className="font-semibold text-foreground mb-1">No patients yet</p>
                  <p className="text-sm text-muted-foreground mb-5">
                    Scan a patient QR to request access.
                  </p>
                  <Button onClick={goScan} className="rounded-xl gradient-primary gap-2">
                    Scan QR
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {patients.map((p) => (
                    <div
                      key={p.id}
                      className="rounded-xl border border-border/60 bg-muted/20 p-4 flex items-center justify-between gap-4"
                    >
                      <div>
                        <p className="font-semibold text-foreground">{p.full_name ?? "Patient"}</p>
                        <p className="text-sm text-muted-foreground">UHID: {p.uhid}</p>
                      </div>
                      <Button
                        variant="outline"
                        onClick={() => viewPatientRecords(p.id)}
                        className="rounded-xl gap-2"
                      >
                        <FileText className="h-4 w-4" />
                        View Records
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
