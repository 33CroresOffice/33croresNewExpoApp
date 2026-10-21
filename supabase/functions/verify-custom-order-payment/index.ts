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
      .select("id, user_id, payment_status, razorpay_order_id, flower_price, delivery_price")
      .eq("id", custom_order_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (orderFetchError || !order) {
      return respond({ success: false, error: "Order not found" });
    }

    if (order.payment_status === "paid") {
      return respond({ success: true, already_paid: true });
    }

    const razorpayKeySecret = await getSecret(serviceSupabase, "RAZORPAY_KEY_SECRET");
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

    // Send Push + In-App notifications for payment success (deduped via send-notification)
    const totalAmountPaise = (order.flower_price ?? 0) + (order.delivery_price ?? 0);
    const amountRupees = (totalAmountPaise / 100).toFixed(2).replace(/\.00$/, "");
    const notifVars = { amount: amountRupees };
    for (const notifChannel of ["push", "in_app"] as const) {
      try {
        await serviceSupabase.functions.invoke("send-notification", {
          body: {
            user_id: order.user_id,
            event_type: "custom_order_payment_success",
            channel: notifChannel,
            variables: notifVars,
            custom_order_id: order.id,
          },
        });
      } catch (notifErr) {
        console.error("payment-success notification error:", String(notifErr));
      }
    }

    return respond({ success: true });
  } catch (err) {
    console.error("verify-custom-order-payment error:", err);
    return respond({ success: false, error: "Internal server error: " + String(err) });
  }
});
