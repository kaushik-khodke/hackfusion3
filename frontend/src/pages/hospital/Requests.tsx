import React, { useEffect, useState } from "react";
import { supabase, setHospitalDelegationStatusRPC } from "@/lib/supabase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Separator } from "@/components/ui/separator";
import { CheckCircle2, XCircle, Clock } from "lucide-react";

type DelegationReq = {
  id: string;
  doctor_id: string;
  patient_id: string;
  status: "pending" | "approved" | "rejected";
  access_type: "read" | "read_write";
  expires_at: string | null;
  created_at: string;
  reason?: string | null;
};

export default function Requests() {
  const [rows, setRows] = useState<DelegationReq[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const fetchRequests = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("hospital_doctor_patient_requests")
        .select("id, doctor_id, patient_id, status, access_type, expires_at, created_at, reason")
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
    fetchRequests();
  }, []);

  const setStatus = async (id: string, status: "approved" | "rejected") => {
    setBusyId(id);
    try {
      await setHospitalDelegationStatusRPC({ requestId: id, status });
      await fetchRequests();
    } catch (e: any) {
      alert(e?.message || "Failed to update status");
    } finally {
      setBusyId(null);
    }
  };

  const pending = rows.filter((r) => r.status === "pending");

  return (
    <div className="mx-auto w-full max-w-7xl px-4 md:px-6 py-6 space-y-6 relative font-sans">
      <div>
        <h1 className="text-3xl font-bold font-heading">Doctor Requests</h1>
        <p className="text-sm text-muted-foreground">
          Approve or reject doctor delegation requests (doctor wants access via hospital).
        </p>
      </div>

      <Card className="glass-card">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-primary" />
            Pending
          </CardTitle>
          <Badge variant={pending.length > 0 ? "default" : "outline"}>{pending.length}</Badge>
        </CardHeader>

        <CardContent className="space-y-3">
          {loading ? (
            <p className="text-sm text-muted-foreground animate-pulse">Loading...</p>
          ) : rows.length === 0 ? (
            <div className="rounded-xl border border-dashed border-white/20 bg-white/5 p-8 text-center">
              <p className="text-sm font-semibold">No requests</p>
              <p className="text-sm text-muted-foreground mt-1">Doctors will show here after requesting.</p>
            </div>
          ) : (
            rows.map((r) => (
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

                {r.reason ? <p className="text-sm text-muted-foreground mt-3">{r.reason}</p> : null}

                <div className="flex gap-2 mt-4">
                  <Button
                    size="sm"
                    className="gap-2"
                    disabled={r.status !== "pending" || busyId === r.id}
                    onClick={() => setStatus(r.id, "approved")}
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    className="gap-2"
                    disabled={r.status !== "pending" || busyId === r.id}
                    onClick={() => setStatus(r.id, "rejected")}
                  >
                    <XCircle className="h-4 w-4" />
                    Reject
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
