import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

async function getSecret(supabaseClient: ReturnType<typeof createClient>, key: string): Promise<string | undefined> {
  try {
    const { data } = await supabaseClient
      .from('secret_keys')
      .select('value')
      .eq('key', key)
      .maybeSingle();
    if (data?.value) return data.value;
  } catch { /* table not available */ }
  return Deno.env.get(key);
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

async function hashOtp(supabaseClient: ReturnType<typeof createClient>, otp: string): Promise<string> {
  const secret = (await getSecret(supabaseClient, "OTP_SECRET")) ?? "";
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

    const otpHash = await hashOtp(supabase, String(otp));
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

    const secret = (await getSecret(supabase, "OTP_SECRET")) ?? "";
    const password = `petal_${mobile}_${secret}`;

    // Check if a profile already exists for this mobile (may belong to a legacy @customers.internal account)
    const { data: profileByMobileEarly } = await supabase
      .from("profiles")
      .select("id, mobile, role")
      .eq("mobile", mobile)
      .maybeSingle();

    // If a profile exists, find the canonical auth account for that profile id
    // and use that account so the user logs into their existing data
    let canonicalEmail: string | null = null;
    let userId: string | null = null;

    if (profileByMobileEarly) {
      // Look up the auth user whose id matches the profile
      try {
        const { data: canonicalRows } = await supabase.rpc("get_auth_user_by_id", { p_id: profileByMobileEarly.id });
        if (canonicalRows && canonicalRows.length > 0) {
          canonicalEmail = canonicalRows[0].email;
          userId = canonicalRows[0].id;
        }
      } catch (e) {
        console.error("get_auth_user_by_id error:", e);
      }
    }

    // Fall back to petal.app email scheme if no canonical account found
    const email = canonicalEmail ?? `${mobile}@petal.app`;

    if (!userId) {
      const { data: authUserRows, error: authLookupError } = await supabase
        .rpc("get_auth_user_by_email", { p_email: email });

      if (!authLookupError && authUserRows && authUserRows.length > 0) {
        userId = authUserRows[0].id;
      }
    }

    if (!userId) {
      const newEmail = `${mobile}@petal.app`;
      const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
        email: newEmail,
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

    // Check if mobile belongs to an approved rider (for linking profile_id only)
    const { data: riderRecord } = await supabase
      .from("riders")
      .select("id, approval_status, full_name")
      .eq("mobile", mobile)
      .maybeSingle();

    const isApprovedRider = riderRecord?.approval_status === "approved";

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
        const fullName = isApprovedRider ? (riderRecord?.full_name ?? "") : "";
        const { error: profileError } = await supabase.from("profiles").insert({
          id: userId,
          mobile,
          full_name: fullName,
          role: "customer",
          is_verified: true,
        });
        if (profileError) {
          console.error("Profile creation error:", profileError);
        }
      }
    }

    // Link rider profile_id if this is an approved rider — without changing profile.role
    if (isApprovedRider && riderRecord) {
      await supabase.from("riders").update({ profile_id: userId }).eq("id", riderRecord.id);
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
