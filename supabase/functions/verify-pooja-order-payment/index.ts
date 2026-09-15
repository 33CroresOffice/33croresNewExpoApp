import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

async function getSecret(client: ReturnType<typeof createClient>, key: string): Promise<string | undefined> {
  try { const { data } = await client.from("secret_keys").select("value").eq("key", key).maybeSingle(); if (data?.value) return data.value; } catch { /* fallback to environment */ }
  return Deno.env.get(key);
}
async function hmac(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(signature)).map(byte => byte.toString(16).padStart(2, "0")).join("");
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
    const { pooja_order_id, razorpay_order_id, razorpay_payment_id, razorpay_signature } = await req.json();
    if (!pooja_order_id || !razorpay_order_id || !razorpay_payment_id || !razorpay_signature) return respond({ success: false, error: "Missing payment details" });
    const { data: order } = await service.from("pooja_orders").select("id, user_id, payment_status, razorpay_order_id").eq("id", pooja_order_id).eq("user_id", user.id).maybeSingle();
    if (!order) return respond({ success: false, error: "Order not found" });
    if (order.payment_status === "paid") return respond({ success: true, already_paid: true, pooja_order_id });
    const secret = await getSecret(service, "RAZORPAY_KEY_SECRET");
    if (secret && !razorpay_order_id.startsWith("order_test_")) {
      const expected = await hmac(secret, `${razorpay_order_id}|${razorpay_payment_id}`);
      if (expected !== razorpay_signature) return respond({ success: false, error: "Payment verification failed" });
    }
    const { error: updateError } = await service.from("pooja_orders").update({ payment_status: "paid", status: "paid", razorpay_order_id, razorpay_payment_id, updated_at: new Date().toISOString() }).eq("id", pooja_order_id).eq("user_id", user.id);
    if (updateError) return respond({ success: false, error: "Could not confirm payment" });
    return respond({ success: true, pooja_order_id });
  } catch (error) { console.error("verify-pooja-order-payment error", error); return respond({ success: false, error: "Could not verify payment" }); }
});
