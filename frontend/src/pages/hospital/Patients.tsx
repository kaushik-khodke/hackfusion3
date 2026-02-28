import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Users, ArrowRight, RefreshCw } from "lucide-react";

type Row = {
  patient_id: string;
  access_type: "read" | "read_write";
  expires_at: string | null;
  created_at: string;
};

function isActive(expiresAt: string | null) {
  if (!expiresAt) return true;
  return new Date(expiresAt).getTime() > Date.now();
}

export default function Patients() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  const activeRows = useMemo(() => rows.filter((r) => isActive(r.expires_at)), [rows]);

  const fetchPatients = async () => {
    setLoading(true);
    try {
      // View from Step 1: hospital_active_patients
      const { data, error } = await supabase
        .from("hospital_active_patients")
        .select("patient_id, access_type, expires_at, created_at")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setRows((data ?? []) as any);
    } catch (e) {
      console.error(e);
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPatients();
  }, []);

  return (
    <div className="mx-auto w-full max-w-7xl px-4 md:px-6 py-6 space-y-6 relative font-sans">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold font-heading">Hospital Patients</h1>
          <p className="text-sm text-muted-foreground">Patients who approved hospital access.</p>
        </div>
        <Button variant="outline" onClick={fetchPatients} className="gap-2">
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
      </div>

      <Card className="glass-card">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            Active consents
          </CardTitle>
          <Badge variant={activeRows.length > 0 ? "default" : "outline"}>{activeRows.length}</Badge>
        </CardHeader>

        <CardContent className="space-y-3">
          {loading ? (
            <p className="text-sm text-muted-foreground animate-pulse">Loading...</p>
          ) : activeRows.length === 0 ? (
            <div className="rounded-xl border border-dashed border-white/20 bg-white/5 p-8 text-center">
              <p className="text-sm font-semibold">No active patient consents yet</p>
              <p className="text-sm text-muted-foreground mt-1">Go to Scan and request consent.</p>
              <div className="pt-4">
                <Button onClick={() => navigate("/hospital/scan")} className="gap-2 btn-gradient">
                  Scan a patient <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ) : (
            activeRows.map((r) => (
              <div key={r.patient_id + r.created_at} className="rounded-xl border border-white/10 bg-white/5 p-4 hover:bg-white/10 transition-colors">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">Patient</p>
                    <p className="text-xs text-muted-foreground font-mono break-all">patient_id: {r.patient_id}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Expires:{" "}
                      <span className={isActive(r.expires_at) ? "text-primary" : "text-destructive"}>
                        {r.expires_at ? new Date(r.expires_at).toLocaleString() : "Never"}
                      </span>
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px] h-5 border-primary/20 text-primary">
                      {r.access_type.toUpperCase()}
                    </Badge>

                    {/* Later you can navigate to a hospital patient view page */}
                    <Button variant="outline" size="sm"   onClick={() => navigate(`/hospital/patient/${r.patient_id}`)}>

                      View Records
                    </Button>
                  </div>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
