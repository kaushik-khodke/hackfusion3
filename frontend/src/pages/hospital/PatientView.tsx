import React, { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { TiltCard } from "@/components/ui/TiltCard";
import { Calendar, Eye, Download, FileText, Search, RefreshCw } from "lucide-react";
import { getPatientRecordsForHospitalRPC, getPatientSummaryForHospitalRPC } from "@/lib/supabase";

type RecordRow = {
  id: string;
  record_type: string;
  title: string;
  record_date: string;
  doctor_name?: string | null;
  file_url?: string | null;
  file_name?: string | null;
  file_size?: number | null;
  ipfs_hash?: string | null;
  created_at: string;
};

export default function HospitalPatientView() {
  const { patientId } = useParams();
  const [summary, setSummary] = useState<{ id: string; uhid?: string | null } | null>(null);

  const [records, setRecords] = useState<RecordRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string>("");

  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState("all");

  const stats = useMemo(() => {
    const total = records.length;
    const prescriptions = records.filter((r) => r.record_type === "prescription").length;
    const labReports = records.filter((r) => r.record_type === "lab_report").length;
    const imaging = records.filter((r) => r.record_type === "imaging").length;
    return { total, prescriptions, labReports, imaging };
  }, [records]);

  const filteredRecords = useMemo(() => {
    return records.filter((r) => {
      const matchesSearch = r.title?.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesFilter = filterType === "all" || r.record_type === filterType;
      return matchesSearch && matchesFilter;
    });
  }, [records, searchQuery, filterType]);

  const fetchAll = async () => {
    if (!patientId) return;
    setLoading(true);
    setErr("");

    try {
      const s = await getPatientSummaryForHospitalRPC({ patientId });
      if (!s.success) {
        setErr(s.error || "Not allowed");
        setSummary(null);
        setRecords([]);
        return;
      }
      setSummary(s.patient ?? null);

      const recs = await getPatientRecordsForHospitalRPC({ patientId });
      setRecords((recs ?? []) as any);
    } catch (e: any) {
      console.error(e);
      setErr(e?.message || "Failed to load records");
      setRecords([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId]);

  const formatFileSize = (bytes?: number | null) => {
    if (!bytes) return "Unknown";
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + " KB";
    return (bytes / (1024 * 1024)).toFixed(2) + " MB";
  };

  return (
    <div className="min-h-screen relative overflow-hidden font-sans selection:bg-primary/30">
      <div className="container mx-auto px-4 py-8 space-y-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-4xl font-bold font-heading">Patient Records (Hospital)</h1>
            <p className="text-sm text-muted-foreground mt-2">
              {summary?.uhid ? (
                <>
                  UHID: <span className="font-mono bg-primary/10 text-primary px-1 rounded">{summary.uhid}</span>
                </>
              ) : (
                "UHID: —"
              )}
            </p>
          </div>

          <Button variant="outline" onClick={fetchAll} className="gap-2">
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
        </div>

        {err ? (
          <Card className="glass-card">
            <CardContent className="p-6">
              <p className="text-sm text-destructive font-semibold">{err}</p>
              <p className="text-sm text-muted-foreground mt-2">
                Ask the patient to approve hospital access, or renew if expired.
              </p>
            </CardContent>
          </Card>
        ) : null}

        {/* Stats (matches your patient Records feel) [file:469] */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <TiltCard>
            <Card className="glass-card border-primary/20 h-full">
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground mb-1">Total Records</p>
                <p className="text-3xl font-bold text-primary">{stats.total}</p>
              </CardContent>
            </Card>
          </TiltCard>

          <TiltCard>
            <Card className="glass-card border-warning/20 h-full">
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground mb-1">Prescriptions</p>
                <p className="text-3xl font-bold text-warning">{stats.prescriptions}</p>
              </CardContent>
            </Card>
          </TiltCard>

          <TiltCard>
            <Card className="glass-card border-secondary/20 h-full">
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground mb-1">Lab Reports</p>
                <p className="text-3xl font-bold text-secondary">{stats.labReports}</p>
              </CardContent>
            </Card>
          </TiltCard>

          <TiltCard>
            <Card className="glass-card border-emerald-500/20 h-full">
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground mb-1">Imaging</p>
                <p className="text-3xl font-bold text-emerald-500">{stats.imaging}</p>
              </CardContent>
            </Card>
          </TiltCard>
        </div>

        {/* Search + filter */}
        <div className="flex gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <Input
              placeholder="Search records..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>

          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="px-4 py-2 rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="all">All</option>
            <option value="prescription">Prescriptions</option>
            <option value="lab_report">Lab Reports</option>
            <option value="imaging">Imaging</option>
            <option value="discharge_summary">Discharge Summary</option>
            <option value="vaccination">Vaccination</option>
            <option value="other">Other</option>
          </select>
        </div>

        {/* Records list */}
        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin w-12 h-12 border-4 border-primary border-t-transparent rounded-full mx-auto" />
            <p className="text-muted-foreground mt-4">Loading records...</p>
          </div>
        ) : filteredRecords.length === 0 ? (
          <Card className="glass-card">
            <CardContent className="p-12 text-center">
              <FileText className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-xl font-semibold mb-2">No records found</h3>
              <p className="text-sm text-muted-foreground">Nothing matches your filters.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {filteredRecords.map((record, index) => (
              <motion.div
                key={record.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.03 }}
              >
                <Card className="glass-card">
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <h3 className="font-semibold text-lg truncate">{record.title}</h3>
                          {record.ipfs_hash ? (
                            <span className="px-2 py-1 text-xs rounded-full bg-primary/10 text-primary">
                              IPFS
                            </span>
                          ) : null}
                          <Badge variant="outline" className="text-[10px] h-5">
                            {record.record_type}
                          </Badge>
                        </div>

                        <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Calendar className="w-4 h-4" />
                            {record.record_date ? new Date(record.record_date).toLocaleDateString() : "—"}
                          </span>
                          {record.doctor_name ? <span>Dr. {record.doctor_name}</span> : null}
                          {record.file_name ? (
                            <span>
                              {record.file_name} • {formatFileSize(record.file_size)}
                            </span>
                          ) : null}
                        </div>
                      </div>

                      <div className="flex gap-2 flex-shrink-0">
                        {record.file_url ? (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => window.open(record.file_url!, "_blank")}
                              title="View"
                            >
                              <Eye className="w-4 h-4" />
                            </Button>

                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                const a = document.createElement("a");
                                a.href = record.file_url!;
                                a.download = record.file_name || "download";
                                a.target = "_blank";
                                a.click();
                              }}
                              title="Download"
                            >
                              <Download className="w-4 h-4" />
                            </Button>
                          </>
                        ) : null}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
