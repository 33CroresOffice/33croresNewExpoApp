import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

async function getSecret(client: ReturnType<typeof createClient>, key: string): Promise<string | undefined> {
  try { const { data } = await client.from("secret_keys").select("value").eq("key", key).maybeSingle(); if (data?.value) return data.value; } catch { /* fallback to environment */ }
  return Deno.env.get(key);
}

const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey" };
const respond = (body: object) => new Response(JSON.stringify(body), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return respond({ success: false, error: "Unauthorized" });
    const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await service.auth.getUser(token);
    if (authError || !user) return respond({ success: false, error: "Unauthorized" });

    const body = await req.json();
    const { plan_id, address_id, delivery_date, delivery_time, special_instructions } = body;
    if (!plan_id || !address_id || !delivery_date || !delivery_time) return respond({ success: false, error: "Missing required delivery details" });
    if (delivery_date < new Date().toISOString().slice(0, 10)) return respond({ success: false, error: "Choose a future delivery date" });

    const [{ data: plan }, { data: address }] = await Promise.all([
      service.from("subscription_plans").select("id, name, price, product_type, supports_one_time").eq("id", plan_id).eq("is_active", true).maybeSingle(),
      service.from("addresses").select("id").eq("id", address_id).eq("user_id", user.id).maybeSingle(),
    ]);
    if (!plan || plan.product_type !== "pooja" || !plan.supports_one_time) return respond({ success: false, error: "This package is not available for one-time purchase" });
    if (!address) return respond({ success: false, error: "Delivery address not found" });
    if (!plan.price || plan.price <= 0) return respond({ success: false, error: "Package price is unavailable" });

    const { data: poojaOrder, error: insertError } = await service.from("pooja_orders").insert({ user_id: user.id, plan_id, address_id, delivery_date, delivery_time, special_instructions: special_instructions || null, price: plan.price, delivery_price: 0, total_price: plan.price, status: "pending", payment_status: "unpaid" }).select("id").single();
    if (insertError || !poojaOrder) return respond({ success: false, error: "Could not create your order" });

    const keyId = await getSecret(service, "RAZORPAY_KEY_ID");
    const keySecret = await getSecret(service, "RAZORPAY_KEY_SECRET");
    if (!keyId || !keySecret) {
      const testOrderId = `order_test_pj_${Date.now()}`;
      await service.from("pooja_orders").update({ razorpay_order_id: testOrderId, payment_status: "pending" }).eq("id", poojaOrder.id);
      return respond({ success: true, pooja_order_id: poojaOrder.id, order_id: testOrderId, key_id: "test_mode", amount: plan.price, currency: "INR", test_mode: true });
    }

    const response = await fetch("https://api.razorpay.com/v1/orders", { method: "POST", headers: { Authorization: `Basic ${btoa(`${keyId}:${keySecret}`)}`, "Content-Type": "application/json" }, body: JSON.stringify({ amount: plan.price, currency: "INR", receipt: `pj_${poojaOrder.id.slice(0, 8)}_${Date.now()}`, notes: { pooja_order_id: poojaOrder.id, user_id: user.id } }) });
    if (!response.ok) return respond({ success: false, error: "Could not start payment" });
    const razorpayOrder = await response.json();
    await service.from("pooja_orders").update({ razorpay_order_id: razorpayOrder.id, payment_status: "pending" }).eq("id", poojaOrder.id);
    return respond({ success: true, pooja_order_id: poojaOrder.id, order_id: razorpayOrder.id, key_id: keyId, amount: razorpayOrder.amount, currency: razorpayOrder.currency, test_mode: false });
  } catch (error) { console.error("create-pooja-order-payment error", error); return respond({ success: false, error: "Could not start payment" }); }
});
