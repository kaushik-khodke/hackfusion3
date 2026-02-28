import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

console.log('🔧 Supabase Environment Check:', {
  url: supabaseUrl ? '✅ Found' : '❌ MISSING',
  key: supabaseAnonKey ? '✅ Found' : '❌ MISSING',
})

if (!supabaseUrl || !supabaseAnonKey) {
  const errorMsg = '❌ Supabase initialization failed: VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY is missing from environment variables.'
  console.error(errorMsg)
  // We throw a descriptive error to help identify the issue in the console
  if (!supabaseUrl) throw new Error('VITE_SUPABASE_URL is required but "undefined"')
  if (!supabaseAnonKey) throw new Error('VITE_SUPABASE_ANON_KEY is required but "undefined"')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
})

export async function callEdgeFunction(functionName: string, body: any) {
  console.log('📞 Calling:', functionName, body)

  // ✅ Force session refresh before calling
  const { data: { session }, error: sessionError } = await supabase.auth.getSession()

  if (sessionError) {
    console.error('❌ Session error:', sessionError)
    throw new Error('Failed to get session')
  }

  if (!session) {
    console.error('❌ No active session')
    throw new Error('Not authenticated. Please log in.')
  }

  console.log('🔑 Using token:', session.access_token.substring(0, 20) + '...')
  console.log('👤 User:', session.user.email)

  // ✅ Call with explicit authorization
  const { data, error } = await supabase.functions.invoke(functionName, {
    body,
    headers: {
      Authorization: `Bearer ${session.access_token}`
    }
  })

  console.log('📥 Result:', { data, error })

  if (error) {
    console.error('❌ Error:', error)
    throw error
  }

  return data
}

export async function requestConsentRPC(params: {
  uhid: string
  accessType: string
  reason: string
  expiryHours: number
}) {
  const { data, error } = await supabase.rpc('request_patient_consent', {
    p_patient_uhid: params.uhid,
    p_access_type: params.accessType,
    p_reason: params.reason,
    p_expiry_hours: params.expiryHours,
  })

  if (error) throw new Error(error.message)
  if (!data?.success) throw new Error(data?.error || 'Request failed')
  return data
}


// Add these near your existing requestConsentRPC in lib/supabase.ts
// (keeping your supabase client instance the same)

export type AccessType = "read" | "read_write";
export type RequestStatus = "pending" | "approved" | "rejected";

export async function upsertHospitalProfileRPC(input: {
  name: string;
  phone?: string | null;
  address?: string | null;
}) {
  const { data, error } = await supabase.rpc("upsert_hospital_profile", {
    p_name: input.name,
    p_phone: input.phone ?? null,
    p_address: input.address ?? null,
  });
  if (error) throw error;
  return data as { success: boolean; hospital_id?: string; hospital_uid?: string };
}

export async function requestJoinHospitalRPC(input: { hospitalUid: string }) {
  const { data, error } = await supabase.rpc("request_join_hospital", {
    p_hospital_uid: input.hospitalUid,
  });
  if (error) throw error;
  return data as { success: boolean; hospital_id?: string; doctor_id?: string };
}

export async function setHospitalDoctorStatusRPC(input: {
  doctorId: string;
  status: Exclude<RequestStatus, "pending">;
}) {
  const { data, error } = await supabase.rpc("set_hospital_doctor_status", {
    p_doctor_id: input.doctorId,
    p_status: input.status,
  });
  if (error) throw error;
  return data as { success: boolean };
}

export async function requestHospitalAccessByUhidRPC(input: {
  uhid: string;
  accessType: AccessType;
  reason: string;
  expiryHours?: number;
}) {
  const { data, error } = await supabase.rpc("request_hospital_access_by_uhid", {
    p_patient_uhid: input.uhid,
    p_access_type: input.accessType,
    p_reason: input.reason,
    p_expiry_hours: input.expiryHours ?? 24,
  });
  if (error) throw error;
  return data as { success: boolean; patient_id?: string; hospital_id?: string };
}

export async function setHospitalAccessRequestStatusRPC(input: {
  requestId: string;
  status: Exclude<RequestStatus, "pending">;
}) {
  const { data, error } = await supabase.rpc("set_hospital_access_request_status", {
    p_request_id: input.requestId,
    p_status: input.status,
  });
  if (error) throw error;
  return data as { success: boolean };
}

export async function requestHospitalDelegationRPC(input: {
  hospitalId: string;
  patientId: string;
  accessType: AccessType;
  reason: string;
  expiryHours?: number;
}) {
  const { data, error } = await supabase.rpc("request_hospital_delegation", {
    p_hospital_id: input.hospitalId,
    p_patient_id: input.patientId,
    p_access_type: input.accessType,
    p_reason: input.reason,
    p_expiry_hours: input.expiryHours ?? 24,
  });
  if (error) throw error;
  return data as { success: boolean };
}

export async function setHospitalDelegationStatusRPC(input: {
  requestId: string;
  status: Exclude<RequestStatus, "pending">;
}) {
  const { data, error } = await supabase.rpc("set_hospital_delegation_status", {
    p_request_id: input.requestId,
    p_status: input.status,
  });
  if (error) throw error;
  return data as { success: boolean };
}

export async function doctorHasPatientAccessRPC(input: { patientId: string }) {
  const { data, error } = await supabase.rpc("doctor_has_patient_access", {
    p_patient_id: input.patientId,
  });
  if (error) throw error;
  return data as {
    allowed: boolean;
    mode: "direct" | "hospital" | null;
    access_type: AccessType | null;
    expires_at: string | null;
  };
}
export async function getPatientSummaryForHospitalRPC(input: { patientId: string }) {
  const { data, error } = await supabase.rpc("get_patient_summary_for_hospital", {
    p_patient_id: input.patientId,
  });
  if (error) throw error;
  return data as { success: boolean; error?: string; patient?: { id: string; uhid?: string | null } };
}

export async function getPatientRecordsForHospitalRPC(input: { patientId: string }) {
  const { data, error } = await supabase.rpc("get_patient_records_for_hospital", {
    p_patient_id: input.patientId,
  });
  if (error) throw error;
  return (data ?? []) as any[];
}
