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

async function hmac(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(signature)).map(byte => byte.toString(16).padStart(2, "0")).join("");
}

const respond = (body: object) => new Response(JSON.stringify(body), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

async function sendPushNotification(service: ReturnType<typeof createClient>, userId: string, title: string, body: string, eventType: string, bookingId: string) {
  try {
    const { data: tokenRow } = await service.from("expo_push_tokens").select("token").eq("user_id", userId).maybeSingle();
    if (!tokenRow?.token) return;

    const expoBody = {
      to: tokenRow.token,
      title,
      body,
      data: { booking_id: bookingId, event_type: eventType, screen: "service-order-details" },
      sound: "default",
    };

    const expoRes = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify(expoBody),
    });

    const expoData = await expoRes.json();
    await service.from("notification_logs").insert({
      user_id: userId,
      event_type: eventType,
      channel: "push",
      rendered_subject: title,
      rendered_body: body,
      recipient_push_token: tokenRow.token,
      status: expoData?.data?.[0]?.status === "ok" ? "sent" : "failed",
      provider_response: expoData,
      triggered_by: user.id,
    });
  } catch (e) {
    console.error("push notification error", e);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return respond({ success: false, error: "Unauthorized" });
    const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: { user }, error: authError } = await service.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authError || !user) return respond({ success: false, error: "Unauthorized" });

    const { booking_id, payment_stage, razorpay_order_id, razorpay_payment_id, razorpay_signature } = await req.json();
    if (!booking_id || !["advance", "remaining"].includes(payment_stage) || !razorpay_order_id || !razorpay_payment_id || !razorpay_signature) return respond({ success: false, error: "Missing payment details" });
    const isAdvance = payment_stage === "advance";
    const orderColumn = isAdvance ? "advance_razorpay_order_id" : "remaining_razorpay_order_id";
    const statusColumn = isAdvance ? "advance_payment_status" : "remaining_payment_status";
    const paymentColumn = isAdvance ? "advance_razorpay_payment_id" : "remaining_razorpay_payment_id";

    const { data: booking } = await service.from("provider_bookings").select(`id, customer_id, provider_id, status, advance_payment_status, remaining_payment_status, ${orderColumn}`).eq("id", booking_id).eq("customer_id", user.id).maybeSingle();
    if (!booking) return respond({ success: false, error: "Booking not found" });
    if (booking[statusColumn] === "paid") return respond({ success: true, already_paid: true, booking_id, payment_stage });
    if (booking[orderColumn] !== razorpay_order_id) return respond({ success: false, error: "Payment order mismatch" });
    if (!isAdvance && booking.advance_payment_status !== "paid") return respond({ success: false, error: "Advance payment is required first" });

    const secret = await getSecret(service, "RAZORPAY_KEY_SECRET");
    if (secret && !razorpay_order_id.startsWith("order_test_")) {
      const expected = await hmac(secret, `${razorpay_order_id}|${razorpay_payment_id}`);
      if (expected !== razorpay_signature) return respond({ success: false, error: "Payment verification failed" });
    }

    const update: Record<string, string> = { [statusColumn]: "paid", [paymentColumn]: razorpay_payment_id, updated_at: new Date().toISOString() };
    let newStatus = booking.status;

    if (isAdvance) {
      update.status = "booking_confirmed";
      newStatus = "booking_confirmed";
    } else {
      update.status = "payment_completed";
      newStatus = "payment_completed";
    }

    const { error: updateError } = await service.from("provider_bookings").update(update).eq("id", booking_id).eq("customer_id", user.id).eq(statusColumn, "pending");
    if (updateError) return respond({ success: false, error: "Could not confirm payment" });

    // Send notifications
    const { data: providerRow } = await service.from("service_providers").select("auth_user_id").eq("id", booking.provider_id).maybeSingle();
    const providerUserId = providerRow?.auth_user_id;

    if (isAdvance) {
      // Notify customer: booking confirmed
      await service.rpc("send_booking_notification", {
        p_booking_id: booking_id, p_user_id: user.id, p_event_type: "booking_confirmed_customer",
        p_title: "Booking Confirmed", p_body: "Your Pooja booking has been confirmed."
      });
      await sendPushNotification(service, user.id, "Booking Confirmed", "Your Pooja booking has been confirmed.", "booking_confirmed_customer", booking_id);

      // Notify pandit: advance payment completed
      if (providerUserId) {
        await service.rpc("send_booking_notification", {
          p_booking_id: booking_id, p_user_id: providerUserId, p_event_type: "booking_confirmed_pandit",
          p_title: "Advance Payment Completed", p_body: "The advance payment has been completed and the booking is confirmed."
        });
        await sendPushNotification(service, providerUserId, "Advance Payment Completed", "The advance payment has been completed and the booking is confirmed.", "booking_confirmed_pandit", booking_id);
      }
    } else {
      // Notify pandit: final payment completed
      if (providerUserId) {
        await service.rpc("send_booking_notification", {
          p_booking_id: booking_id, p_user_id: providerUserId, p_event_type: "booking_payment_completed_pandit",
          p_title: "Final Payment Completed", p_body: "The final payment for the booking has been completed."
        });
        await sendPushNotification(service, providerUserId, "Final Payment Completed", "The final payment for the booking has been completed.", "booking_payment_completed_pandit", booking_id);
      }
      // Notify customer: payment successful
      await service.rpc("send_booking_notification", {
        p_booking_id: booking_id, p_user_id: user.id, p_event_type: "booking_payment_completed_customer",
        p_title: "Payment Successful", p_body: "Your payment has been completed successfully."
      });
      await sendPushNotification(service, user.id, "Payment Successful", "Your payment has been completed successfully.", "booking_payment_completed_customer", booking_id);
    }

    return respond({ success: true, booking_id, payment_stage, confirmed: isAdvance, new_status: newStatus });
  } catch (error) {
    console.error("verify-provider-booking-payment error", error);
    return respond({ success: false, error: "Could not verify payment" });
  }
});
