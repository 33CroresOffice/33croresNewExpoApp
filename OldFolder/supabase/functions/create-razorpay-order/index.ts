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
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return respond({ success: false, error: "Unauthorized" });

    const serviceSupabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await serviceSupabase.auth.getUser(token);
    if (authError || !user) return respond({ success: false, error: "Unauthorized" });

    const body = await req.json();
    const { plan_id, amount, plan_name } = body;

    if (!plan_id || !amount || amount <= 0) {
      return respond({ success: false, error: "plan_id and amount are required" });
    }

    const razorpayKeyId = Deno.env.get("RAZORPAY_KEY_ID");
    const razorpayKeySecret = Deno.env.get("RAZORPAY_KEY_SECRET");
    const isTestMode = !razorpayKeyId || !razorpayKeySecret;

    if (isTestMode) {
      const testOrderId = `order_test_${Date.now()}`;

      const { error: paymentInsertError } = await serviceSupabase.from("payments").insert({
        user_id: user.id,
        razorpay_order_id: testOrderId,
        amount,
        status: "pending",
      });

      if (paymentInsertError) {
        return respond({ success: false, error: "Failed to create payment record: " + paymentInsertError.message });
      }

      return respond({
        success: true,
        order_id: testOrderId,
        key_id: "test_mode",
        amount,
        currency: "INR",
        test_mode: true,
      });
    }

    const credentials = btoa(`${razorpayKeyId}:${razorpayKeySecret}`);

    const orderPayload = {
      amount,
      currency: "INR",
      receipt: `rcpt_${user.id.slice(0, 8)}_${Date.now()}`,
      notes: {
        plan_id,
        user_id: user.id,
        plan_name: plan_name ?? "Flower Subscription",
      },
    };

    const orderResponse = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(orderPayload),
    });

    if (!orderResponse.ok) {
      const errBody = await orderResponse.text();
      console.error("Razorpay order creation failed:", errBody);
      let razorpayError = "Failed to create order";
      try {
        const parsed = JSON.parse(errBody);
        razorpayError = parsed?.error?.description ?? parsed?.error?.code ?? razorpayError;
      } catch { /* ignore */ }
      return respond({ success: false, error: razorpayError });
    }

    const order = await orderResponse.json();

    const { error: paymentInsertError } = await serviceSupabase.from("payments").insert({
      user_id: user.id,
      razorpay_order_id: order.id,
      amount,
      status: "pending",
    });

    if (paymentInsertError) {
      console.error("payments insert error:", JSON.stringify(paymentInsertError));
    }

    return respond({
      success: true,
      order_id: order.id,
      key_id: razorpayKeyId,
      amount: order.amount,
      currency: order.currency,
      test_mode: false,
    });
  } catch (err) {
    console.error("create-razorpay-order error:", err);
    return respond({ success: false, error: "Internal server error: " + String(err) });
  }
});
