import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { corsHeaders } from "../_shared/cors.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const authHeader = req.headers.get("Authorization")!;
    const token = authHeader.replace("Bearer ", "");
    const { data: { user } } = await supabaseClient.auth.getUser(token);

    if (!user) throw new Error("Unauthorized");

    const { patientId } = await req.json();
    const targetPatientId = patientId || user.id;

    // Get patient profile
    const { data: patient } = await supabaseClient
      .from("patients")
      .select("*, profiles!inner(*)")
      .eq("id", targetPatientId)
      .single();

    if (!patient) throw new Error("Patient not found");

    // Get records (metadata only, no decryption for summary)
    const { data: records } = await supabaseClient
      .from("records")
      .select("record_type, title, record_date, doctor_name, notes")
      .eq("patient_id", targetPatientId)
      .order("record_date", { ascending: false })
      .limit(20);

    // Build summary
    const recordsByType = records?.reduce((acc, record) => {
      acc[record.record_type] = (acc[record.record_type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const summary = {
      patientName: patient.profiles.full_name,
      healthId: patient.health_id,
      totalRecords: records?.length || 0,
      recordsByType,
      recentRecords: records?.slice(0, 5).map(r => ({
        type: r.record_type,
        title: r.title,
        date: r.record_date,
        doctor: r.doctor_name,
        notes: r.notes,
      })),
    };

    return new Response(
      JSON.stringify({
        success: true,
        data: summary,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      }
    );
  }
});
