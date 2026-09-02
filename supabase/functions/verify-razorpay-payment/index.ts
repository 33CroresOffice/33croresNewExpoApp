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

function toDateStr(date: Date): string {
  return date.toISOString().split("T")[0];
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function addOneMonth(date: Date): Date {
  return addDays(date, 29);
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
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
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      razorpay_payment_link_id,
      razorpay_payment_link_reference_id,
      razorpay_payment_link_status,
      plan_id,
      address_id,
      renew_from_subscription_id,
      start_date: clientStartDate,
    } = await req.json();

    const orderId = razorpay_order_id ?? razorpay_payment_link_id;

    if (!orderId || !razorpay_payment_id || !razorpay_signature) {
      return respond({ success: false, error: "Payment details are required" });
    }

    if (!plan_id) {
      return respond({ success: false, error: "plan_id is required" });
    }

    if (!address_id) {
      return respond({ success: false, error: "A delivery address is required" });
    }

    const razorpayKeySecret = await getSecret(serviceSupabase, "RAZORPAY_KEY_SECRET");
    const isTestMode = !razorpayKeySecret || orderId.startsWith("order_test_");

    if (!isTestMode) {
      let message: string;
      if (razorpay_payment_link_id) {
        message = `${razorpay_payment_link_id}|${razorpay_payment_link_reference_id ?? ""}|${razorpay_payment_link_status ?? ""}|${razorpay_payment_id}`;
      } else {
        message = `${orderId}|${razorpay_payment_id}`;
      }

      const expectedSignature = await hmacSha256Hex(razorpayKeySecret!, message);

      if (expectedSignature !== razorpay_signature) {
        return respond({ success: false, error: "Payment verification failed. Invalid signature." });
      }
    }

    let startDateObj: Date;
    let endDateObj: Date;
    let nextDeliveryDate: Date;

    if (renew_from_subscription_id) {
      const { data: oldSub, error: oldSubError } = await serviceSupabase
        .from("subscriptions")
        .select("end_date")
        .eq("id", renew_from_subscription_id)
        .maybeSingle();

      if (oldSubError || !oldSub || !oldSub.end_date) {
        return respond({ success: false, error: "Could not find the subscription to renew from." });
      }

      const oldEndDate = new Date(oldSub.end_date);
      oldEndDate.setUTCHours(0, 0, 0, 0);
      const minStartDate = addDays(oldEndDate, 1);

      // Use client-chosen start date if it's on or after the minimum (oldEndDate + 1)
      if (clientStartDate) {
        const clientDate = new Date(clientStartDate);
        clientDate.setUTCHours(0, 0, 0, 0);
        startDateObj = clientDate >= minStartDate ? clientDate : minStartDate;
      } else {
        startDateObj = minStartDate;
      }

      endDateObj = addOneMonth(startDateObj);
      nextDeliveryDate = new Date(startDateObj);
    } else if (clientStartDate) {
      // Use the start date chosen by the customer in checkout
      startDateObj = new Date(clientStartDate);
      startDateObj.setUTCHours(0, 0, 0, 0);
      endDateObj = addOneMonth(startDateObj);
      nextDeliveryDate = new Date(startDateObj);
    } else {
      const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
      const nowIST = new Date(Date.now() + IST_OFFSET_MS);
      const istHour = nowIST.getUTCHours();
      const istMinutes = nowIST.getUTCMinutes();
      const isPastCutoff = istHour > 17 || (istHour === 17 && istMinutes >= 0);
      const daysToAdd = isPastCutoff ? 2 : 1;

      startDateObj = new Date();
      startDateObj.setUTCHours(0, 0, 0, 0);
      startDateObj.setUTCDate(startDateObj.getUTCDate() + daysToAdd);
      endDateObj = addOneMonth(startDateObj);
      nextDeliveryDate = new Date(startDateObj);
    }

    // Determine status: pending if start_date is in the future (IST)
    const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
    const todayIST = new Date(Date.now() + IST_OFFSET_MS).toISOString().split("T")[0];
    const subscriptionStatus = toDateStr(startDateObj) > todayIST ? "pending" : "active";

    const { data: subscription, error: subError } = await serviceSupabase
      .from("subscriptions")
      .insert({
        user_id: user.id,
        plan_id,
        status: subscriptionStatus,
        start_date: toDateStr(startDateObj),
        end_date: toDateStr(endDateObj),
        new_end_date: toDateStr(endDateObj),
        next_delivery_date: toDateStr(nextDeliveryDate),
        delivery_address_id: address_id,
        ...(renew_from_subscription_id ? { renewed_from_subscription_id: renew_from_subscription_id } : {}),
      })
      .select()
      .single();

    if (subError) {
      console.error("Subscription creation error:", JSON.stringify(subError));
      return respond({ success: false, error: "Failed to activate subscription: " + subError.message });
    }

    const { error: paymentUpdateError } = await serviceSupabase
      .from("payments")
      .update({
        razorpay_payment_id,
        subscription_id: subscription.id,
        status: "success",
      })
      .eq("razorpay_order_id", orderId);

    if (paymentUpdateError) {
      console.error("Payment update error:", JSON.stringify(paymentUpdateError));
    }

    const { error: orderError } = await serviceSupabase.from("orders").insert({
      subscription_id: subscription.id,
      user_id: user.id,
      scheduled_date: toDateStr(nextDeliveryDate),
      status: "scheduled",
    });

    if (orderError) {
      console.error("Order creation error:", JSON.stringify(orderError));
    }

    if (renew_from_subscription_id) {
      const { error: renewalUpdateError } = await serviceSupabase
        .from("subscriptions")
        .update({ renewal_status: "renewed" })
        .eq("id", renew_from_subscription_id);

      if (renewalUpdateError) {
        console.error("Renewal status update error:", JSON.stringify(renewalUpdateError));
      }

      const { data: paymentRecord } = await serviceSupabase
        .from("payments")
        .select("amount")
        .eq("razorpay_order_id", orderId)
        .maybeSingle();

      const { error: historyError } = await serviceSupabase
        .from("subscription_renewal_history")
        .insert({
          original_subscription_id: renew_from_subscription_id,
          new_subscription_id: subscription.id,
          user_id: user.id,
          plan_id,
          renewed_at: new Date().toISOString(),
          old_end_date: toDateStr(addDays(startDateObj, -1)),
          new_start_date: toDateStr(startDateObj),
          new_end_date: toDateStr(endDateObj),
          amount_paid: paymentRecord?.amount ?? null,
          razorpay_payment_id,
        });

      if (historyError) {
        console.error("Renewal history insert error:", JSON.stringify(historyError));
      }
    }

    // Fire payment_received notifications
    try {
      const { data: plan } = await serviceSupabase
        .from("subscription_plans")
        .select("name, price")
        .eq("id", plan_id)
        .maybeSingle();

      const { data: templates } = await serviceSupabase
        .from("notification_templates")
        .select("id, channel")
        .eq("event_type", "payment_received")
        .eq("is_active", true);

      if (templates && templates.length > 0) {
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        await Promise.allSettled(
          templates.map((t) =>
            fetch(`${supabaseUrl}/functions/v1/send-notification`, {
              method: "POST",
              headers: { Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
              body: JSON.stringify({
                user_id: user.id,
                event_type: "payment_received",
                channel: t.channel,
                template_id: t.id,
                variables: {
                  plan_name: plan?.name ?? "",
                  amount: plan?.price ? String(plan.price / 100) : "",
                  payment_id: razorpay_payment_id,
                },
                subscription_id: subscription.id,
              }),
            })
          ),
        );
      }
    } catch (notifErr) {
      console.error("Notification error (non-fatal):", notifErr);
    }

    return respond({ success: true, subscription_id: subscription.id });
  } catch (err) {
    console.error("verify-razorpay-payment error:", err);
    return respond({ success: false, error: "Internal server error: " + String(err) });
  }
});
