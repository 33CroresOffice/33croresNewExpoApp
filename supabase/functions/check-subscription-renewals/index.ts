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

    const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
    const nowUtc = Date.now();
    const nowIST = new Date(nowUtc + IST_OFFSET_MS);

    const todayIST = nowIST.toISOString().split("T")[0];

    const fiveDaysLater = new Date(nowIST);
    fiveDaysLater.setUTCDate(fiveDaysLater.getUTCDate() + 5);
    const fiveDaysLaterStr = fiveDaysLater.toISOString().split("T")[0];

    const twoDaysAgo = new Date(nowIST);
    twoDaysAgo.setUTCDate(twoDaysAgo.getUTCDate() - 2);
    const twoDaysAgoStr = twoDaysAgo.toISOString().split("T")[0];

    let notifiedCount = 0;
    let expiredCount = 0;

    // ── 1. Find subscriptions expiring in exactly 5 days (send reminder) ──────
    const { data: expiringSoon, error: expiringSoonError } = await serviceSupabase
      .from("subscriptions")
      .select("id, user_id, plan_id, end_date, renewal_status, renewal_notified_at")
      .in("status", ["active", "paused"])
      .eq("end_date", fiveDaysLaterStr)
      .eq("renewal_status", "none");

    if (expiringSoonError) {
      console.error("Error fetching expiring subscriptions:", expiringSoonError);
    } else if (expiringSoon && expiringSoon.length > 0) {
      for (const sub of expiringSoon) {
        // Get plan name for the task title
        const { data: plan } = await serviceSupabase
          .from("subscription_plans")
          .select("name")
          .eq("id", sub.plan_id)
          .maybeSingle();

        const planName = plan?.name ?? "subscription";

        // Create a CRM renewal task
        await serviceSupabase.from("crm_tasks").insert({
          title: `Renewal reminder: ${planName}`,
          description: `Subscription ends on ${sub.end_date}. Contact customer to renew.`,
          task_type: "renewal",
          priority: "high",
          status: "open",
          due_date: sub.end_date,
          customer_id: sub.user_id,
        });

        // Log activity
        await serviceSupabase.from("customer_activity_log").insert({
          customer_id: sub.user_id,
          activity_type: "note_added",
          description: `Renewal reminder created: ${planName} expires on ${sub.end_date}`,
          metadata: { subscription_id: sub.id, trigger: "auto_renewal_check" },
        });

        // Mark subscription as notified
        await serviceSupabase
          .from("subscriptions")
          .update({
            renewal_status: "notified",
            renewal_notified_at: new Date().toISOString(),
          })
          .eq("id", sub.id);

        notifiedCount++;
      }
    }

    // ── 2. Expire subscriptions past the 2-day grace period ──────────────────
    const { data: toExpire, error: expireError } = await serviceSupabase
      .from("subscriptions")
      .select("id, user_id, plan_id, end_date")
      .in("status", ["active", "paused"])
      .not("end_date", "is", null)
      .lt("end_date", twoDaysAgoStr);

    if (expireError) {
      console.error("Error fetching subscriptions to expire:", expireError);
    } else if (toExpire && toExpire.length > 0) {
      for (const sub of toExpire) {
        await serviceSupabase
          .from("subscriptions")
          .update({
            status: "expired",
            renewal_status: "expired",
          })
          .eq("id", sub.id);

        // Log activity
        await serviceSupabase.from("customer_activity_log").insert({
          customer_id: sub.user_id,
          activity_type: "subscription_cancelled",
          description: `Subscription expired (end date: ${sub.end_date}, grace period elapsed)`,
          metadata: { subscription_id: sub.id, trigger: "auto_renewal_check" },
        });

        expiredCount++;
      }
    }

    return respond({
      success: true,
      date_checked: todayIST,
      notified_count: notifiedCount,
      expired_count: expiredCount,
    });
  } catch (err) {
    console.error("check-subscription-renewals error:", err);
    return respond({ success: false, error: "Internal server error: " + String(err) }, 500);
  }
});
