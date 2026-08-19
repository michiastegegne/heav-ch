import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const allowedOrigins = new Set(["https://heav.ch", "https://www.heav.ch", "http://127.0.0.1:4179", "http://localhost:4179"]);
const corsHeaders = {
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const text = (value: unknown, limit: number) => String(value ?? "").trim().slice(0, limit);

Deno.serve(async (request) => {
  const origin = request.headers.get("origin") || "";
  const headers = { ...corsHeaders, "Access-Control-Allow-Origin": allowedOrigins.has(origin) ? origin : "https://heav.ch", Vary: "Origin" };
  if (request.method === "OPTIONS") return new Response("ok", { headers });
  if (request.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405, headers });
  if (origin && !allowedOrigins.has(origin)) return Response.json({ error: "Origin not allowed" }, { status: 403, headers });
  try {
    const body = await request.json();
    const contactName = text(body.contactName, 160);
    const company = text(body.company, 200);
    const email = text(body.email, 254).toLowerCase();
    const phone = text(body.phone, 80);
    const message = text(body.message, 2000);
    const honeypot = text(body.website, 200);
    const elapsed = Date.now() - Number(body.startedAt || 0);
    if (honeypot || !Number.isFinite(elapsed) || elapsed < 1800) return Response.json({ ok: true }, { headers });
    if (contactName.length < 2 || !emailPattern.test(email)) throw new Error("Invalid request details.");

    const service = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
    const { data: owner, error: ownerError } = await service.from("company_settings").select("owner_id, email").limit(1).maybeSingle();
    if (ownerError || !owner?.owner_id) throw new Error("Portal owner is not configured.");
    const { error: insertError } = await service.from("customer_portal_requests").insert({
      owner_id: owner.owner_id,
      contact_name: contactName,
      company,
      email,
      phone,
      message,
    });
    // Duplicate pending requests deliberately receive the same response so an
    // attacker cannot enumerate existing customer e-mail addresses.
    if (insertError && insertError.code !== "23505") throw insertError;
    return Response.json({ ok: true }, { headers });
  } catch (error) {
    console.error("portal access request rejected", error);
    return Response.json({ error: "Request could not be accepted." }, { status: 400, headers });
  }
});
