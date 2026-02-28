import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { corsHeaders } from "../_shared/cors.ts";
import { validateRequest, respondConsentSchema } from "../_shared/validation.ts";
import { hashPassword } from "../_shared/crypto.ts";
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

    if (!user) throw new Error("Unauthorized");

    const body = await req.json();
    const validated = validateRequest(respondConsentSchema, body);

    // Get consent request
    const { data: consent, error: consentError } = await supabaseClient
      .from("consent_requests")
      .select("*")
      .eq("id", validated.consentId)
      .eq("patient_id", user.id)
      .single();

    if (consentError || !consent) {
      throw new Error("Consent request not found");
    }

    if (consent.status !== "pending") {
      throw new Error("Consent request already processed");
    }

    // If approving, verify PIN
    if (validated.approved) {
      if (!validated.pin) {
        throw new Error("PIN required to approve consent");
      }

      const { data: patient } = await supabaseClient
        .from("patients")
        .select("pin_salt, pin_hash")
        .eq("id", user.id)
        .single();

      if (!patient?.pin_hash) {
        throw new Error("Smart PIN not set");
      }

      const pinHash = await hashPassword(validated.pin, patient.pin_salt);
      if (pinHash !== patient.pin_hash) {
        throw new Error("Invalid PIN");
      }
    }

    // Update consent status
    const newStatus = validated.approved ? "approved" : "denied";
    const { error: updateError } = await supabaseClient
      .from("consent_requests")
      .update({
        status: newStatus,
        approved_at: validated.approved ? new Date().toISOString() : null,
      })
      .eq("id", validated.consentId);

    if (updateError) throw updateError;

    await logAudit(
      supabaseClient,
      user.id,
      `consent_${newStatus}`,
      "consent_request",
      validated.consentId,
      { doctor_id: consent.doctor_id },
      req
    );

    return new Response(
      JSON.stringify({
        success: true,
        message: `Consent ${newStatus}`,
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
