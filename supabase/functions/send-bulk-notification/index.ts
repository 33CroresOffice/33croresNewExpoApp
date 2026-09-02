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

function renderTemplate(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? "");
}

async function sendSMS(
  mobile: string,
  body: string,
  templateId: string | null,
  apiKey: string,
): Promise<{ success: boolean; response: unknown }> {
  const url = templateId
    ? `https://control.msg91.com/api/v5/flow/`
    : `https://api.msg91.com/api/v5/sendsms`;

  const payload: Record<string, unknown> = {
    sender: "33CROS",
    message: body,
    mobiles: mobile,
  };

  if (templateId) {
    payload.template_id = templateId;
    payload.short_url = "0";
  }

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      authkey: apiKey,
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json();
  return { success: res.ok, response: data };
}

async function sendWhatsApp(
  mobile: string,
  body: string,
  templateId: string | null,
  namespace: string | null,
  apiKey: string,
  whatsappNumber: string,
  globalTemplateId: string,
  globalNamespace: string,
  waVariables: string[] | null,
  allVars: Record<string, string>,
  language: string = "en",
): Promise<{ success: boolean; response: unknown; error?: string }> {
  const waTemplateId = templateId || globalTemplateId;
  const waNamespace = namespace || globalNamespace;

  if (!waTemplateId) {
    return {
      success: false,
      response: null,
      error: "WhatsApp template not configured — no template ID found. Set MSG91_WHATSAPP_TEMPLATE_ID secret or configure per-template WhatsApp template ID.",
    };
  }

  // Ensure mobile has country code prefix (91 for India)
  const recipientNumber = mobile.startsWith("91") ? mobile : `91${mobile}`;

  const url = "https://api.msg91.com/api/v5/whatsapp/whatsapp-outbound-message/bulk/";

  // Build components using named variable keys (body_<var_name>) matching MSG91's NAMED parameter format.
  const components: Record<string, { type: string; value: string }> = {};

  if (waVariables && waVariables.length > 0) {
    waVariables.forEach((varName) => {
      const componentKey = `body_${varName}`;
      const value = allVars[varName] ?? "";
      components[componentKey] = { type: "text", value };
    });
  } else {
    // Fallback: no variable mapping defined, send rendered body as body_1
    components["body_1"] = { type: "text", value: body };
  }

  const payload = {
    integrated_number: whatsappNumber,
    content_type: "template",
    payload: {
      messaging_product: "whatsapp",
      type: "template",
      template: {
        name: waTemplateId,
        language: {
          code: language,
          policy: "deterministic",
        },
        namespace: waNamespace,
        to_and_components: [
          {
            to: [recipientNumber],
            components,
          },
        ],
      },
    },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      authkey: apiKey,
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json();
  const isSuccess = res.ok && data?.status !== "fail" && !data?.hasError;
  return { success: isSuccess, response: data, error: isSuccess ? undefined : (data?.errors || data?.message || `MSG91 WhatsApp request failed (${res.status}).`) };
}

async function sendPush(
  pushToken: string,
  title: string,
  body: string,
): Promise<{ success: boolean; response: unknown }> {
  const message = {
    to: pushToken,
    sound: "default",
    title: title,
    body: body,
  };

  const res = await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(message),
  });

  const data = await res.json();
  return { success: res.ok, response: data };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const {
      user_ids,
      template_id,
      event_type,
      channel,
      variables = {},
      triggered_by = null,
      custom_subject = null,
      custom_body = null,
    } = await req.json();

    if (!user_ids || !Array.isArray(user_ids) || user_ids.length === 0) {
      return new Response(
        JSON.stringify({ error: "user_ids array is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!channel) {
      return new Response(
        JSON.stringify({ error: "channel is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, mobile, full_name")
      .in("id", user_ids);

    if (!profiles || profiles.length === 0) {
      return new Response(
        JSON.stringify({ error: "No user profiles found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let template: { body: string; subject: string | null; msg91_template_id: string | null; msg91_whatsapp_template_id: string | null; msg91_whatsapp_namespace: string | null; msg91_whatsapp_variables: string[] | null } | null = null;

    if (custom_body) {
      template = {
        body: custom_body,
        subject: custom_subject,
        msg91_template_id: null,
        msg91_whatsapp_template_id: null,
        msg91_whatsapp_namespace: null,
        msg91_whatsapp_variables: null,
      };
    } else if (template_id) {
      const { data } = await supabase
        .from("notification_templates")
        .select("body, subject, msg91_template_id, msg91_whatsapp_template_id, msg91_whatsapp_namespace, msg91_whatsapp_variables")
        .eq("id", template_id)
        .maybeSingle();
      template = data;
    } else if (event_type) {
      const { data } = await supabase
        .from("notification_templates")
        .select("body, subject, msg91_template_id, msg91_whatsapp_template_id, msg91_whatsapp_namespace, msg91_whatsapp_variables")
        .eq("event_type", event_type)
        .eq("channel", channel)
        .eq("is_active", true)
        .maybeSingle();
      template = data;
    }

    if (!template) {
      return new Response(
        JSON.stringify({ error: "No matching template found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const msg91ApiKey = (await getSecret(supabase, "MSG91_API_KEY")) ?? "";
    const whatsappNumber = (await getSecret(supabase, "MSG91_WHATSAPP_NUMBER")) ?? "";
    const globalWaTemplateId = (await getSecret(supabase, "MSG91_WHATSAPP_TEMPLATE_ID")) ?? "";
    const globalWaNamespace = (await getSecret(supabase, "MSG91_WHATSAPP_NAMESPACE")) ?? "";

    // Heavy rainfall specific WhatsApp template override
    const heavyRainfallTemplateName = (await getSecret(supabase, "MSG91_WHATSAPP_HEAVY_RAINFALL_TEMPLATE_NAME")) ?? "";
    const heavyRainfallLanguage = (await getSecret(supabase, "MSG91_WHATSAPP_HEAVY_RAINFALL_LANGUAGE")) ?? "en";

    const isHeavyRainfall = event_type === "heavy_rainfall";
    const waTemplateIdForSend = isHeavyRainfall && heavyRainfallTemplateName
      ? heavyRainfallTemplateName
      : template.msg91_whatsapp_template_id;
    const waLanguageForSend = isHeavyRainfall ? heavyRainfallLanguage : "en";

    const results: Array<{ user_id: string; status: string; error?: string }> = [];

    for (const profile of profiles) {
      const allVars: Record<string, string> = {
        customer_name: profile.full_name || "Customer",
        ...variables,
      };

      const renderedBody = renderTemplate(template.body, allVars);
      const renderedSubject = template.subject
        ? renderTemplate(template.subject, allVars)
        : null;

      let status = "sent";
      let errorMessage: string | null = null;
      let providerResponse: unknown = null;

      if (channel === "sms") {
        const result = await sendSMS(
          profile.mobile,
          renderedBody,
          template.msg91_template_id,
          msg91ApiKey,
        );
        if (!result.success) status = "failed";
        providerResponse = result.response;
      } else if (channel === "whatsapp") {
        const result = await sendWhatsApp(
          profile.mobile,
          renderedBody,
          waTemplateIdForSend,
          template.msg91_whatsapp_namespace,
          msg91ApiKey,
          whatsappNumber,
          globalWaTemplateId,
          globalWaNamespace,
          template.msg91_whatsapp_variables,
          allVars,
          waLanguageForSend,
        );
        if (!result.success) {
          status = "failed";
          errorMessage = result.error || "WhatsApp send failed";
        }
        providerResponse = result.response;
      } else if (channel === "in_app") {
        const { error: inAppError } = await supabase
          .from("in_app_notifications")
          .insert({
            user_id: profile.id,
            title: renderedSubject || "Notification",
            body: renderedBody,
            event_type: event_type || "custom",
            is_read: false,
          });

        if (inAppError) {
          status = "failed";
          errorMessage = inAppError.message;
        }
        providerResponse = { inserted: status === "sent" };
      } else if (channel === "push") {
        // Check user's push preference before sending
        const { data: prefRow } = await supabase
          .from("notification_preferences")
          .select("push_enabled")
          .eq("user_id", profile.id)
          .maybeSingle();

        if (prefRow && prefRow.push_enabled === false) {
          status = "skipped";
          errorMessage = "Push disabled in user preferences";
          providerResponse = { skipped: true };
        } else {
          const { data: pushTokenRow } = await supabase
            .from("expo_push_tokens")
            .select("token")
            .eq("user_id", profile.id)
            .maybeSingle();

          if (!pushTokenRow) {
            status = "skipped";
            errorMessage = "No push token registered for user";
            providerResponse = { skipped: true };
          } else {
            const result = await sendPush(
              pushTokenRow.token,
              renderedSubject || "Notification",
              renderedBody,
            );
            if (!result.success) status = "failed";
            providerResponse = result.response;
          }
        }
      }

      // Capture push token for log when applicable
      let recipientPushToken: string | null = null;
      if (channel === "push" && status !== "skipped") {
        const { data: tokenRow } = await supabase
          .from("expo_push_tokens")
          .select("token")
          .eq("user_id", profile.id)
          .maybeSingle();
        recipientPushToken = tokenRow?.token ?? null;
      }

      await supabase.from("notification_logs").insert({
        user_id: profile.id,
        event_type: event_type || "custom",
        channel,
        template_id: template_id || null,
        recipient_mobile: profile.mobile,
        recipient_push_token: recipientPushToken,
        rendered_subject: renderedSubject,
        rendered_body: renderedBody,
        status,
        error_message: errorMessage,
        provider_response: providerResponse,
        triggered_by,
        sent_at: status === "sent" ? new Date().toISOString() : null,
      });

      results.push({
        user_id: profile.id,
        status,
        ...(errorMessage ? { error: errorMessage } : {}),
      });
    }

    const successCount = results.filter((r) => r.status === "sent").length;
    const failedCount = results.filter((r) => r.status === "failed").length;
    const skippedCount = results.filter((r) => r.status === "skipped").length;
    return new Response(
      JSON.stringify({
        success: failedCount === 0,
        total: results.length,
        sent: successCount,
        failed: failedCount,
        skipped: skippedCount,
        results,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
