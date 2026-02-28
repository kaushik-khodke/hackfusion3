import React, { useMemo, useEffect, useState } from "react";

import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { UploadWizard } from "@/components/features/UploadWizard";

import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/lib/supabase";
import { API_BASE_URL } from "@/lib/api";

import { motion } from "framer-motion";
import {
  Upload,
  Search,
  FileText,
  Download,
  Eye,
  Trash2,
  Calendar,
  BrainCircuit,
  Loader2,
} from "lucide-react";

import { TiltCard } from "@/components/ui/TiltCard";

interface RecordRow {
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

  // Optional: if you later store Storage paths (recommended)
  storage_path?: string | null;
}

export default function Records() {
  const { user } = useAuth();

  const [records, setRecords] = useState<RecordRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [showUploadWizard, setShowUploadWizard] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState("all");

  const [patientRowId, setPatientRowId] = useState<string | null>(null);

  // For AI processing button
  const [processingId, setProcessingId] = useState<string | null>(null);

  // 1) Load patients.id for this user
  useEffect(() => {
    if (!user?.id) return;

    const init = async () => {
      const { data: patient, error } = await supabase
        .from("patients")
        .select("id")
        .eq("user_id", user.id)
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error("Failed to load patient row:", error);
        return;
      }

      if (!patient?.id) {
        console.error("No patient row found for user:", user.id);
        return;
      }

      setPatientRowId(patient.id);
    };

    init();
  }, [user?.id]);

  // 2) Fetch records
  const fetchRecords = async (silent = false) => {
    if (!patientRowId) return;

    if (!silent) setLoading(true);
    try {
      const { data, error } = await supabase
        .from("records")
        .select("*")
        .eq("patient_id", patientRowId)
        .order("created_at", { ascending: false });

      if (error) throw error;

      setRecords((data ?? []) as RecordRow[]);
    } catch (error: any) {
      console.error("Error fetching records:", error);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    if (patientRowId) fetchRecords();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientRowId]);

  // 3) Delete record
  const handleDelete = async (recordId: string) => {
    if (!confirm("Are you sure you want to delete this record?")) return;

    try {
      const { error } = await supabase.from("records").delete().eq("id", recordId);
      if (error) throw error;

      alert("✅ Record deleted successfully");
      fetchRecords(true);
    } catch (error: any) {
      alert(`❌ Failed to delete: ${error.message}`);
    }
  };

  // 4) Analyze record with AI
  const handleAnalyze = async (record: RecordRow) => {
    if (!record.file_url) {
      alert("No file URL found for this record.");
      return;
    }

    if (!patientRowId) {
      alert("Patient ID not loaded yet. Please try again in a second.");
      return;
    }

    setProcessingId(record.id);

    try {
      const response = await fetch(`${API_BASE_URL}/process_document`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },

        // Corrected payload keys (file_url/record_id/patient_id)
        body: JSON.stringify({
          file_url: record.file_url,
          record_id: record.id,
          patient_id: patientRowId, // patients.id
        }),
      });

      const result = await response.json();

      if (result.success) {
        alert(`✅ Analysis Complete! Added ${result.chunks} segments to AI memory.`);
      } else {
        alert("❌ AI Processing Failed: " + (result.error || result.detail || "Unknown error"));
      }
    } catch (err) {
      alert("❌ Could not connect to AI server. Ensure the backend is running.");
    } finally {
      setProcessingId(null);
    }
  };

  const filteredRecords = useMemo(() => {
    return records.filter((record) => {
      const matchesSearch = record.title.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesFilter = filterType === "all" || record.record_type === filterType;
      return matchesSearch && matchesFilter;
    });
  }, [records, searchQuery, filterType]);

  const stats = useMemo(() => {
    const now = new Date();
    return {
      total: records.length,
      thisMonth: records.filter((r) => new Date(r.created_at).getMonth() === now.getMonth()).length,
      prescriptions: records.filter((r) => r.record_type === "prescription").length,
      labReports: records.filter((r) => r.record_type === "lab_report").length,
    };
  }, [records]);

  const getRecordIcon = (type: string) => {
    switch (type) {
      case "prescription":
        return "💊";
      case "lab_report":
        return "🔬";
      case "imaging":
        return "🩻";
      case "discharge_summary":
        return "📋";
      case "vaccination":
        return "💉";
      default:
        return "📄";
    }
  };

  const formatFileSize = (bytes?: number | null) => {
    if (!bytes) return "Unknown";
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + " KB";
    return (bytes / (1024 * 1024)).toFixed(2) + " MB";
  };

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        Please login.
      </div>
    );
  }

  return (
    <div className="min-h-screen relative overflow-hidden font-sans selection:bg-primary/30">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-start justify-between gap-4 mb-8"
        >
          <div>
            <h1 className="text-4xl font-bold mb-2 font-heading">Recent Records</h1>
            <p className="text-muted-foreground">Manage and view your medical records securely</p>
          </div>

          <Button
            onClick={() => setShowUploadWizard(true)}
            size="lg"
            className="gap-2 shadow-lg shadow-primary/20 hover:shadow-primary/40 transition-all"
          >
            <Upload className="w-4 h-4" />
            Upload Record
          </Button>
        </motion.div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <TiltCard>
            <Card className="glass-card">
              <CardContent className="p-6">
                <div className="text-sm text-muted-foreground mb-1 uppercase tracking-wide">Total Records</div>
                <div className="text-4xl font-bold text-primary">{stats.total}</div>
              </CardContent>
            </Card>
          </TiltCard>

          <TiltCard>
            <Card className="glass-card">
              <CardContent className="p-6">
                <div className="text-sm text-muted-foreground mb-1 uppercase tracking-wide">This Month</div>
                <div className="text-4xl font-bold text-foreground">{stats.thisMonth}</div>
              </CardContent>
            </Card>
          </TiltCard>

          <TiltCard>
            <Card className="glass-card">
              <CardContent className="p-6">
                <div className="text-sm text-muted-foreground mb-1 uppercase tracking-wide">Prescriptions</div>
                <div className="text-4xl font-bold text-blue-500">{stats.prescriptions}</div>
              </CardContent>
            </Card>
          </TiltCard>

          <TiltCard>
            <Card className="glass-card">
              <CardContent className="p-6">
                <div className="text-sm text-muted-foreground mb-1 uppercase tracking-wide">Lab Reports</div>
                <div className="text-4xl font-bold text-purple-500">{stats.labReports}</div>
              </CardContent>
            </Card>
          </TiltCard>
        </div>

        {/* Search + filter */}
        <div className="flex flex-col md:flex-row gap-4 items-stretch md:items-center mb-6">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-3.5 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search records..."
              className="pl-10"
            />
          </div>

          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            title="Filter records by type"
            className="px-4 py-2 rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="all">All Records</option>
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
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading records...
          </div>
        ) : filteredRecords.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <div className="mb-3">No records found</div>
            <Button onClick={() => setShowUploadWizard(true)}>Upload First Record</Button>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredRecords.map((record, index) => (
              <motion.div
                key={record.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.03 }}
              >
                <Card className="glass-card">
                  <CardContent className="p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    {/* Left: details */}
                    <div className="flex items-start gap-4">
                      <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                        <span className="text-lg">{getRecordIcon(record.record_type)}</span>
                      </div>

                      <div>
                        <div className="font-semibold text-lg flex items-center gap-2">
                          {record.title}
                          {record.ipfs_hash ? (
                            <span className="text-xs px-2 py-0.5 rounded-full border border-border text-muted-foreground">
                              🌐 IPFS
                            </span>
                          ) : null}
                        </div>

                        <div className="text-sm text-muted-foreground flex flex-wrap gap-3 mt-1">
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
                    </div>

                    {/* Right: actions */}
                    <div className="flex flex-wrap gap-2 justify-end">
                      {/* Analyze */}
                      {record.file_url ? (
                        <Button
                          variant="outline"
                          onClick={() => handleAnalyze(record)}
                          disabled={processingId === record.id}
                          className={`border-purple-200 text-purple-700 ${processingId === record.id
                            ? "bg-primary/10"
                            : "hover:bg-purple-50 hover:text-purple-600"
                            }`}
                          title="Analyze with AI"
                        >
                          {processingId === record.id ? (
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          ) : (
                            <BrainCircuit className="w-4 h-4 mr-2" />
                          )}
                          {processingId === record.id ? "Analyzing..." : "Analyze"}
                        </Button>
                      ) : null}

                      {/* View / Download (public URL) */}
                      {record.file_url ? (
                        <>
                          <Button
                            variant="outline"
                            onClick={() => window.open(record.file_url as string, "_blank")}
                            title="View"
                          >
                            <Eye className="w-4 h-4" />
                          </Button>

                          <Button
                            variant="outline"
                            onClick={() => {
                              const a = document.createElement("a");
                              a.href = record.file_url as string;
                              a.download = record.file_name || "dl";
                              a.target = "_blank";
                              a.click();
                            }}
                            title="Download"
                          >
                            <Download className="w-4 h-4" />
                          </Button>
                        </>
                      ) : null}

                      {/* Delete */}
                      <Button
                        variant="outline"
                        onClick={() => handleDelete(record.id)}
                        className="text-error hover:bg-error/10"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        )}

        {/* Upload wizard */}
        {showUploadWizard ? (
          <UploadWizard
            open={showUploadWizard}
            onClose={() => setShowUploadWizard(false)}
            onSuccess={() => {
              fetchRecords(true);
            }}
          />
        ) : null}
      </div>
    </div>
  );
}
