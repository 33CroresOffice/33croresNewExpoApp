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

    const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
    const nowUtc = Date.now();
    const nowIST = new Date(nowUtc + IST_OFFSET_MS);
    const todayIST = nowIST.toISOString().split("T")[0];

    const twoDaysAgo = new Date(nowIST);
    twoDaysAgo.setUTCDate(twoDaysAgo.getUTCDate() - 2);
    const twoDaysAgoStr = twoDaysAgo.toISOString().split("T")[0];

    let activatedCount = 0;
    let expiredCount = 0;
    let automatedNotifCount = 0;

    // Helper: call send-notification edge function
    async function sendNotification(payload: Record<string, unknown>) {
      return fetch(`${supabaseUrl}/functions/v1/send-notification`, {
        method: "POST",
        headers: { Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    }

    // Helper: fire all active automated templates for a given event type
    async function triggerAutomatedNotifications(
      userId: string,
      eventType: string,
      variables: Record<string, string>,
      subscriptionId: string,
    ) {
      const { data: templates } = await serviceSupabase
        .from("notification_templates")
        .select("id, channel")
        .eq("event_type", eventType)
        .eq("is_active", true)
        .eq("is_automated", true);

      if (!templates || templates.length === 0) return 0;

      await Promise.allSettled(
        templates.map((t) =>
          sendNotification({
            user_id: userId,
            event_type: eventType,
            channel: t.channel,
            template_id: t.id,
            variables,
            subscription_id: subscriptionId,
          })
        ),
      );
      return templates.length;
    }

    // ── 0. Auto-activate pending subscriptions whose start_date is today or past ──
    const { data: toActivate, error: activateError } = await serviceSupabase
      .from("subscriptions")
      .select("id, user_id, plan_id, start_date")
      .eq("status", "pending")
      .lte("start_date", todayIST);

    if (activateError) {
      console.error("Error fetching pending subscriptions:", activateError);
    } else if (toActivate && toActivate.length > 0) {
      for (const sub of toActivate) {
        const { error: updateErr } = await serviceSupabase
          .from("subscriptions")
          .update({ status: "active" })
          .eq("id", sub.id);

        if (updateErr) {
          console.error("Error activating subscription:", sub.id, updateErr);
          continue;
        }

        await serviceSupabase.from("customer_activity_log").insert({
          customer_id: sub.user_id,
          activity_type: "note_added",
          description: `Subscription auto-activated on start date (${sub.start_date})`,
          metadata: { subscription_id: sub.id, trigger: "auto_activation" },
        });

        // Fire subscription_activated notifications (data-driven)
        const { data: plan } = await serviceSupabase
          .from("subscription_plans")
          .select("name, price")
          .eq("id", sub.plan_id)
          .maybeSingle();

        const nextDeliveryDate = sub.start_date
          ? sub.start_date.split("-").reverse().join(".")
          : "";

        const count = await triggerAutomatedNotifications(
          sub.user_id,
          "subscription_activated",
          {
            plan_name: plan?.name ?? "",
            amount: plan?.price ? String(plan.price / 100) : "",
            next_delivery_date: nextDeliveryDate,
          },
          sub.id,
        );
        automatedNotifCount += count;
        activatedCount++;
      }
    }

    // ── 1. Data-driven time-based automated notifications ────────────────────
    // Load all active automated templates that have a send_at_days_before set
    const { data: automatedTemplates } = await serviceSupabase
      .from("notification_templates")
      .select("id, event_type, channel, send_at_days_before")
      .eq("is_automated", true)
      .eq("is_active", true)
      .not("send_at_days_before", "is", null);

    if (automatedTemplates && automatedTemplates.length > 0) {
      // Group templates by (event_type, send_at_days_before) to avoid duplicate queries
      const groups = new Map<string, { event_type: string; days_before: number; templates: { id: string; channel: string }[] }>();
      for (const t of automatedTemplates) {
        const key = `${t.event_type}::${t.send_at_days_before}`;
        if (!groups.has(key)) {
          groups.set(key, { event_type: t.event_type, days_before: t.send_at_days_before!, templates: [] });
        }
        groups.get(key)!.templates.push({ id: t.id, channel: t.channel });
      }

      for (const group of groups.values()) {
        const targetDate = new Date(nowIST);
        targetDate.setUTCDate(targetDate.getUTCDate() + group.days_before);
        const targetDateStr = targetDate.toISOString().split("T")[0];

        // Find subscriptions expiring on targetDate that haven't been notified for this event+template today
        const { data: expiringSubs } = await serviceSupabase
          .from("subscriptions")
          .select("id, user_id, plan_id, end_date")
          .in("status", ["active", "paused"])
          .eq("end_date", targetDateStr);

        if (!expiringSubs || expiringSubs.length === 0) continue;

        for (const sub of expiringSubs) {
          // Idempotency: check if any log exists today for this subscription + event_type
          const todayStart = `${todayIST}T00:00:00.000Z`;
          const tomorrowStart = new Date(nowIST);
          tomorrowStart.setUTCDate(tomorrowStart.getUTCDate() + 1);
          const tomorrowStartStr = tomorrowStart.toISOString().split("T")[0] + "T00:00:00.000Z";

          const { data: existingLog } = await serviceSupabase
            .from("notification_logs")
            .select("id")
            .eq("subscription_id", sub.id)
            .eq("event_type", group.event_type)
            .gte("created_at", todayStart)
            .lt("created_at", tomorrowStartStr)
            .maybeSingle();

          if (existingLog) continue; // Already sent today

          const { data: plan } = await serviceSupabase
            .from("subscription_plans")
            .select("name, price")
            .eq("id", sub.plan_id)
            .maybeSingle();

          const planName = plan?.name ?? "subscription";
          const variables: Record<string, string> = {
            plan_name: planName,
            end_date: sub.end_date ?? "",
            days_left: String(group.days_before),
            amount: plan?.price ? String(plan.price / 100) : "",
          };

          // Fire all templates in this group
          await Promise.allSettled(
            group.templates.map((t) =>
              sendNotification({
                user_id: sub.user_id,
                event_type: group.event_type,
                channel: t.channel,
                template_id: t.id,
                variables,
                subscription_id: sub.id,
              })
            ),
          );
          automatedNotifCount += group.templates.length;

          // Create CRM task for expiring subscriptions (3–7 day window)
          if (group.days_before >= 3 && group.days_before <= 7) {
            await serviceSupabase.from("crm_tasks").insert({
              title: `Renewal reminder: ${planName}`,
              description: `Subscription ends on ${sub.end_date}. Contact customer to renew.`,
              task_type: "renewal",
              priority: "high",
              status: "open",
              due_date: sub.end_date,
              customer_id: sub.user_id,
            });

            await serviceSupabase.from("customer_activity_log").insert({
              customer_id: sub.user_id,
              activity_type: "note_added",
              description: `Renewal reminder created: ${planName} expires on ${sub.end_date}`,
              metadata: { subscription_id: sub.id, trigger: "auto_renewal_check" },
            });

            await serviceSupabase
              .from("subscriptions")
              .update({ renewal_status: "notified", renewal_notified_at: new Date().toISOString() })
              .eq("id", sub.id)
              .eq("renewal_status", "none");
          }
        }
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
        const { data: plan } = await serviceSupabase
          .from("subscription_plans")
          .select("name")
          .eq("id", sub.plan_id)
          .maybeSingle();

        const planName = plan?.name ?? "subscription";

        await serviceSupabase
          .from("subscriptions")
          .update({ status: "expired", renewal_status: "expired" })
          .eq("id", sub.id);

        await serviceSupabase.from("customer_activity_log").insert({
          customer_id: sub.user_id,
          activity_type: "subscription_cancelled",
          description: `Subscription expired (end date: ${sub.end_date}, grace period elapsed)`,
          metadata: { subscription_id: sub.id, trigger: "auto_renewal_check" },
        });

        const count = await triggerAutomatedNotifications(
          sub.user_id,
          "subscription_expired",
          { plan_name: planName, end_date: sub.end_date ?? "" },
          sub.id,
        );
        automatedNotifCount += count;
        expiredCount++;
      }
    }

    return respond({
      success: true,
      date_checked: todayIST,
      activated_count: activatedCount,
      expired_count: expiredCount,
      automated_notifications_fired: automatedNotifCount,
    });
  } catch (err) {
    console.error("check-subscription-renewals error:", err);
    return respond({ success: false, error: "Internal server error: " + String(err) }, 500);
  }
});
