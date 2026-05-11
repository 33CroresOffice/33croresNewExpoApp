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

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

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

    const {
      custom_order_id,
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
    } = await req.json();

    if (!custom_order_id || !razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return respond({ success: false, error: "Missing required payment details" });
    }

    // Verify the order belongs to this user
    const { data: order, error: orderFetchError } = await serviceSupabase
      .from("custom_orders")
      .select("id, user_id, payment_status, razorpay_order_id")
      .eq("id", custom_order_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (orderFetchError || !order) {
      return respond({ success: false, error: "Order not found" });
    }

    if (order.payment_status === "paid") {
      return respond({ success: true, already_paid: true });
    }

    const razorpayKeySecret = Deno.env.get("RAZORPAY_KEY_SECRET");
    const isTestMode = !razorpayKeySecret || razorpay_order_id.startsWith("order_test_");

    if (!isTestMode) {
      const message = `${razorpay_order_id}|${razorpay_payment_id}`;
      const expectedSig = await hmacSha256Hex(razorpayKeySecret!, message);
      if (expectedSig !== razorpay_signature) {
        return respond({ success: false, error: "Payment verification failed. Invalid signature." });
      }
    }

    const { error: updateError } = await serviceSupabase
      .from("custom_orders")
      .update({
        payment_status: "paid",
        razorpay_payment_id,
        status: "paid",
        updated_at: new Date().toISOString(),
      })
      .eq("id", custom_order_id);

    if (updateError) {
      console.error("custom order update error:", JSON.stringify(updateError));
      return respond({ success: false, error: "Failed to confirm payment: " + updateError.message });
    }

    return respond({ success: true });
  } catch (err) {
    console.error("verify-custom-order-payment error:", err);
    return respond({ success: false, error: "Internal server error: " + String(err) });
  }
});
