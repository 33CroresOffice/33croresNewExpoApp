import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

function nowInIST(): Date {
  return new Date(Date.now() + IST_OFFSET_MS);
}

function istDateStr(d: Date): string {
  return d.toISOString().split("T")[0];
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function getNextDeliveryDate(currentDate: Date, frequency: string): Date {
  switch (frequency) {
    case "daily":
      return addDays(currentDate, 1);
    case "weekly":
      return addDays(currentDate, 7);
    case "biweekly":
      return addDays(currentDate, 14);
    case "monthly":
    default: {
      const next = new Date(currentDate);
      next.setMonth(next.getMonth() + 1);
      return next;
    }
  }
}

function dateLE(a: string, b: string): boolean {
  return a <= b;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const serviceSupabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const today = nowInIST();
    const todayStr = istDateStr(today);
    const tomorrowStr = istDateStr(addDays(today, 1));

    // Fetch active subscriptions whose next_delivery_date is tomorrow or earlier
    const { data: subscriptions, error } = await serviceSupabase
      .from("subscriptions")
      .select("id, user_id, next_delivery_date, end_date, new_end_date, plan:subscription_plans(frequency)")
      .eq("status", "active")
      .lte("next_delivery_date", tomorrowStr);

    if (error) {
      console.error("Fetch subscriptions error:", error);
      return new Response(
        JSON.stringify({ success: false, error: "Failed to fetch subscriptions" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Batch-fetch all active pauses for these subscriptions
    const subIds = (subscriptions ?? []).map(s => s.id);
    const { data: allPauses } = await serviceSupabase
      .from("subscription_pause_history")
      .select("subscription_id, pause_start_date, pause_until")
      .eq("is_cancelled", false)
      .in("subscription_id", subIds);

    const pauseMap: Record<string, Array<{ pause_start_date: string; pause_until: string }>> = {};
    for (const p of allPauses ?? []) {
      if (!pauseMap[p.subscription_id]) pauseMap[p.subscription_id] = [];
      pauseMap[p.subscription_id].push(p);
    }

    // Batch-fetch all existing orders for tomorrow (the only date we create orders for)
    const { data: existingOrders } = await serviceSupabase
      .from("orders")
      .select("subscription_id, scheduled_date")
      .eq("scheduled_date", tomorrowStr)
      .in("subscription_id", subIds);

    const existingOrderSet = new Set(
      (existingOrders ?? []).map(o => `${o.subscription_id}:${o.scheduled_date}`)
    );

    // Also batch-fetch existing orders for today (in case catch-up creates today's orders)
    const { data: todayOrders } = await serviceSupabase
      .from("orders")
      .select("subscription_id, scheduled_date")
      .eq("scheduled_date", todayStr)
      .in("subscription_id", subIds);

    for (const o of todayOrders ?? []) {
      existingOrderSet.add(`${o.subscription_id}:${o.scheduled_date}`);
    }

    const ordersToInsert: Array<{
      subscription_id: string;
      user_id: string;
      scheduled_date: string;
      status: string;
    }> = [];
    const subUpdates: Array<{ id: string; next_delivery_date: string }> = [];

    for (const sub of subscriptions ?? []) {
      const frequency = sub.plan?.frequency ?? "monthly";
      let currentDateStr: string = sub.next_delivery_date;
      let currentDate = new Date(currentDateStr + "T00:00:00Z");
      const endDateStr = sub.new_end_date ?? sub.end_date;
      const pauses = pauseMap[sub.id] ?? [];

      // We only create orders for today and tomorrow (the delivery window)
      // Past dates are skipped — we just advance next_delivery_date forward
      while (dateLE(currentDateStr, tomorrowStr)) {
        // Skip deliveries past the subscription end date
        if (endDateStr && currentDateStr > endDateStr) break;

        // Only create orders for today and tomorrow
        if (currentDateStr >= todayStr) {
          const isPaused = pauses.some(
            p => p.pause_start_date <= currentDateStr && p.pause_until >= currentDateStr
          );

          if (!isPaused) {
            const orderKey = `${sub.id}:${currentDateStr}`;
            if (!existingOrderSet.has(orderKey)) {
              ordersToInsert.push({
                subscription_id: sub.id,
                user_id: sub.user_id,
                scheduled_date: currentDateStr,
                status: "scheduled",
              });
              existingOrderSet.add(orderKey);
            }
          }
        }

        // Advance to next delivery date
        currentDate = getNextDeliveryDate(currentDate, frequency);
        currentDateStr = istDateStr(currentDate);
      }

      subUpdates.push({ id: sub.id, next_delivery_date: currentDateStr });
    }

    // Batch insert all new orders
    let created = 0;
    if (ordersToInsert.length > 0) {
      const { error: insertErr } = await serviceSupabase
        .from("orders")
        .insert(ordersToInsert);
      if (insertErr) {
        console.error("Insert orders error:", insertErr);
      } else {
        created = ordersToInsert.length;
      }
    }

    // Batch update next_delivery_date for all subscriptions
    for (const update of subUpdates) {
      await serviceSupabase
        .from("subscriptions")
        .update({ next_delivery_date: update.next_delivery_date })
        .eq("id", update.id);
    }

    console.log(`Generated ${created} new orders for ${todayStr}, advanced ${subUpdates.length} subscriptions`);

    return new Response(
      JSON.stringify({ success: true, orders_created: created, subscriptions_advanced: subUpdates.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("generate-orders error:", err);
    return new Response(
      JSON.stringify({ success: false, error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
