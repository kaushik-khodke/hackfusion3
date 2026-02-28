import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { corsHeaders } from "../_shared/cors.ts";
import { validateRequest, chatTextSchema } from "../_shared/validation.ts";

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
    const validated = validateRequest(chatTextSchema, body);

    // Get patient summary
    const summaryResponse = await fetch(
      `${Deno.env.get("SUPABASE_URL")}/functions/v1/get_patient_summary`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ patientId: user.id }),
      }
    );

    const summaryData = await summaryResponse.json();
    const summary = summaryData.data;

    // Build system prompt
    const languageInstruction = validated.language === "hi" 
      ? "Reply in Hindi (हिंदी)" 
      : validated.language === "mr" 
      ? "Reply in Marathi (मराठी)" 
      : "Reply in English";

    const systemPrompt = `You are a helpful AI health assistant for MyHealthChain. ${languageInstruction}.

Patient Context:
- Name: ${summary.patientName}
- Total Records: ${summary.totalRecords}
- Recent Records: ${JSON.stringify(summary.recentRecords)}

IMPORTANT SAFETY RULES:
1. You are NOT a doctor. Always recommend consulting healthcare professionals.
2. Do not provide definitive diagnoses.
3. If symptoms suggest emergency (chest pain, difficulty breathing, severe bleeding), respond with: "🚨 EMERGENCY: Seek immediate medical attention. Call emergency services."
4. Be empathetic and supportive.
5. Base answers on the patient's history when relevant.

User Question: ${validated.message}`;

    // Call Gemini API
    const geminiKey = Deno.env.get("GEMINI_API_KEY");
    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${geminiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: systemPrompt
            }]
          }],
          safetySettings: [
            {
              category: "HARM_CATEGORY_MEDICAL",
              threshold: "BLOCK_NONE"
            }
          ]
        }),
      }
    );

    const geminiData = await geminiResponse.json();
    const aiResponse = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "I couldn't process that. Please try again.";

    // Check for emergency keywords
    const emergencyKeywords = ["chest pain", "can't breathe", "severe bleeding", "suicide", "heart attack", "stroke"];
    const isEmergency = emergencyKeywords.some(keyword => 
      validated.message.toLowerCase().includes(keyword)
    );

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          response: aiResponse,
          isEmergency,
          language: validated.language || "en",
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
