import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Timeline } from "@/components/ui/Timeline";

import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";

import { ArrowLeft, User, Calendar, FileText, AlertCircle, Eye, Download } from "lucide-react";

type ConsentRow = {
  id: string;
  patient_id: string;
  doctor_id: string;
  status: string;
  access_type: string;
  expires_at: string | null;
};

type PatientRow = {
  id: string;
  user_id: string;
  uhid?: string | null;
};

type ProfileRow = {
  id: string;
  fullname?: string | null;
};

type RecordRow = {
  id: string;
  record_type: string;
  title: string;
  record_date: string;
  doctor_name?: string | null;
  file_url?: string | null;
  file_name?: string | null;
  file_size?: number | null;
  created_at?: string;
};

export function PatientView() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { patientId } = useParams<{ patientId: string }>();

  const [doctorRowId, setDoctorRowId] = useState<string | null>(null);

  const [patient, setPatient] = useState<PatientRow | null>(null);
  const [profile, setProfile] = useState<ProfileRow | null>(null);

  const [records, setRecords] = useState<RecordRow[]>([]);
  const [consent, setConsent] = useState<ConsentRow | null>(null);

  const [hasAccess, setHasAccess] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [pageError, setPageError] = useState<string>("");

  const isExpired = useMemo(() => {
    if (!consent?.expires_at) return false;
    return new Date(consent.expires_at) < new Date();
  }, [consent?.expires_at]);

  useEffect(() => {
    const loadDoctorRow = async () => {
      if (!user?.id) return;

      const { data: doctor, error } = await supabase
        .from("doctors")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (error) {
        console.error("Failed to load doctor row:", error);
        setDoctorRowId(null);
        return;
      }

      setDoctorRowId(doctor?.id ?? null);
    };

    loadDoctorRow();
  }, [user?.id]);

  const fetchPatientAndProfile = async (pid: string) => {
    // Only select columns that definitely exist (your errors show health_id/healthid do NOT exist). [file:476]
    const { data: p, error: pErr } = await supabase
      .from("patients")
      .select("id,user_id,uhid")
      .eq("id", pid)
      .limit(1)
      .maybeSingle();

    if (pErr) throw pErr;

    setPatient(p ?? null);

    if (!p?.user_id) {
      setProfile(null);
      return;
    }

    const { data: prof, error: profErr } = await supabase
      .from("profiles")
      .select("id,fullname")
      .eq("id", p.user_id)
      .limit(1)
      .maybeSingle();

    if (profErr) throw profErr;
    setProfile(prof ?? null);
  };

  const fetchRecords = async (pid: string) => {
    const { data, error } = await supabase
      .from("records")
      .select("id,record_type,title,record_date,doctor_name,file_url,file_name,file_size,created_at")
      .eq("patient_id", pid)
      .order("record_date", { ascending: false });

    if (error) throw error;
    setRecords((data ?? []) as RecordRow[]);
  };

  useEffect(() => {
    const checkAccess = async () => {
      if (!user?.id || !patientId || !doctorRowId) return;

      setIsLoading(true);
      setPageError("");

      try {
        const { data: consents, error: consentErr } = await supabase
          .from("consent_requests")
          .select("id,patient_id,doctor_id,status,access_type,expires_at")
          .eq("patient_id", patientId)
          .eq("doctor_id", doctorRowId)
          .eq("status", "approved")
          .order("expires_at", { ascending: false, nullsFirst: false })
          .limit(1);

        if (consentErr) throw consentErr;

        const consentData = consents && consents.length > 0 ? consents[0] : null;

        if (!consentData) {
          setConsent(null);
          setHasAccess(false);
          setPatient(null);
          setProfile(null);
          setRecords([]);
          return;
        }

        setConsent(consentData);

        const expired = consentData.expires_at ? new Date(consentData.expires_at) < new Date() : false;
        setHasAccess(!expired);

        if (expired) {
          setPatient(null);
          setProfile(null);
          setRecords([]);
          return;
        }

        await fetchPatientAndProfile(patientId);
        await fetchRecords(patientId);
      } catch (e: any) {
        console.error(e);
        setPageError(e?.message ?? "Something went wrong");
      } finally {
        setIsLoading(false);
      }
    };

    checkAccess();
  }, [user?.id, patientId, doctorRowId]);

  const openRecordUrl = (record: RecordRow, mode: "view" | "download" = "view") => {
    if (!record.file_url) {
      setPageError("No file URL found for this record.");
      return;
    }

    if (mode === "view") {
      window.open(record.file_url, "_blank");
      return;
    }

    const a = document.createElement("a");
    a.href = record.file_url;
    a.download = record.file_name || "record";
    a.target = "_blank";
    a.click();
  };

  const displayName = profile?.fullname ?? "Patient";
  const startId = patient?.uhid ?? "—";
  const accessLabel =
    consent?.access_type === "read_write" ? t("doctor.read_write") : t("doctor.read_only");

  const stats = useMemo(() => {
    return {
      total: records.length,
      prescriptions: records.filter((r) => r.record_type === "prescription").length,
      labReports: records.filter((r) => r.record_type === "lab_report").length,
      imaging: records.filter((r) => r.record_type === "imaging").length,
    };
  }, [records]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!hasAccess) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="p-8 text-center">
            <AlertCircle className="w-16 h-16 mx-auto text-error mb-4" />
            <h2 className="text-2xl font-bold mb-2">{t("doctor.access_denied")}</h2>
            <p className="text-muted-foreground mb-6">
              {consent?.status === "pending"
                ? "Your access request is pending patient approval."
                : consent?.expires_at && new Date(consent.expires_at) < new Date()
                  ? t("doctor.access_expired")
                  : "You do not have permission to view this patient's records."}
            </p>
            <Button onClick={() => navigate("/doctor/dashboard")}>Back to Dashboard</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative overflow-hidden font-sans">
      <div className="fixed inset-0 -z-10 bg-background" />
      <div className="container mx-auto px-4 py-8">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
          <Button
            variant="ghost"
            onClick={() => navigate("/doctor/dashboard")}
            className="mb-4 text-muted-foreground hover:text-primary"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            {t("doctor.back_dashboard")}
          </Button>

          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-4xl font-bold mb-2 font-heading">{displayName}</h1>
              <div className="flex items-center gap-3 text-muted-foreground">
                <span className="flex items-center gap-1">
                  <User className="w-4 h-4" />
                  Start ID: {startId}
                </span>
              </div>
            </div>

            <Badge className="px-3 py-1 text-sm bg-primary/10 text-primary hover:bg-primary/20 border-primary/20">
              {accessLabel}
            </Badge>
          </div>
        </motion.div>

        <Card className="mb-8 glass-card border-primary/20 bg-primary/5">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium mb-1 text-primary">{t("doctor.your_access")}</p>
                <p className="text-xs text-muted-foreground">
                  {consent?.access_type === "read_write" ? "You can view and add records" : "You can view records only"}
                </p>
              </div>

              <div className="text-right">
                <p className="text-sm font-medium mb-1 flex items-center justify-end gap-1">
                  <Calendar className="w-4 h-4" /> Expires
                </p>
                <p className="text-xs text-muted-foreground font-mono">
                  {consent?.expires_at ? new Date(consent.expires_at).toLocaleDateString() : "Never"}
                </p>
              </div>
            </div>

            {pageError ? (
              <div className="mt-3 p-3 bg-destructive/10 border border-destructive/30 rounded-lg text-sm text-destructive">
                {pageError}
              </div>
            ) : null}
          </CardContent>
        </Card>

        <div className="grid md:grid-cols-4 gap-4 mb-8">
          <Card className="glass-card hover:border-primary/40 transition-colors">
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground mb-1 uppercase tracking-wide">Total Records</p>
              <p className="text-3xl font-bold text-foreground">{stats.total}</p>
            </CardContent>
          </Card>

          <Card className="glass-card hover:border-blue-400/40 transition-colors">
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground mb-1 uppercase tracking-wide">Prescriptions</p>
              <p className="text-3xl font-bold text-blue-500">{stats.prescriptions}</p>
            </CardContent>
          </Card>

          <Card className="glass-card hover:border-purple-400/40 transition-colors">
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground mb-1 uppercase tracking-wide">Lab Reports</p>
              <p className="text-3xl font-bold text-purple-500">{stats.labReports}</p>
            </CardContent>
          </Card>

          <Card className="glass-card hover:border-orange-400/40 transition-colors">
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground mb-1 uppercase tracking-wide">Imaging</p>
              <p className="text-3xl font-bold text-orange-500">{stats.imaging}</p>
            </CardContent>
          </Card>
        </div>

        <Card className="glass-card">
          <CardHeader>
            <CardTitle>{t("doctor.patient_records")}</CardTitle>
          </CardHeader>

          <CardContent>
            {records.length === 0 ? (
              <div className="text-center py-12">
                <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
                  <FileText className="w-8 h-8 text-muted-foreground" />
                </div>
                <p className="text-muted-foreground">{t("patient.no_records")}</p>
              </div>
            ) : (
              <Timeline
                items={records.map((record) => ({
                  title: record.title,
                  date: record.record_date ? new Date(record.record_date).toLocaleDateString() : "",
                  description: `${record.record_type} • ${record.doctor_name || "Unknown"}`,
                  icon: <FileText className="w-4 h-4" />,
                  actions: (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-xl gap-2"
                        onClick={() => openRecordUrl(record, "view")}
                        disabled={!record.file_url}
                      >
                        <Eye className="w-4 h-4" />
                        View Record
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-xl gap-2"
                        onClick={() => openRecordUrl(record, "download")}
                        disabled={!record.file_url}
                      >
                        <Download className="w-4 h-4" />
                        Download
                      </Button>
                    </div>
                  ),
                }))}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
