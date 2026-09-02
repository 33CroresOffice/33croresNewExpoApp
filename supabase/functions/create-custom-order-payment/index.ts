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
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return respond({ success: false, error: "Unauthorized: no auth header" }, 200);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      return respond({ success: false, error: "Server misconfiguration: missing env vars" }, 200);
    }

    const serviceSupabase = createClient(supabaseUrl, serviceRoleKey);

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: authError } = await serviceSupabase.auth.getUser(token);
    const user = userData?.user;
    if (authError || !user) {
      return respond({ success: false, error: "Unauthorized: invalid token" }, 200);
    }

    let body: any;
    try {
      body = await req.json();
    } catch {
      return respond({ success: false, error: "Invalid JSON body" }, 200);
    }

    const { custom_order_id } = body;
    if (!custom_order_id) return respond({ success: false, error: "custom_order_id is required" }, 200);

    // Fetch the custom order — use service role so generated columns are accessible
    const { data: order, error: orderError } = await serviceSupabase
      .from("custom_orders")
      .select("id, user_id, flower_price, delivery_price, payment_status, status")
      .eq("id", custom_order_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (orderError) {
      return respond({ success: false, error: "DB error: " + orderError.message }, 200);
    }

    if (!order) {
      return respond({ success: false, error: "Order not found or does not belong to you" }, 200);
    }

    if (order.payment_status === "paid") {
      return respond({ success: false, error: "This order has already been paid" }, 200);
    }

    const totalPrice = (order.flower_price ?? 0) + (order.delivery_price ?? 0);

    if (totalPrice <= 0) {
      return respond({ success: false, error: "Prices have not been set by admin yet" }, 200);
    }

    const razorpayKeyId = await getSecret(serviceSupabase, "RAZORPAY_KEY_ID");
    const razorpayKeySecret = await getSecret(serviceSupabase, "RAZORPAY_KEY_SECRET");
    const isTestMode = !razorpayKeyId || !razorpayKeySecret;

    if (isTestMode) {
      const testOrderId = `order_test_co_${Date.now()}`;

      const { error: updateErr } = await serviceSupabase
        .from("custom_orders")
        .update({ razorpay_order_id: testOrderId, payment_status: "pending", updated_at: new Date().toISOString() })
        .eq("id", custom_order_id);

      if (updateErr) {
        return respond({ success: false, error: "Failed to update order: " + updateErr.message }, 200);
      }

      return respond({
        success: true,
        order_id: testOrderId,
        key_id: "test_mode",
        amount: totalPrice,
        currency: "INR",
        test_mode: true,
      });
    }

    const credentials = btoa(`${razorpayKeyId}:${razorpayKeySecret}`);
    const orderPayload = {
      amount: totalPrice,
      currency: "INR",
      receipt: `co_${custom_order_id.slice(0, 8)}_${Date.now()}`,
      notes: { custom_order_id, user_id: user.id },
    };

    const rzpResponse = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: { Authorization: `Basic ${credentials}`, "Content-Type": "application/json" },
      body: JSON.stringify(orderPayload),
    });

    if (!rzpResponse.ok) {
      const errBody = await rzpResponse.text();
      let msg = "Failed to create Razorpay order";
      try { msg = JSON.parse(errBody)?.error?.description ?? msg; } catch { /* ignore */ }
      return respond({ success: false, error: msg }, 200);
    }

    const rzpOrder = await rzpResponse.json();

    await serviceSupabase
      .from("custom_orders")
      .update({ razorpay_order_id: rzpOrder.id, payment_status: "pending", updated_at: new Date().toISOString() })
      .eq("id", custom_order_id);

    return respond({
      success: true,
      order_id: rzpOrder.id,
      key_id: razorpayKeyId,
      amount: rzpOrder.amount,
      currency: rzpOrder.currency,
      test_mode: false,
    });
  } catch (err) {
    console.error("create-custom-order-payment unhandled error:", err);
    return respond({ success: false, error: "Internal server error: " + String(err) }, 200);
  }
});
