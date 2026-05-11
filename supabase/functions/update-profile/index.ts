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
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Verify the token and get user info using service client
    const { data: { user }, error: userError } = await serviceClient.auth.getUser(
      authHeader.replace("Bearer ", "")
    );

    if (userError || !user) {
      console.error("Auth error:", userError);
      return new Response(
        JSON.stringify({ success: false, error: "Invalid or expired session" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const full_name = body?.full_name;

    if (!full_name || full_name.trim().length < 2) {
      return new Response(
        JSON.stringify({ success: false, error: "Full name must be at least 2 characters" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update only full_name on the existing profile row
    const { data: updated, error: updateError } = await serviceClient
      .from("profiles")
      .update({ full_name: full_name.trim(), updated_at: new Date().toISOString() })
      .eq("id", user.id)
      .select()
      .maybeSingle();

    if (updateError) {
      console.error("Profile update error:", updateError);
      return new Response(
        JSON.stringify({ success: false, error: "Failed to update profile", detail: updateError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // If profile row doesn't exist yet, insert it
    if (!updated) {
      const mobile = user.user_metadata?.mobile ?? user.email?.replace("@petal.app", "") ?? "";
      const { data: inserted, error: insertError } = await serviceClient
        .from("profiles")
        .insert({ id: user.id, mobile, full_name: full_name.trim(), role: "customer", is_verified: true })
        .select()
        .single();

      if (insertError) {
        console.error("Profile insert error:", insertError);
        return new Response(
          JSON.stringify({ success: false, error: "Failed to create profile", detail: insertError.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ success: true, profile: inserted }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, profile: updated }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("update-profile error:", err);
    return new Response(
      JSON.stringify({ success: false, error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
