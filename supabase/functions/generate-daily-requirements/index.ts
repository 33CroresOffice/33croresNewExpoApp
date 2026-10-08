import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const allowedUnitTypes = new Set([
  "kg", "grams", "pieces", "bunch", "stems", "dozen", "ml", "litre", "packet", "tray", "box", "meter",
]);

function normalizeUnitType(value: string | null | undefined, fallback: string): string {
  const unit = (value ?? "").trim().toLowerCase();
  const aliases: Record<string, string> = {
    g: "grams",
    gm: "grams",
    gram: "grams",
    grams: "grams",
    pc: "pieces",
    pcs: "pieces",
    piece: "pieces",
    pieces: "pieces",
    bundle: "bunch",
    bundles: "bunch",
    garland: "bunch",
    garlands: "bunch",
    kilo: "kg",
    kilos: "kg",
    kilogram: "kg",
    kilograms: "kg",
    l: "litre",
    liter: "litre",
    liters: "litre",
    litre: "litre",
    litres: "litre",
    meter: "meter",
    meters: "meter",
  };
  const normalized = aliases[unit] ?? unit;
  return allowedUnitTypes.has(normalized) ? normalized : fallback;
}

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

    // --- 0. Load flower availability rules for this date ---
    const { data: availabilityRules, error: availErr } = await supabase
      .from("flower_availability")
      .select(`
        flower_type_id,
        alternate_flower_type_id,
        alternate_quantity,
        alternate_unit_type
      `)
      .lte("unavailable_from", targetDate)
      .gte("unavailable_to", targetDate);

    if (availErr) throw new Error("Failed to fetch availability: " + availErr.message);

    const substitutionMap: Record<string, {
      alternate_flower_type_id: string | null;
      alternate_quantity: number | null;
      alternate_unit_type: string | null;
    }> = {};
    for (const rule of availabilityRules ?? []) {
      substitutionMap[rule.flower_type_id] = {
        alternate_flower_type_id: rule.alternate_flower_type_id,
        alternate_quantity: rule.alternate_quantity,
        alternate_unit_type: rule.alternate_unit_type,
      };
    }

    // --- 1. Fetch eligible active subscriptions for the target date ---
    // We query subscriptions directly (not orders) so the flower calculation
    // matches the Orders page "Tomorrow Delivery" count: active, started,
    // not expired via effective end date, not paused on the target date.
    const { data: subs, error: subsErr } = await supabase
      .from("subscriptions")
      .select(`
        id,
        status,
        start_date,
        end_date,
        new_end_date,
        pause_start_date,
        pause_until,
        plan:subscription_plans(
          id,
          frequency,
          flower_requirements:plan_flower_requirements(
            flower_type_id,
            quantity_per_delivery,
            unit_type
          )
        )
      `)
      .eq("status", "active")
      .lte("start_date", targetDate)
      .or(`new_end_date.gte.${targetDate},and(new_end_date.is.null,or(end_date.is.null,end_date.gte.${targetDate}))`)
      .or(`pause_until.is.null,pause_until.lt.${targetDate}`)
      .limit(1000);

    if (subsErr) throw new Error("Failed to fetch subscriptions: " + subsErr.message);

    // flower_type_id -> { total_quantity, unit_type, sub_count, custom_count, original_flower_type_id }
    const flowerTotals: Record<string, {
      total_quantity: number;
      unit_type: string;
      sub_count: number;
      custom_count: number;
      original_flower_type_id: string | null;
    }> = {};

    let orderCount = 0;

    for (const sub of subs ?? []) {
      const plan = sub.plan as any;
      if (!plan) continue;

      orderCount++;

      for (const req of (plan.flower_requirements ?? [])) {
        const originalFlowerId = req.flower_type_id;
        const subRule = substitutionMap[originalFlowerId];

        let effectiveFlowerId = originalFlowerId;
        let effectiveQty = Number(req.quantity_per_delivery);
        let effectiveUnit = normalizeUnitType(req.unit_type, req.unit_type);
        let originalId: string | null = null;

        if (subRule) {
          if (subRule.alternate_flower_type_id) {
            effectiveFlowerId = subRule.alternate_flower_type_id;
            originalId = originalFlowerId;
            if (subRule.alternate_quantity && subRule.alternate_quantity > 0) {
              effectiveQty = Number(subRule.alternate_quantity);
            }
            if (subRule.alternate_unit_type) {
              effectiveUnit = normalizeUnitType(subRule.alternate_unit_type, req.unit_type);
            }
          } else {
            originalId = originalFlowerId;
          }
        }

        const key = effectiveFlowerId;
        if (!flowerTotals[key]) {
          flowerTotals[key] = { total_quantity: 0, unit_type: effectiveUnit, sub_count: 0, custom_count: 0, original_flower_type_id: originalId };
        }
        flowerTotals[key].total_quantity += effectiveQty;
        flowerTotals[key].sub_count += 1;
        if (!flowerTotals[key].original_flower_type_id && originalId) {
          flowerTotals[key].original_flower_type_id = originalId;
        }
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
          const originalFlowerId = match.id;
          const subRule = substitutionMap[originalFlowerId];

          let effectiveFlowerId = originalFlowerId;
          let effectiveQty = qty;
          let effectiveUnit = normalizeUnitType(unit, match.unit_type);
          let originalId: string | null = null;

          if (subRule) {
            if (subRule.alternate_flower_type_id) {
              effectiveFlowerId = subRule.alternate_flower_type_id;
              originalId = originalFlowerId;
              if (subRule.alternate_quantity && subRule.alternate_quantity > 0) {
                effectiveQty = Number(subRule.alternate_quantity);
              }
              if (subRule.alternate_unit_type) {
                effectiveUnit = normalizeUnitType(subRule.alternate_unit_type, match.unit_type);
              }
            } else {
              originalId = originalFlowerId;
            }
          }

          const key = effectiveFlowerId;
          if (!flowerTotals[key]) {
            flowerTotals[key] = { total_quantity: 0, unit_type: effectiveUnit, sub_count: 0, custom_count: 0, original_flower_type_id: originalId };
          }
          flowerTotals[key].total_quantity += effectiveQty;
          flowerTotals[key].custom_count += 1;
          if (!flowerTotals[key].original_flower_type_id && originalId) {
            flowerTotals[key].original_flower_type_id = originalId;
          }
        }
      }
    }

    // --- 3. Upsert daily requirements ---
    const matchedEntries = Object.entries(flowerTotals);

    if (matchedEntries.length === 0) {
      // Clear any stale requirements for this date
      await supabase
        .from("daily_requirements")
        .delete()
        .eq("requirement_date", targetDate);

      return new Response(
        JSON.stringify({
          message: "No scheduled deliveries for this date",
          date: targetDate,
          requirements: [],
          order_count: 0,
          custom_order_count: customOrders?.length ?? 0,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Delete existing requirements for this date first (to remove stale entries)
    await supabase
      .from("daily_requirements")
      .delete()
      .eq("requirement_date", targetDate)
      .is("batch_id", null);

    const upserts = matchedEntries.map(([flower_type_id, data]) => ({
      requirement_date: targetDate,
      flower_type_id,
      total_quantity: data.total_quantity,
      unit_type: data.unit_type,
      active_subscriptions_count: data.sub_count,
      custom_orders_count: data.custom_count,
      original_flower_type_id: data.original_flower_type_id,
      substituted: data.original_flower_type_id !== null,
      status: "pending" as const,
      updated_at: new Date().toISOString(),
    }));

    const { data: inserted, error: upsertErr } = await supabase
      .from("daily_requirements")
      .insert(upserts)
      .select();

    if (upsertErr) throw new Error("Failed to insert requirements: " + upsertErr.message);

    return new Response(
      JSON.stringify({
        message: "Daily requirements generated successfully",
        date: targetDate,
        requirements: inserted ?? [],
        count: (inserted ?? []).length,
        order_count: orderCount,
        custom_order_count: customOrders?.length ?? 0,
        substitutions_applied: matchedEntries.filter(([, d]) => d.original_flower_type_id !== null).length,
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
