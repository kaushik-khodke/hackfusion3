import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { corsHeaders } from "../_shared/cors.ts";
import { encrypt, hashSHA256, importKey, decrypt } from "../_shared/crypto.ts";
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

    // Parse multipart form data
    const formData = await req.formData();
    const file = formData.get("file") as File;
    const metadata = JSON.parse(formData.get("metadata") as string);

    if (!file) throw new Error("No file provided");

    // Get patient's DEK
    const { data: patient } = await supabaseClient
      .from("patients")
      .select("encrypted_dek")
      .eq("id", metadata.patientId || user.id)
      .single();

    if (!patient?.encrypted_dek) {
      throw new Error("Smart PIN not set. Please set your PIN first.");
    }

    // Decrypt DEK (simplified - in production, use PIN-derived key)
    const dekData = JSON.parse(patient.encrypted_dek);
    const dek = await importKey(dekData.ciphertext); // Simplified

    // Read file as bytes
    const fileBuffer = await file.arrayBuffer();
    const fileBytes = new Uint8Array(fileBuffer);

    // Hash original file
    const fileHash = await hashSHA256(fileBytes);

    // Encrypt file
    const encrypted = await encrypt(fileBytes, dek);

    // Upload to Pinata
    const pinataJWT = Deno.env.get("PINATA_JWT");
    const encryptedBlob = new Blob([encrypted.ciphertext]);
    
    const pinataFormData = new FormData();
    pinataFormData.append("file", encryptedBlob, `encrypted_${file.name}`);
    pinataFormData.append("pinataMetadata", JSON.stringify({
      name: `MHC_${metadata.patientId}_${Date.now()}`,
    }));

    const pinataResponse = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${pinataJWT}`,
      },
      body: pinataFormData,
    });

    if (!pinataResponse.ok) {
      throw new Error("IPFS upload failed");
    }

    const pinataData = await pinataResponse.json();
    const ipfsCid = pinataData.IpfsHash;

    // Store metadata in database
    const { data: record, error: recordError } = await supabaseClient
      .from("records")
      .insert({
        patient_id: metadata.patientId || user.id,
        uploaded_by: user.id,
        record_type: metadata.recordType,
        title: metadata.title,
        record_date: metadata.recordDate,
        doctor_name: metadata.doctorName,
        notes: metadata.notes,
        ipfs_cid: ipfsCid,
        sha256_hash: fileHash,
        encrypted_metadata: JSON.stringify({
          filename: file.name,
          size: file.size,
          type: file.type,
          iv: encrypted.iv,
        }),
        file_size_bytes: file.size,
      })
      .select()
      .single();

    if (recordError) throw recordError;

    await logAudit(
      supabaseClient,
      user.id,
      "upload_record",
      "record",
      record.id,
      { ipfs_cid: ipfsCid, record_type: metadata.recordType },
      req
    );

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          recordId: record.id,
          ipfsCid,
          hash: fileHash,
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
