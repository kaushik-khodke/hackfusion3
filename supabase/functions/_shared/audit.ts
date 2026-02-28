import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

export async function logAudit(
  supabase: SupabaseClient,
  actorId: string,
  action: string,
  resourceType: string,
  resourceId?: string,
  metadata?: Record<string, any>,
  request?: Request
) {
  const ipAddress = request?.headers.get("x-forwarded-for")?.split(",")[0] || 
                    request?.headers.get("x-real-ip") || 
                    "unknown";
  const userAgent = request?.headers.get("user-agent") || "unknown";

  const { error } = await supabase
    .from("audit_logs")
    .insert({
      actor_id: actorId,
      action,
      resource_type: resourceType,
      resource_id: resourceId,
      metadata,
      ip_address: ipAddress,
      user_agent: userAgent,
    });

  if (error) {
    console.error("Audit log error:", error);
  }
}
