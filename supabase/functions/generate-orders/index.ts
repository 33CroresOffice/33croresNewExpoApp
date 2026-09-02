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
    default:
      const next = new Date(currentDate);
      next.setMonth(next.getMonth() + 1);
      return next;
  }
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

    // Fetch active subscriptions whose next_delivery_date is today or tomorrow
    const { data: subscriptions, error } = await serviceSupabase
      .from("subscriptions")
      .select("*, plan:subscription_plans(frequency)")
      .eq("status", "active")
      .lte("next_delivery_date", tomorrowStr)
      .gte("next_delivery_date", todayStr);

    if (error) {
      console.error("Fetch subscriptions error:", error);
      return new Response(
        JSON.stringify({ success: false, error: "Failed to fetch subscriptions" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let created = 0;

    for (const sub of subscriptions ?? []) {
      // Check if this delivery date falls within an active pause period
      const { data: pauses } = await serviceSupabase
        .from("subscription_pause_history")
        .select("pause_start_date, pause_until")
        .eq("subscription_id", sub.id)
        .eq("is_cancelled", false)
        .lte("pause_start_date", sub.next_delivery_date)
        .gte("pause_until", sub.next_delivery_date);

      const isPaused = (pauses ?? []).length > 0;

      if (!isPaused) {
        // Check if order already exists for this date
        const { count } = await serviceSupabase
          .from("orders")
          .select("*", { count: "exact", head: true })
          .eq("subscription_id", sub.id)
          .eq("scheduled_date", sub.next_delivery_date);

        if ((count ?? 0) === 0) {
          await serviceSupabase.from("orders").insert({
            subscription_id: sub.id,
            user_id: sub.user_id,
            scheduled_date: sub.next_delivery_date,
            status: "scheduled",
          });
          created++;
        }
      }

      // Advance next_delivery_date
      const nextDate = getNextDeliveryDate(
        new Date(sub.next_delivery_date + "T00:00:00Z"),
        sub.plan?.frequency ?? "monthly"
      );

      await serviceSupabase
        .from("subscriptions")
        .update({ next_delivery_date: istDateStr(nextDate) })
        .eq("id", sub.id);
    }

    console.log(`Generated ${created} new orders for ${todayStr}`);

    return new Response(
      JSON.stringify({ success: true, orders_created: created }),
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
