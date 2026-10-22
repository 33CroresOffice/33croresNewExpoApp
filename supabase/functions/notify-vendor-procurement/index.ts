import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const NOTIFICATION_TITLE = "\u{1F33C} New Flower Order Assigned!";
const SIGNATURE = "\u2013 Team 33 Crores";

function formatDeliveryDate(dateStr: string): string {
  try {
    const [y, m, d] = dateStr.split("-").map(Number);
    if (y && m && d) {
      const dt = new Date(y, m - 1, d);
      return dt.toLocaleDateString("en-IN", {
        weekday: "short",
        day: "numeric",
        month: "short",
      });
    }
  } catch { /* fall through */ }
  return dateStr;
}

function renderMessage(deliveryDate: string): string {
  const formatted = formatDeliveryDate(deliveryDate);
  return `You have received a new flower procurement order for ${formatted}. Please check your Vendor App and prepare the flowers. ${SIGNATURE}`;
}

async function sendPush(
  pushToken: string,
  title: string,
  body: string,
  data: Record<string, string>,
): Promise<{ success: boolean; response: unknown }> {
  const message = {
    to: pushToken,
    sound: "default",
    title,
    body,
    data,
    priority: "high" as const,
    android: {
      sound: "default" as const,
      priority: "high" as const,
      channelId: "vendor-orders" as const,
    },
    ios: {
      sound: "default" as const,
    },
  };

  const res = await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(message),
  });

  const data2 = await res.json();
  return { success: res.ok, response: data2 };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const authorization = req.headers.get("Authorization");
    const token = authorization?.startsWith("Bearer ")
      ? authorization.slice(7)
      : null;
    if (!token) {
      return new Response(
        JSON.stringify({ success: false, error: "Authentication required" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: authData, error: authError } = await supabase.auth.getUser(token);
    if (authError || !authData.user) {
      return new Response(
        JSON.stringify({ success: false, error: "Authentication required" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: caller } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", authData.user.id)
      .maybeSingle();
    if (caller?.role !== "admin") {
      return new Response(
        JSON.stringify({ success: false, error: "Not authorized" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const {
      procurement_orders,
      delivery_date,
      triggered_by = null,
    } = await req.json();

    if (!procurement_orders || !Array.isArray(procurement_orders) || procurement_orders.length === 0) {
      return new Response(
        JSON.stringify({ error: "procurement_orders array is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!delivery_date) {
      return new Response(
        JSON.stringify({ error: "delivery_date is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const title = NOTIFICATION_TITLE;
    const body = renderMessage(delivery_date);

    const results: Array<{
      procurement_order_id: string;
      vendor_id: string;
      user_id: string | null;
      status: string;
      error?: string;
    }> = [];

    for (const poId of procurement_orders) {
      // Look up vendor + user_id for this procurement order
      const { data: po } = await supabase
        .from("procurement_orders")
        .select("id, vendor_id, vendors!inner(id, user_id)")
        .eq("id", poId)
        .maybeSingle();

      if (!po?.vendor_id) {
        results.push({
          procurement_order_id: poId,
          vendor_id: po?.vendor_id ?? "",
          user_id: null,
          status: "skipped",
          error: "Procurement order or vendor not found",
        });
        continue;
      }

      const vendor = po.vendors as unknown as { id: string; user_id: string | null };
      const userId = vendor.user_id;

      if (!userId) {
        results.push({
          procurement_order_id: poId,
          vendor_id: po.vendor_id,
          user_id: null,
          status: "skipped",
          error: "Vendor has no linked user account",
        });
        continue;
      }

      // Dedup: skip if an in-app notification for this (user, event_type, related_order_id) already exists
      const { data: existing } = await supabase
        .from("in_app_notifications")
        .select("id")
        .eq("user_id", userId)
        .eq("event_type", "vendor_procurement_order")
        .eq("related_order_id", poId)
        .maybeSingle();

      if (existing) {
        results.push({
          procurement_order_id: poId,
          vendor_id: po.vendor_id,
          user_id: userId,
          status: "skipped",
          error: "Already notified",
        });
        continue;
      }

      const deepLinkData = {
        screen: "procurement-order-detail",
        procurement_order_id: poId,
        event_type: "vendor_procurement_order",
      };

      // 1. In-app notification
      const { error: inAppError } = await supabase
        .from("in_app_notifications")
        .insert({
          user_id: userId,
          title,
          body,
          event_type: "vendor_procurement_order",
          is_read: false,
          related_order_id: poId,
          priority: "high",
        });

      if (inAppError) {
        results.push({
          procurement_order_id: poId,
          vendor_id: po.vendor_id,
          user_id: userId,
          status: "failed",
          error: inAppError.message,
        });
        continue;
      }

      // 2. Push notification
      const { data: pushTokenRow } = await supabase
        .from("expo_push_tokens")
        .select("token")
        .eq("user_id", userId)
        .maybeSingle();

      let pushStatus = "sent";
      let pushError: string | undefined;

      if (!pushTokenRow?.token) {
        pushStatus = "skipped";
        pushError = "No push token registered";
      } else {
        const pushResult = await sendPush(
          pushTokenRow.token,
          title,
          body,
          deepLinkData,
        );
        if (!pushResult.success) {
          pushStatus = "failed";
          pushError = "Push send failed";
        }
      }

      // 3. Log to notification_logs
      await supabase.from("notification_logs").insert({
        user_id: userId,
        event_type: "vendor_procurement_order",
        channel: "push",
        recipient_mobile: null,
        rendered_subject: title,
        rendered_body: body,
        status: pushStatus,
        error_message: pushError ?? null,
        triggered_by: triggered_by ?? null,
      });

      results.push({
        procurement_order_id: poId,
        vendor_id: po.vendor_id,
        user_id: userId,
        status: pushStatus,
        ...(pushError ? { error: pushError } : {}),
      });
    }

    const sent = results.filter((r) => r.status === "sent").length;
    const skipped = results.filter((r) => r.status === "skipped").length;
    const failed = results.filter((r) => r.status === "failed").length;

    return new Response(
      JSON.stringify({
        success: failed === 0,
        total: results.length,
        sent,
        skipped,
        failed,
        results,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("notify-vendor-procurement error:", err);
    return new Response(
      JSON.stringify({ success: false, error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
