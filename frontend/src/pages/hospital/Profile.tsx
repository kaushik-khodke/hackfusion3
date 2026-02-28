import React, { useEffect, useMemo, useState } from "react";
import { supabase, upsertHospitalProfileRPC } from "@/lib/supabase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { TiltCard } from "@/components/ui/TiltCard";
import { Building2, QrCode, Save, RefreshCw } from "lucide-react";

type HospitalRow = {
  hospital_uid: string | null;
  name: string | null;
  phone: string | null;
  address: string | null;
  profile_completed?: boolean | null;
};

function QRBox({ value }: { value: string }) {
  // Simple text QR fallback: show payload; you can swap in a QR component later.
  return (
    <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4">
      <p className="text-xs text-muted-foreground mb-2">QR payload</p>
      <pre className="text-xs font-mono overflow-auto">{value}</pre>
      <p className="text-[11px] text-muted-foreground mt-2">
        (You can render this as an actual QR using a QR component later.)
      </p>
    </div>
  );
}

export default function HospitalProfile() {
  const [hospital, setHospital] = useState<HospitalRow | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const qrPayload = useMemo(() => {
    const uid = hospital?.hospital_uid?.trim();
    if (!uid) return "";
    return JSON.stringify({ hospital_uid: uid });
  }, [hospital?.hospital_uid]);

  const fetchHospital = async () => {
    setLoading(true);
    setErr("");
    try {
      const { data, error } = await supabase
        .from("hospitals")
        .select("hospital_uid, name, phone, address, profile_completed")
        .maybeSingle();

      if (error) throw error;

      const h = (data ?? null) as any as HospitalRow | null;
      setHospital(h);

      setName(h?.name ?? "");
      setPhone(h?.phone ?? "");
      setAddress(h?.address ?? "");
    } catch (e: any) {
      console.error(e);
      setErr(e?.message || "Failed to load hospital profile");
      setHospital(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHospital();
  }, []);

  const save = async () => {
    setSaving(true);
    setErr("");
    try {
      if (name.trim().length < 2) throw new Error("Hospital name must be at least 2 characters");
      await upsertHospitalProfileRPC({ name: name.trim(), phone: phone.trim() || null, address: address.trim() || null });
      await fetchHospital();
      alert("✅ Hospital profile saved");
    } catch (e: any) {
      console.error(e);
      setErr(e?.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-5xl px-4 md:px-6 py-6 space-y-6 relative font-sans">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold font-heading">Hospital Profile</h1>
          <p className="text-sm text-muted-foreground">Your Hospital ID is used by doctors to request membership.</p>
        </div>
        <Button variant="outline" onClick={fetchHospital} className="gap-2">
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
      </div>

      {err ? (
        <Card className="glass-card">
          <CardContent className="p-4">
            <p className="text-sm text-destructive font-semibold">{err}</p>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-6 md:grid-cols-2">
        <TiltCard>
          <Card className="glass-card h-full">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5 text-primary" />
                Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Hospital name</label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. City Hospital" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Phone (optional)</label>
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91..." />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Address (optional)</label>
                <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Area, City, State" />
              </div>

              <Button onClick={save} disabled={saving || loading} className="w-full gap-2 btn-gradient">
                <Save className="h-4 w-4" />
                {saving ? "Saving..." : "Save Profile"}
              </Button>
            </CardContent>
          </Card>
        </TiltCard>

        <TiltCard>
          <Card className="glass-card h-full border-primary/20">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <QrCode className="h-5 w-5 text-primary" />
                  Hospital ID
                </span>
                <Badge variant={hospital?.hospital_uid ? "default" : "secondary"}>
                  {hospital?.hospital_uid ? "READY" : "MISSING"}
                </Badge>
              </CardTitle>
            </CardHeader>

            <CardContent className="space-y-4">
              {loading ? (
                <p className="text-sm text-muted-foreground animate-pulse">Loading…</p>
              ) : hospital?.hospital_uid ? (
                <>
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <p className="text-xs text-muted-foreground mb-2">Hospital UID</p>
                    <p className="text-xl font-mono tracking-wider text-primary">{hospital.hospital_uid}</p>
                  </div>
                  <QRBox value={qrPayload} />
                </>
              ) : (
                <div className="rounded-2xl border border-dashed border-white/20 bg-white/5 p-8 text-center">
                  <p className="text-sm font-semibold">No hospital UID yet</p>
                  <p className="text-sm text-muted-foreground mt-1">Save profile to generate it.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TiltCard>
      </div>
    </div>
  );
}
