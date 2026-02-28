import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { Building2, ArrowRight, AlertCircle } from "lucide-react";
import { requestJoinHospitalRPC } from "@/lib/supabase";

export default function JoinHospital() {
  const navigate = useNavigate();
  const [hospitalUid, setHospitalUid] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "done">("idle");
  const [err, setErr] = useState("");

  const submit = async () => {
    setErr("");
    const uid = hospitalUid.trim().toUpperCase();
    if (uid.length < 6) {
      setErr("Enter a valid Hospital UID");
      return;
    }

    setStatus("sending");
    try {
      await requestJoinHospitalRPC({ hospitalUid: uid });
      setStatus("done");
      alert("✅ Join request sent. Wait for hospital approval.");
      navigate("/dashboard");
    } catch (e: any) {
      console.error(e);
      setErr(e?.message || "Failed to send join request");
    } finally {
      setStatus("idle");
    }
  };

  return (
    <div className="mx-auto w-full max-w-xl px-4 md:px-6 py-8 space-y-6 relative font-sans">
      <div>
        <h1 className="text-3xl font-bold font-heading">Join a Hospital</h1>
        <p className="text-sm text-muted-foreground">
          Enter the hospital UID shown on the hospital profile page.
        </p>
      </div>

      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-primary" />
              Hospital UID
            </span>
            <Badge variant="outline">Doctor</Badge>
          </CardTitle>
        </CardHeader>

        <CardContent className="space-y-4">
          <Input
            value={hospitalUid}
            onChange={(e) => setHospitalUid(e.target.value.toUpperCase())}
            placeholder="HSP-XXXXXXXXXX"
            className="font-mono tracking-wider"
          />

          {err ? (
            <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-lg flex items-start gap-2">
              <AlertCircle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
              <p className="text-sm text-destructive font-medium">{err}</p>
            </div>
          ) : null}

          <Button onClick={submit} disabled={!hospitalUid || status === "sending"} className="w-full gap-2 btn-gradient">
            {status === "sending" ? "Sending..." : "Request to Join"}
            <ArrowRight className="h-4 w-4" />
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
