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
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } }
    );

    const { data: { user: caller } } = await supabaseUser.auth.getUser();
    if (!caller) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: callerProfile } = await supabaseAdmin
      .from("profiles")
      .select("role, admin_role")
      .eq("id", caller.id)
      .maybeSingle();

    if (!callerProfile || callerProfile.role !== "admin" || callerProfile.admin_role !== "super_admin") {
      return new Response(JSON.stringify({ error: "Only super admins can create admin users." }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { full_name, email, password, admin_role, custom_role_id } = body;

    if (!full_name || !email || !password) {
      return new Response(JSON.stringify({ error: "Invalid input. Provide full_name, email, and password." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Must provide exactly one of: admin_role (built-in) or custom_role_id
    const builtInRoles = ["finance", "operations", "crm", "catalog"];
    const hasBuiltIn = admin_role && builtInRoles.includes(admin_role);
    const hasCustom = !!custom_role_id;

    if (!hasBuiltIn && !hasCustom) {
      return new Response(JSON.stringify({ error: "Provide a valid admin_role or a custom_role_id." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify custom_role_id exists if provided
    if (hasCustom) {
      const { data: cr } = await supabaseAdmin
        .from("custom_roles")
        .select("id")
        .eq("id", custom_role_id)
        .maybeSingle();
      if (!cr) {
        return new Response(JSON.stringify({ error: "custom_role_id not found." }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (authError) {
      return new Response(JSON.stringify({ error: authError.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = authData.user.id;

    const profilePayload: Record<string, unknown> = {
      id: userId,
      email,
      mobile: "0000000000",
      full_name,
      role: "admin",
      is_verified: true,
      notification_sms: false,
      notification_whatsapp: false,
    };

    if (hasCustom) {
      profilePayload.custom_role_id = custom_role_id;
      profilePayload.admin_role = null;
    } else {
      profilePayload.admin_role = admin_role;
      profilePayload.custom_role_id = null;
    }

    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .upsert(profilePayload);

    if (profileError) {
      await supabaseAdmin.auth.admin.deleteUser(userId);
      return new Response(JSON.stringify({ error: profileError.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({ success: true, userId }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
