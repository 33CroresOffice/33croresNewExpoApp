import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

async function getSecret(client: ReturnType<typeof createClient>, key: string): Promise<string | undefined> {
  const { data } = await client.from("secret_keys").select("value").eq("key", key).maybeSingle();
  return data?.value ?? Deno.env.get(key);
}

const respond = (body: object) => new Response(JSON.stringify(body), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return respond({ success: false, error: "Unauthorized" });
    const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: { user }, error: authError } = await service.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authError || !user) return respond({ success: false, error: "Unauthorized" });

    const { booking_id, payment_stage } = await req.json();
    if (!booking_id || !["advance", "remaining"].includes(payment_stage)) return respond({ success: false, error: "Invalid payment request" });
    const { data: booking } = await service.from("provider_bookings").select("id, customer_id, status, total_amount, advance_amount, remaining_amount, advance_payment_status, remaining_payment_status, advance_razorpay_order_id, remaining_razorpay_order_id, provider:service_providers(full_name), provider_services(name), provider_pooja_setups(pooja_type:pooja_types(name))").eq("id", booking_id).eq("customer_id", user.id).maybeSingle();
    if (!booking) return respond({ success: false, error: "Booking not found" });

    const isAdvance = payment_stage === "advance";
    const amount = Number(isAdvance ? booking.advance_amount : booking.remaining_amount);
    const paymentStatus = isAdvance ? booking.advance_payment_status : booking.remaining_payment_status;
    if (amount <= 0) return respond({ success: false, error: "Payment amount is unavailable" });
    if (paymentStatus === "paid") return respond({ success: false, error: "This payment is already complete" });
    if (isAdvance && booking.status !== "awaiting_advance_payment") return respond({ success: false, error: "The provider must accept this request first" });
    if (!isAdvance && (booking.advance_payment_status !== "paid" || !["booking_confirmed", "pooja_completed"].includes(booking.status))) return respond({ success: false, error: "Pay the advance before paying the remaining balance" });

    const keyId = await getSecret(service, "RAZORPAY_KEY_ID");
    const keySecret = await getSecret(service, "RAZORPAY_KEY_SECRET");
    if (!keyId || !keySecret) {
      const testOrderId = `order_test_booking_${payment_stage}_${Date.now()}`;
      await service.from("provider_bookings").update({ [isAdvance ? "advance_razorpay_order_id" : "remaining_razorpay_order_id"]: testOrderId, [isAdvance ? "advance_payment_status" : "remaining_payment_status"]: "pending", updated_at: new Date().toISOString() }).eq("id", booking_id).eq("customer_id", user.id);
      return respond({ success: true, booking_id, order_id: testOrderId, key_id: "test_mode", amount: Math.round(amount * 100), currency: "INR", payment_stage, test_mode: true });
    }

    const response = await fetch("https://api.razorpay.com/v1/orders", { method: "POST", headers: { Authorization: `Basic ${btoa(`${keyId}:${keySecret}`)}`, "Content-Type": "application/json" }, body: JSON.stringify({ amount: Math.round(amount * 100), currency: "INR", receipt: `booking_${booking_id.slice(0, 8)}_${payment_stage}_${Date.now()}`, notes: { booking_id, payment_stage, user_id: user.id } }) });
    if (!response.ok) return respond({ success: false, error: "Could not start payment" });
    const razorpayOrder = await response.json();
    await service.from("provider_bookings").update({ [isAdvance ? "advance_razorpay_order_id" : "remaining_razorpay_order_id"]: razorpayOrder.id, [isAdvance ? "advance_payment_status" : "remaining_payment_status"]: "pending", updated_at: new Date().toISOString() }).eq("id", booking_id).eq("customer_id", user.id);
    return respond({ success: true, booking_id, order_id: razorpayOrder.id, key_id: keyId, amount: razorpayOrder.amount, currency: razorpayOrder.currency, payment_stage, test_mode: false });
  } catch (error) {
    console.error("create-provider-booking-payment error", error);
    return respond({ success: false, error: "Could not start payment" });
  }
});
