import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const token = url.searchParams.get("token");

    if (!token) {
      return new Response(JSON.stringify({ error: "Missing share token" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: share, error } = await supabase
      .from("pooja_list_shares")
      .select(`
        id,
        share_token,
        expires_at,
        is_revoked,
        created_at,
        provider:service_providers(full_name, city),
        pooja_setup:provider_pooja_setups(
          description,
          duration_minutes,
          service_fee,
          language,
          special_instructions,
          pooja_type:pooja_types(name),
          items:provider_pooja_items(
            quantity,
            pooja_item:pooja_items(name, unit_type)
          )
        )
      `)
      .eq("share_token", token)
      .is("is_revoked", false)
      .single();

    if (error || !share) {
      return new Response(JSON.stringify({ error: "Share link not found or expired" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check expiry
    const expiresAt = new Date(share.expires_at);
    if (expiresAt < new Date()) {
      return new Response(JSON.stringify({ error: "This share link has expired" }), {
        status: 410,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const provider = (share as any).provider;
    const setup = (share as any).pooja_setup;
    const poojaType = setup?.pooja_type;
    const items = setup?.items ?? [];

    const escapeHtml = (value: unknown): string => String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
    const panditName = escapeHtml(provider?.full_name ?? "Pandit");
    const poojaName = escapeHtml(poojaType?.name ?? "Pooja");
    const itemsHtml = items.map((item: any) => `<li><span>${escapeHtml(item.pooja_item?.name ?? "Item")}</span><strong>${escapeHtml(item.quantity)} ${escapeHtml(item.pooja_item?.unit_type ?? "")}</strong></li>`).join("");
    const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>${poojaName} | 33 Crores</title><style>
      :root{color-scheme:light}*{box-sizing:border-box}body{margin:0;background:#fafaf9;color:#1a1917;font-family:Arial,sans-serif;line-height:1.5}.wrap{max-width:620px;margin:0 auto;padding:24px 16px 48px}.brand{color:#2d5a27;font-weight:700;letter-spacing:.12em;font-size:12px;text-transform:uppercase;margin:8px 0 28px}.hero{background:#2d5a27;color:#fff;border-radius:20px;padding:28px 24px;margin-bottom:16px}.eyebrow{color:#c8edbb;font-size:12px;font-weight:700;letter-spacing:.1em;text-transform:uppercase}.hero h1{font-size:30px;line-height:1.15;margin:8px 0}.hero p{margin:0;color:#eaf5e4}.card{background:#fff;border:1px solid #ebe9e5;border-radius:16px;padding:20px;margin-top:16px}.card h2{font-size:18px;margin:0 0 12px}.details{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.detail{background:#f5f4f2;border-radius:10px;padding:10px}.detail small{display:block;color:#6b6762;font-size:11px}.detail strong{display:block;margin-top:3px}.items{list-style:none;padding:0;margin:0}.items li{display:flex;justify-content:space-between;gap:16px;padding:12px 0;border-bottom:1px solid #f0ede8}.items li:last-child{border-bottom:0}.items strong{color:#a67c2e;white-space:nowrap}.instructions{color:#4a4744;font-style:italic}.download{display:block;text-align:center;background:#d4a853;color:#1a1917;text-decoration:none;font-weight:700;border-radius:12px;padding:14px;margin-top:20px}.foot{text-align:center;color:#8c8880;font-size:12px;margin-top:22px}@media(max-width:420px){.details{grid-template-columns:1fr}.hero h1{font-size:26px}}</style></head><body><main class="wrap"><div class="brand">33 Crores</div><section class="hero"><div class="eyebrow">Pooja list shared by ${panditName}</div><h1>${poojaName}</h1><p>Here are the items and details for your pooja.</p></section><section class="card"><h2>Pooja details</h2><div class="details"><div class="detail"><small>Duration</small><strong>${escapeHtml(setup?.duration_minutes ?? 0)} minutes</strong></div><div class="detail"><small>Service fee</small><strong>₹${escapeHtml(setup?.service_fee ?? 0)}</strong></div><div class="detail"><small>Language</small><strong>${escapeHtml(setup?.language ?? "")}</strong></div></div>${setup?.description ? `<p>${escapeHtml(setup.description)}</p>` : ""}${setup?.special_instructions ? `<p class="instructions">${escapeHtml(setup.special_instructions)}</p>` : ""}</section><section class="card"><h2>Pooja Item List</h2><ul class="items">${itemsHtml || "<li>No items listed</li>"}</ul></section><a class="download" href="/">Download the 33 Crores app to book poojas and order fresh flowers</a><div class="foot">Shared by ${panditName} · 33 Crores</div></main></body></html>`;

    return new Response(html, {
      headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8" },
    });
  } catch (err) {
    console.error("pooja-list-view error:", err);
    return new Response(JSON.stringify({ error: "Could not load the pooja list" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
