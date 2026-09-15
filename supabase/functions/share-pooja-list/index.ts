import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

async function getSecret(supabase: ReturnType<typeof createClient>, key: string): Promise<string> {
  const { data } = await supabase.from("secret_keys").select("value").eq("key", key).maybeSingle();
  return data?.value ?? Deno.env.get(key) ?? "";
}

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
    const { shareId } = await req.json();
    if (!shareId) {
      return new Response(JSON.stringify({ error: "Missing shareId" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Fetch the share record with provider and pooja setup details
    const { data: share, error: shareErr } = await supabase
      .from("pooja_list_shares")
      .select(`
        id,
        customer_mobile,
        share_token,
        provider:service_providers(id, full_name),
        pooja_setup:provider_pooja_setups(
          id,
          description,
          duration_minutes,
          service_fee,
          language,
          special_instructions,
          pooja_type:pooja_types(name),
          items:provider_pooja_items(
            quantity,
            pooja_item:pooja_items(name, unit_type)
          )
        )
      `)
      .eq("id", shareId)
      .is("is_revoked", false)
      .single();

    if (shareErr || !share) {
      return new Response(JSON.stringify({ error: "Share not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const providerName = (share.provider as any)?.full_name ?? "Pandit";
    const poojaName = (share.pooja_setup as any)?.pooja_type?.name ?? "Pooja";
    const items = (share.pooja_setup as any)?.items ?? [];
    const itemList = items.map((item: any) =>
      `${item.pooja_item?.name ?? "Item"} - ${item.quantity} ${item.pooja_item?.unit_type ?? ""}`
    ).join(", ");

    const shareUrl = `${Deno.env.get("SUPABASE_URL") ?? ""}/functions/v1/pooja-list-view?token=${share.share_token}`;
    const msg91ApiKey = await getSecret(supabase, "MSG91_API_KEY");
    const whatsappNumber = await getSecret(supabase, "MSG91_WHATSAPP_NUMBER");
    const whatsappTemplateId = await getSecret(supabase, "MSG91_WHATSAPP_TEMPLATE_ID");
    let smsSent = false;
    let whatsappSent = false;

    if (msg91ApiKey) {
      const smsBody = `Pandit ${providerName} has shared the ${poojaName} pooja item list. View it here: ${shareUrl}`;
      const smsResponse = await fetch("https://api.msg91.com/api/v5/sendsms", {
        method: "POST",
        headers: { "Content-Type": "application/json", authkey: msg91ApiKey },
        body: JSON.stringify({ sender: "33CROS", message: smsBody, mobiles: share.customer_mobile }),
      });
      smsSent = smsResponse.ok;
    }

    if (msg91ApiKey && whatsappNumber && whatsappTemplateId) {
      const whatsappResponse = await fetch("https://api.msg91.com/api/v5/whatsapp/whatsapp-outbound-message/bulk/", {
        method: "POST",
        headers: { "Content-Type": "application/json", authkey: msg91ApiKey },
        body: JSON.stringify({
          integrated_number: whatsappNumber,
          content_type: "template",
          payload: {
            messaging_product: "whatsapp",
            type: "template",
            template: {
              name: whatsappTemplateId,
              language: { code: "en", policy: "deterministic" },
              namespace: await getSecret(supabase, "MSG91_WHATSAPP_NAMESPACE"),
              to_and_components: [{
                to: [share.customer_mobile.startsWith("91") ? share.customer_mobile : `91${share.customer_mobile}`],
                components: {
                  body_provider_name: { type: "text", value: providerName },
                  body_pooja_name: { type: "text", value: poojaName },
                  body_share_url: { type: "text", value: shareUrl },
                },
              }],
            },
          },
        }),
      });
      whatsappSent = whatsappResponse.ok;
    }

    // Check if customer mobile matches an existing app user
    const { data: customerProfile } = await supabase
      .from("profiles")
      .select("id")
      .eq("mobile", share.customer_mobile)
      .maybeSingle();

    if (customerProfile?.id) {
      // Create in-app notification
      await supabase.from("in_app_notifications").insert({
        user_id: customerProfile.id,
        title: `Pooja List from ${providerName}`,
        body: `${providerName} has shared the item list for ${poojaName}. Tap to view.`,
        event_type: "pooja_list_shared",
        metadata: {
          share_token: share.share_token,
          provider_name: providerName,
          pooja_name: poojaName,
        },
      });
    }

    // Log the notification
    await supabase.from("notification_logs").insert({
      user_id: customerProfile?.id ?? null,
      recipient_mobile: share.customer_mobile,
      event_type: "pooja_list_shared",
      channel: "sms",
      status: smsSent || whatsappSent || Boolean(customerProfile?.id) ? "sent" : "failed",
      rendered_subject: `Pooja List from ${providerName}`,
      rendered_body: `Shared pooja list for ${poojaName} with ${share.customer_mobile}`, 
      sent_at: new Date().toISOString(),
    });

    return new Response(JSON.stringify({ success: true, shareToken: share.share_token, shareUrl }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("share-pooja-list error:", err);
    return new Response(JSON.stringify({ error: "Could not share the pooja list" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
