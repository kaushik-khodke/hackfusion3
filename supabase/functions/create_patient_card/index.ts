import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { corsHeaders } from "../_shared/cors.ts";
import { validateRequest, createPatientCardSchema } from "../_shared/validation.ts";
import { logAudit } from "../_shared/audit.ts";

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

    if (!user) {
      throw new Error("Unauthorized");
    }

    const body = await req.json();
    const validated = validateRequest(createPatientCardSchema, body);

    // Generate unique health_id
    const { data: healthIdData } = await supabaseClient.rpc("generate_health_id");
    const healthId = healthIdData;

    // Generate QR token
    const qrToken = crypto.randomUUID();

    // Insert patient record
    const { data: patient, error: patientError } = await supabaseClient
      .from("patients")
      .insert({
        id: user.id,
        health_id: healthId,
        qr_token: qrToken,
      })
      .select()
      .single();

    if (patientError) throw patientError;

    await logAudit(
      supabaseClient,
      user.id,
      "create_patient_card",
      "patient",
      patient.id,
      { health_id: healthId },
      req
    );

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          healthId,
          qrToken,
        },
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
