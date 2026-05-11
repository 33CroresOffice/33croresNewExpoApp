import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Verify caller is an admin
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user: caller }, error: authErr } = await supabaseUser.auth.getUser();
    if (authErr || !caller) {
      return new Response(JSON.stringify({ error: "Unauthorized: " + (authErr?.message ?? "no session") }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: callerProfile } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", caller.id)
      .maybeSingle();

    if (!callerProfile || callerProfile.role !== "admin") {
      return new Response(JSON.stringify({ error: "Only admins can create subscriptions." }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const {
      // User
      user_mode,       // 'search' | 'new'
      user_id,         // for existing user
      new_full_name,   // for new user
      new_mobile,      // for new user
      // Address
      address_label,
      address_street,
      address_city,
      address_state,
      address_pincode,
      address_landmark,
      // Subscription
      plan_id,
      start_date,
      end_date,
      // Payment
      amount_rupees,
      payment_mode,
    } = body;

    // ── 1. Resolve / create user ──
    let targetUserId: string;

    if (user_mode === "search") {
      if (!user_id) {
        return new Response(JSON.stringify({ error: "user_id is required for existing user." }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      targetUserId = user_id;
    } else {
      // Create new customer
      if (!new_full_name || !new_mobile) {
        return new Response(JSON.stringify({ error: "full_name and mobile are required for new user." }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Check if mobile already exists
      const { data: existing } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .eq("mobile", new_mobile)
        .maybeSingle();

      if (existing) {
        return new Response(JSON.stringify({ error: `A customer with mobile ${new_mobile} already exists.` }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const dummyEmail = `${new_mobile}@customers.internal`;
      const randomPassword = crypto.randomUUID();

      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email: dummyEmail,
        password: randomPassword,
        email_confirm: true,
        user_metadata: { full_name: new_full_name, mobile: new_mobile },
      });

      if (authError) {
        return new Response(JSON.stringify({ error: "Auth error: " + authError.message }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      targetUserId = authData.user.id;

      const { error: profileError } = await supabaseAdmin.from("profiles").upsert({
        id: targetUserId,
        mobile: new_mobile,
        full_name: new_full_name,
        role: "customer",
        is_verified: true,
        notification_sms: true,
        notification_whatsapp: true,
      });

      if (profileError) {
        await supabaseAdmin.auth.admin.deleteUser(targetUserId);
        return new Response(JSON.stringify({ error: "Profile error: " + profileError.message }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // ── 2. Create address ──
    const { data: addrData, error: addrError } = await supabaseAdmin
      .from("addresses")
      .insert({
        user_id: targetUserId,
        label: address_label,
        street: address_street,
        city: address_city,
        state: address_state,
        pincode: address_pincode,
        landmark: address_landmark || null,
        is_default: true,
      })
      .select("id")
      .single();

    if (addrError) {
      return new Response(JSON.stringify({ error: "Address error: " + addrError.message }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── 3. Create subscription ──
    const { data: subData, error: subError } = await supabaseAdmin
      .from("subscriptions")
      .insert({
        user_id: targetUserId,
        plan_id,
        status: "active",
        start_date,
        end_date: end_date || null,
        next_delivery_date: start_date,
        delivery_address_id: addrData.id,
        renewal_status: "none",
      })
      .select("id")
      .single();

    if (subError) {
      return new Response(JSON.stringify({ error: "Subscription error: " + subError.message }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── 4. Create payment ──
    const { error: payError } = await supabaseAdmin.from("payments").insert({
      user_id: targetUserId,
      subscription_id: subData.id,
      amount: Math.round(Number(amount_rupees) * 100),
      status: "success",
      payment_mode,
    });

    if (payError) {
      return new Response(JSON.stringify({ error: "Payment error: " + payError.message }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── 5. Create first order ──
    const { error: orderError } = await supabaseAdmin.from("orders").insert({
      subscription_id: subData.id,
      user_id: targetUserId,
      scheduled_date: start_date,
      status: "scheduled",
    });

    if (orderError) {
      return new Response(JSON.stringify({ error: "Order error: " + orderError.message }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({ success: true, subscription_id: subData.id }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: "Exception: " + String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
