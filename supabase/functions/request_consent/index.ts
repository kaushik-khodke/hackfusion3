import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    )

    // ⚠️ TEMPORARY: Skip auth check for testing
    console.log('⚠️ WARNING: Auth check disabled for testing')
    
    // Parse request body
    const { uhid, accessType, reason, expiryHours } = await req.json()
    
    console.log('📥 Request received:', { uhid, accessType, reason, expiryHours })

    // Validate required fields
    if (!uhid || !accessType || !reason) {
      throw new Error('Missing required fields: uhid, accessType, reason')
    }

    // ⚠️ TEMPORARY: Use hardcoded doctor ID for testing
    const testDoctorId = 'test-doctor-id-12345'
    
    console.log('✅ Using test doctor ID:', testDoctorId)

    // Calculate expiry
    const expiresAt = new Date()
    expiresAt.setHours(expiresAt.getHours() + (expiryHours || 24))

    // Create consent request
    const { data, error } = await supabase
      .from('consent_requests')
      .insert({
        patient_uhid: uhid,
        doctor_id: testDoctorId,
        access_type: accessType,
        reason,
        status: 'pending',
        expires_at: expiresAt.toISOString(),
      })
      .select()
      .single()

    if (error) {
      console.error('❌ Database error:', error)
      throw error
    }

    console.log('✅ Consent request created:', data)

    return new Response(
      JSON.stringify({
        success: true,
        data,
        message: 'Consent request created successfully'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('❌ Error:', error)
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message
      }),
      { 
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})
