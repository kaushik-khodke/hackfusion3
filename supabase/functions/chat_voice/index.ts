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

    const formData = await req.formData();
    const audioFile = formData.get("audio") as File;
    const language = formData.get("language") as string || "en";

    if (!audioFile) throw new Error("No audio file provided");

    // Step 1: Speech-to-Text using ElevenLabs
    const elevenlabsKey = Deno.env.get("ELEVENLABS_API_KEY");
    
    const sttFormData = new FormData();
    sttFormData.append("audio", audioFile);
    
    const sttResponse = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
      method: "POST",
      headers: {
        "xi-api-key": elevenlabsKey!,
      },
      body: sttFormData,
    });

    const sttData = await sttResponse.json();
    const transcript = sttData.text;

    // Step 2: Process via chat_text function
    const chatResponse = await fetch(
      `${Deno.env.get("SUPABASE_URL")}/functions/v1/chat_text`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: transcript,
          language,
        }),
      }
    );

    const chatData = await chatResponse.json();
    const aiText = chatData.data.response;

    // Step 3: Text-to-Speech using ElevenLabs
    const voiceId = language === "hi" 
      ? "pNInz6obpgDQGcFmaJgB" // Hindi voice
      : language === "mr"
      ? "ThT5KcBeYPX3keUQqHPh" // Marathi voice (placeholder)
      : "21m00Tcm4TlvDq8ikWAM"; // English voice

    const ttsResponse = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        method: "POST",
        headers: {
          "xi-api-key": elevenlabsKey!,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: aiText,
          model_id: "eleven_multilingual_v2",
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
          },
        }),
      }
    );

    const audioBuffer = await ttsResponse.arrayBuffer();

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          transcript,
          response: aiText,
          audioBase64: btoa(String.fromCharCode(...new Uint8Array(audioBuffer))),
          isEmergency: chatData.data.isEmergency,
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
