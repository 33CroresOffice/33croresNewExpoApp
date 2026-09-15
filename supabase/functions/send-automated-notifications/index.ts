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

async function sendPushNotification(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  title: string,
  body: string,
): Promise<boolean> {
  const { data: tokenRow } = await supabase
    .from("expo_push_tokens")
    .select("token")
    .eq("user_id", userId)
    .maybeSingle();

  if (!tokenRow?.token) return false;

  try {
    const res = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to: tokenRow.token, sound: "default", title, body }),
    });
    return res.ok;
  } catch {
    return false;
  }
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
    const token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : null;
    if (!token) return respond({ success: false, error: "Authentication required" }, 401);

    const { data: authData, error: authError } = await supabase.auth.getUser(token);
    if (authError || !authData.user) return respond({ success: false, error: "Authentication required" }, 401);

    const { data: caller } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", authData.user.id)
      .maybeSingle();
    if (caller?.role !== "admin") return respond({ success: false, error: "Not authorized" }, 403);

    const { action } = await req.json().catch(() => ({ action: "all" }));

    let riderCheckinCount = 0;
    let adminAlertCount = 0;
    let vendorNotifyCount = 0;

    // Rider check-in reminders
    if (action === "all" || action === "rider_checkin") {
      const { data: riders } = await supabase
        .from("riders")
        .select("id, profile_id, full_name")
        .eq("is_active", true)
        .not("profile_id", "is", null);

      if (riders) {
        for (const rider of riders) {
          const today = new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);

          const { data: attendance } = await supabase
            .from("rider_attendance")
            .select("id")
            .eq("rider_id", rider.id)
            .eq("date", today)
            .not("check_in_time", "is", null)
            .maybeSingle();

          if (attendance) continue;

          const { data: assignments } = await supabase
            .from("rider_order_assignments")
            .select("id")
            .eq("rider_id", rider.id)
            .in("status", ["assigned", "accepted", "picked_up"])
            .gte("assigned_at", `${today}T00:00:00.000Z`)
            .lt("assigned_at", `${today}T23:59:59.999Z`)
            .limit(1);

          if (!assignments || assignments.length === 0) continue;

          const { data: existing } = await supabase
            .from("in_app_notifications")
            .select("id")
            .eq("user_id", rider.profile_id)
            .eq("event_type", "rider_checkin_reminder")
            .gte("created_at", `${today}T00:00:00.000Z`)
            .maybeSingle();

          if (existing) continue;

          await supabase.from("in_app_notifications").insert({
            user_id: rider.profile_id,
            title: "Check-in Reminder",
            body: "You have deliveries assigned today. Please check in at the warehouse to start your deliveries.",
            event_type: "rider_checkin_reminder",
            is_read: false,
          });

          await sendPushNotification(
            supabase,
            rider.profile_id!,
            "Check-in Reminder",
            "You have deliveries today. Please check in at the warehouse.",
          );

          riderCheckinCount++;
        }
      }
    }

    // Admin unassigned alerts
    if (action === "all" || action === "admin_alert") {
      const today = new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);

      const { data: unassignedOrders } = await supabase
        .from("orders")
        .select("id")
        .eq("scheduled_date", today)
        .eq("status", "scheduled");

      if (unassignedOrders && unassignedOrders.length > 0) {
        const { data: admins } = await supabase
          .from("profiles")
          .select("id")
          .eq("role", "admin");

        if (admins) {
          for (const admin of admins) {
            const { data: existing } = await supabase
              .from("in_app_notifications")
              .select("id")
              .eq("user_id", admin.id)
              .eq("event_type", "admin_unassigned_alert")
              .gte("created_at", `${today}T00:00:00.000Z`)
              .maybeSingle();

            if (existing) continue;

            await supabase.from("in_app_notifications").insert({
              user_id: admin.id,
              title: "Unassigned Orders Alert",
              body: `${unassignedOrders.length} orders remain unassigned for today. Please assign riders immediately.`,
              event_type: "admin_unassigned_alert",
              is_read: false,
            });

            await sendPushNotification(
              supabase,
              admin.id,
              "Unassigned Orders Alert",
              `${unassignedOrders.length} orders need rider assignment today.`,
            );

            adminAlertCount++;
          }
        }
      }
    }

    // Vendor procurement notifications
    if (action === "all" || action === "vendor_procurement") {
      const { data: pos } = await supabase
        .from("procurement_orders")
        .select("id, order_number, vendor_id, notes")
        .eq("status", "sent")
        .eq("notes", "Auto-generated from daily requirements");

      if (pos) {
        for (const po of pos) {
          const { data: vendor } = await supabase
            .from("vendors")
            .select("user_id")
            .eq("id", po.vendor_id)
            .maybeSingle();

          if (!vendor?.user_id) continue;

          const { data: existing } = await supabase
            .from("in_app_notifications")
            .select("id")
            .eq("user_id", vendor.user_id)
            .eq("event_type", "vendor_procurement_order")
            .eq("related_order_id", po.id)
            .maybeSingle();

          if (existing) continue;

          await supabase.from("in_app_notifications").insert({
            user_id: vendor.user_id,
            title: "New Procurement Order",
            body: `PO ${po.order_number} has been generated. Please review and confirm flower availability.`,
            event_type: "vendor_procurement_order",
            is_read: false,
            related_order_id: po.id,
          });

          await sendPushNotification(
            supabase,
            vendor.user_id,
            "New Procurement Order",
            `PO ${po.order_number} needs your review.`,
          );

          vendorNotifyCount++;
        }
      }
    }

    return respond({
      success: true,
      rider_checkin_notified: riderCheckinCount,
      admin_alerts_sent: adminAlertCount,
      vendor_notifications_sent: vendorNotifyCount,
    });
  } catch (err) {
    console.error("send-automated-notifications error:", err);
    return respond({ success: false, error: "Internal server error" }, 500);
  }
});
