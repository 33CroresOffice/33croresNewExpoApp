import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

async function hashOtp(otp: string): Promise<string> {
  const secret = Deno.env.get("OTP_SECRET") ?? "";
  const encoder = new TextEncoder();
  const data = encoder.encode(otp + secret);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { mobile, otp } = await req.json();

    if (!mobile || !otp) {
      return new Response(
        JSON.stringify({ success: false, error: "Mobile and OTP are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const otpHash = await hashOtp(String(otp));
    const now = new Date().toISOString();

    const { data: otpRecord, error: fetchError } = await supabase
      .from("otp_requests")
      .select("*")
      .eq("mobile", mobile)
      .eq("otp_hash", otpHash)
      .eq("is_used", false)
      .gte("expires_at", now)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (fetchError) {
      console.error("[verify-otp] fetchError:", fetchError);
    }

    if (fetchError || !otpRecord) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid or expired OTP. Please request a new one." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    await supabase
      .from("otp_requests")
      .update({ is_used: true })
      .eq("id", otpRecord.id);

    const email = `${mobile}@petal.app`;
    const secret = Deno.env.get("OTP_SECRET") ?? "";
    const password = `petal_${mobile}_${secret}`;

    const { data: authUserRows, error: authLookupError } = await supabase
      .rpc("get_auth_user_by_email", { p_email: email });

    let userId: string | null = null;

    if (!authLookupError && authUserRows && authUserRows.length > 0) {
      userId = authUserRows[0].id;
    }

    if (!userId) {
      const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { mobile },
      });

      if (createError || !newUser?.user) {
        console.error("Create user error:", createError);
        return new Response(
          JSON.stringify({ success: false, error: `createUser failed: ${createError?.message}` }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      userId = newUser.user.id;
    } else {
      const { error: updateError } = await supabase.auth.admin.updateUserById(userId, { password });
      if (updateError) {
        console.error("Password update error:", updateError);
      }
    }

    const { data: profileById } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .maybeSingle();

    if (!profileById) {
      const { data: profileByMobile } = await supabase
        .from("profiles")
        .select("*")
        .eq("mobile", mobile)
        .maybeSingle();

      if (profileByMobile) {
        const { error: profileInsertError } = await supabase.from("profiles").insert({
          id: userId,
          mobile: profileByMobile.mobile,
          full_name: profileByMobile.full_name,
          email: profileByMobile.email,
          gender: profileByMobile.gender,
          date_of_birth: profileByMobile.date_of_birth,
          role: profileByMobile.role ?? "customer",
          is_verified: true,
          notification_sms: profileByMobile.notification_sms,
          notification_whatsapp: profileByMobile.notification_whatsapp,
          avatar_url: profileByMobile.avatar_url,
          about: profileByMobile.about,
        });
        if (profileInsertError) {
          console.error("Profile copy error:", profileInsertError);
        }
      } else {
        const { error: profileError } = await supabase.from("profiles").insert({
          id: userId,
          mobile,
          role: "customer",
          is_verified: true,
        });
        if (profileError) {
          console.error("Profile creation error:", profileError);
        }
      }
    }

    return new Response(
      JSON.stringify({ success: true, email, password }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("verify-otp error:", err);
    return new Response(
      JSON.stringify({ success: false, error: `Unhandled exception: ${err?.message ?? String(err)}` }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
