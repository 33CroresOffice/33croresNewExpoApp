import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const token = authHeader.replace("Bearer ", "");
    const { data: caller, error: callerError } = await supabaseAdmin.auth.getUser(token);
    if (callerError || !caller.user || caller.user.app_metadata?.role !== "admin") {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { providerId } = await req.json();
    if (typeof providerId !== "string") {
      return new Response(JSON.stringify({ error: "Invalid provider" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: provider, error: providerError } = await supabaseAdmin
      .from("service_providers")
      .select("id, full_name, mobile, email, approval_status, auth_user_id")
      .eq("id", providerId)
      .maybeSingle();

    if (providerError || !provider || provider.approval_status !== "approved") {
      return new Response(JSON.stringify({ error: "Provider is not approved" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (provider.auth_user_id) {
      return new Response(JSON.stringify({ success: true, userId: provider.auth_user_id }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const email = provider.email || `provider-${provider.mobile}@33crores.com`;
    const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: crypto.randomUUID(),
      email_confirm: true,
      app_metadata: { role: "provider" },
      user_metadata: { full_name: provider.full_name, mobile: provider.mobile },
    });
    if (createError || !created.user) {
      return new Response(JSON.stringify({ error: "Could not create provider account" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { error: profileError } = await supabaseAdmin.from("profiles").upsert({
      id: created.user.id,
      mobile: provider.mobile,
      full_name: provider.full_name,
      role: "provider",
      is_verified: true,
      notification_sms: false,
      notification_whatsapp: true,
    });
    if (profileError) {
      await supabaseAdmin.auth.admin.deleteUser(created.user.id);
      return new Response(JSON.stringify({ error: "Could not create provider profile" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { error: linkError } = await supabaseAdmin
      .from("service_providers")
      .update({ auth_user_id: created.user.id, updated_at: new Date().toISOString() })
      .eq("id", provider.id);
    if (linkError) {
      return new Response(JSON.stringify({ error: "Could not link provider account" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ success: true, userId: created.user.id }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch {
    return new Response(JSON.stringify({ error: "Could not create provider account" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
