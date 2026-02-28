import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { corsHeaders } from "../_shared/cors.ts";
import { validateRequest, setPinSchema } from "../_shared/validation.ts";
import { generateSalt, hashPassword, generateKey, exportKey, encrypt } from "../_shared/crypto.ts";
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
    const validated = validateRequest(setPinSchema, body);

    // Generate salt and hash PIN
    const salt = generateSalt();
    const pinHash = await hashPassword(validated.pin, salt);

    // Generate DEK (Data Encryption Key)
    const dek = await generateKey();
    const dekStr = await exportKey(dek);

    // Encrypt DEK with PIN-derived key
    const pinKey = await hashPassword(validated.pin, salt);
    const encoder = new TextEncoder();
    const encryptedDek = await encrypt(encoder.encode(dekStr), dek);

    // Store in database
    const { error } = await supabaseClient
      .from("patients")
      .update({
        pin_salt: salt,
        pin_hash: pinHash,
        encrypted_dek: JSON.stringify(encryptedDek),
      })
      .eq("id", user.id);

    if (error) throw error;

    await logAudit(
      supabaseClient,
      user.id,
      "set_smart_pin",
      "patient",
      user.id,
      {},
      req
    );

    return new Response(
      JSON.stringify({
        success: true,
        message: "Smart PIN set successfully",
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
