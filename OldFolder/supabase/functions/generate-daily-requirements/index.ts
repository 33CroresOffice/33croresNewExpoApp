import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const body = await req.json().catch(() => ({}));
    const targetDate: string = body.date ?? new Date().toISOString().split("T")[0];

    const dateObj = new Date(targetDate + "T00:00:00Z");
    const dayOfWeek = dateObj.getUTCDay();

    // --- 1. Subscription-based requirements ---
    const { data: activeSubs, error: subsErr } = await supabase
      .from("subscriptions")
      .select(`
        id,
        plan:subscription_plans(
          id,
          frequency,
          deliveries_per_month,
          flower_requirements:plan_flower_requirements(
            flower_type_id,
            quantity_per_delivery,
            unit_type
          )
        )
      `)
      .eq("status", "active");

    if (subsErr) throw new Error("Failed to fetch subscriptions: " + subsErr.message);

    // flower_type_id -> { total_quantity, unit_type, sub_count, custom_count }
    const flowerTotals: Record<string, {
      total_quantity: number;
      unit_type: string;
      sub_count: number;
      custom_count: number;
    }> = {};

    for (const sub of activeSubs ?? []) {
      const plan = sub.plan as any;
      if (!plan) continue;

      const shouldDeliver = shouldDeliverOnDate(plan.frequency, dayOfWeek, dateObj);
      if (!shouldDeliver) continue;

      for (const req of (plan.flower_requirements ?? [])) {
        const key = req.flower_type_id;
        if (!flowerTotals[key]) {
          flowerTotals[key] = { total_quantity: 0, unit_type: req.unit_type, sub_count: 0, custom_count: 0 };
        }
        flowerTotals[key].total_quantity += Number(req.quantity_per_delivery);
        flowerTotals[key].sub_count += 1;
      }
    }

    // --- 2. Custom orders for the target date ---
    const { data: customOrders, error: customErr } = await supabase
      .from("custom_orders")
      .select("id, items")
      .eq("delivery_date", targetDate)
      .not("status", "in", '("cancelled","rejected")');

    if (customErr) throw new Error("Failed to fetch custom orders: " + customErr.message);

    // Load all flower types for name -> id matching
    const { data: flowerTypes, error: ftErr } = await supabase
      .from("flower_types")
      .select("id, display_name, unit_type");

    if (ftErr) throw new Error("Failed to fetch flower types: " + ftErr.message);

    const nameToFlowerType: Record<string, { id: string; unit_type: string }> = {};
    for (const ft of flowerTypes ?? []) {
      nameToFlowerType[(ft.display_name as string).toLowerCase().trim()] = {
        id: ft.id,
        unit_type: ft.unit_type,
      };
    }

    for (const order of customOrders ?? []) {
      const items = Array.isArray(order.items) ? order.items : [];
      for (const item of items) {
        const flowerName = (item.flower_name ?? "").toLowerCase().trim();
        const qty = Number(item.quantity ?? 0);
        const unit = (item.unit ?? "").toLowerCase().trim();
        if (!flowerName || qty <= 0) continue;

        const match = nameToFlowerType[flowerName];
        if (match) {
          const key = match.id;
          if (!flowerTotals[key]) {
            flowerTotals[key] = { total_quantity: 0, unit_type: unit || match.unit_type, sub_count: 0, custom_count: 0 };
          }
          flowerTotals[key].total_quantity += qty;
          flowerTotals[key].custom_count += 1;
        } else {
          // Unmatched flower name: use a synthetic key so it still appears
          const syntheticKey = `__custom__${flowerName}`;
          if (!flowerTotals[syntheticKey]) {
            flowerTotals[syntheticKey] = { total_quantity: 0, unit_type: unit || "pieces", sub_count: 0, custom_count: 0 };
          }
          flowerTotals[syntheticKey].total_quantity += qty;
          flowerTotals[syntheticKey].custom_count += 1;
        }
      }
    }

    // Filter out synthetic keys (unmatched custom order flowers have no flower_type_id, skip upsert)
    const matchedEntries = Object.entries(flowerTotals).filter(([k]) => !k.startsWith("__custom__"));

    if (matchedEntries.length === 0) {
      return new Response(
        JSON.stringify({ message: "No deliveries scheduled for this date", date: targetDate, requirements: [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const upserts = matchedEntries.map(([flower_type_id, data]) => ({
      requirement_date: targetDate,
      flower_type_id,
      total_quantity: data.total_quantity,
      unit_type: data.unit_type,
      active_subscriptions_count: data.sub_count,
      custom_orders_count: data.custom_count,
      status: "pending",
      updated_at: new Date().toISOString(),
    }));

    const { data: inserted, error: upsertErr } = await supabase
      .from("daily_requirements")
      .upsert(upserts, { onConflict: "requirement_date,flower_type_id", ignoreDuplicates: false })
      .select();

    if (upsertErr) throw new Error("Failed to upsert requirements: " + upsertErr.message);

    return new Response(
      JSON.stringify({
        message: "Daily requirements generated successfully",
        date: targetDate,
        requirements: inserted ?? [],
        count: (inserted ?? []).length,
        subscription_deliveries: matchedEntries.reduce((s, [, d]) => s + d.sub_count, 0),
        custom_order_items: matchedEntries.reduce((s, [, d]) => s + d.custom_count, 0),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message ?? "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function shouldDeliverOnDate(frequency: string, dayOfWeek: number, date: Date): boolean {
  const dayNum = date.getUTCDate();
  switch (frequency) {
    case "daily":
      return true;
    case "weekly":
      return dayOfWeek === 1;
    case "biweekly":
      return dayOfWeek === 1 || dayOfWeek === 4;
    case "monthly":
      return dayNum === 1;
    default:
      return dayOfWeek === 1;
  }
}
