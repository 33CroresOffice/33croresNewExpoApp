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

function generateOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

async function hashOtp(supabaseClient: ReturnType<typeof createClient>, otp: string): Promise<string> {
  const secret = (await getSecret(supabaseClient, "OTP_SECRET")) ?? "";
  const encoder = new TextEncoder();
  const data = encoder.encode(otp + secret);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function sendWhatsapp(supabaseClient: ReturnType<typeof createClient>, mobile: string, otp: string): Promise<{ ok: boolean; error?: string }> {
  const apiKey = await getSecret(supabaseClient, "MSG91_API_KEY");
  const templateName = await getSecret(supabaseClient, "MSG91_WHATSAPP_TEMPLATE_ID");
  const integratedNumber = await getSecret(supabaseClient, "MSG91_WHATSAPP_NUMBER");
  const namespace = await getSecret(supabaseClient, "MSG91_WHATSAPP_NAMESPACE");

  if (!apiKey || !templateName || !integratedNumber) {
    console.error("MSG91 WhatsApp config missing", { apiKey: !!apiKey, templateName: !!templateName, integratedNumber: !!integratedNumber });
    return { ok: false, error: "WhatsApp service not configured" };
  }

  const recipientNumber = `91${mobile}`;

  const payload = {
    integrated_number: integratedNumber,
    content_type: "template",
    payload: {
      messaging_product: "whatsapp",
      type: "template",
      template: {
        name: templateName,
        language: { code: "en", policy: "deterministic" },
        namespace: namespace ?? "",
        to_and_components: [
          {
            to: [recipientNumber],
            components: {
              body_1: { type: "text", value: otp },
              button_1: { subtype: "url", type: "text", value: otp },
            },
          },
        ],
      },
    },
  };

  console.log("[sendWhatsapp] payload:", JSON.stringify(payload));

  const response = await fetch("https://api.msg91.com/api/v5/whatsapp/whatsapp-outbound-message/bulk/", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      authkey: apiKey,
    },
    body: JSON.stringify(payload),
  });

  const responseText = await response.text();
  console.log("[sendWhatsapp] status:", response.status, "response:", responseText);

  let parsed: Record<string, unknown> = {};
  try { parsed = JSON.parse(responseText); } catch { /* not json */ }

  const type = (parsed?.type as string) ?? "";
  const message = (parsed?.message as string) ?? "";

  if (type === "success" || response.status === 200) {
    return { ok: true };
  }

  return { ok: false, error: message || `MSG91 error (${response.status})` };
}

async function sendSms(supabaseClient: ReturnType<typeof createClient>, mobile: string, otp: string): Promise<boolean> {
  const apiKey = await getSecret(supabaseClient, "MSG91_API_KEY");
  const templateId = await getSecret(supabaseClient, "MSG91_TEMPLATE_ID");
  const senderId = (await getSecret(supabaseClient, "MSG91_SENDER_ID")) || "PETALC";

  if (!apiKey || !templateId) {
    console.error("MSG91 config missing");
    return false;
  }

  const response = await fetch("https://api.msg91.com/api/v5/otp", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      authkey: apiKey,
    },
    body: JSON.stringify({
      template_id: templateId,
      mobile: `91${mobile}`,
      authkey: apiKey,
      otp,
    }),
  });

  return response.ok;
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

    const { mobile, channel } = await req.json();

    if (!mobile || !/^[6-9]\d{9}$/.test(mobile)) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid mobile number" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!["sms", "whatsapp"].includes(channel)) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid channel" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const otp = generateOtp();
    const otpHash = await hashOtp(supabase, otp);
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

    await supabase.from("otp_requests").insert({
      mobile,
      otp_hash: otpHash,
      channel,
      expires_at: expiresAt,
      is_used: false,
    });

    let sendError: string | undefined;
    if (channel === "whatsapp") {
      const result = await sendWhatsapp(supabase, mobile, otp);
      if (!result.ok) sendError = result.error;
    } else {
      const ok = await sendSms(supabase, mobile, otp);
      if (!ok) sendError = "Failed to send SMS. Please try again.";
    }

    if (sendError) {
      return new Response(
        JSON.stringify({ success: false, error: sendError }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("send-otp error:", err);
    return new Response(
      JSON.stringify({ success: false, error: "Internal server error" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
