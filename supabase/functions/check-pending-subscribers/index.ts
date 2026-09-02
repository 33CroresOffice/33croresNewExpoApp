import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const respond = (body: object, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const serviceSupabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // 24 hours ago — customers whose last login was >= 24h ago
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    // Single SQL query: finds users whose last login was >= 24h ago,
    // have no active/pending/renewed/paused subscription,
    // and have no prior subscription_pending notification (non-skipped)
    const { data: eligibleUsers, error: queryError } = await serviceSupabase.rpc(
      "get_pending_subscriber_reminders",
      { cutoff_ts: cutoff }
    );

    if (queryError) {
      console.error("Error fetching eligible users:", queryError);
      return respond({ success: false, error: "Failed to fetch eligible users: " + queryError.message }, 500);
    }

    if (!eligibleUsers || eligibleUsers.length === 0) {
      return respond({ success: true, checked: 0, sent: 0, skipped: 0 });
    }

    // Fetch the active automated WhatsApp template for subscription_pending
    const { data: template } = await serviceSupabase
      .from("notification_templates")
      .select("id")
      .eq("event_type", "subscription_pending")
      .eq("channel", "whatsapp")
      .eq("is_active", true)
      .eq("is_automated", true)
      .maybeSingle();

    if (!template) {
      return respond({
        success: false,
        error: "No active automated WhatsApp template found for subscription_pending",
      }, 500);
    }

    // Send notifications in parallel batches of 10
    const BATCH_SIZE = 10;
    let sentCount = 0;
    let failedCount = 0;

    for (let i = 0; i < eligibleUsers.length; i += BATCH_SIZE) {
      const batch = eligibleUsers.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map((user: { eligible_user_id: string }) =>
          fetch(`${supabaseUrl}/functions/v1/send-notification`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${serviceKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              user_id: user.eligible_user_id,
              event_type: "subscription_pending",
              channel: "whatsapp",
              template_id: template.id,
              variables: {},
            }),
          })
        )
      );

      for (const r of results) {
        if (r.status === "fulfilled" && r.value.ok) {
          sentCount++;
        } else {
          failedCount++;
        }
      }
    }

    return respond({
      success: true,
      checked: eligibleUsers.length,
      sent: sentCount,
      failed: failedCount,
      skipped: 0,
    });
  } catch (err) {
    console.error("check-pending-subscribers error:", err);
    return respond({ success: false, error: "Internal server error: " + String(err) }, 500);
  }
});
