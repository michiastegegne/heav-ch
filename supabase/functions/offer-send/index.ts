import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const allowedOrigins = new Set(["https://heav.ch", "https://www.heav.ch", "http://127.0.0.1:4179", "http://localhost:4179"]);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const validMailbox = (value: unknown) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
const esc = (value: unknown) => String(value || "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
const chf = (rappen: number) => new Intl.NumberFormat("de-CH", { style: "currency", currency: "CHF" }).format(Number(rappen || 0) / 100);

function reply(payload: Record<string, unknown>, status: number, headers: Record<string, string>) {
  return Response.json(payload, { status, headers });
}

Deno.serve(async (request) => {
  const origin = request.headers.get("origin") || "";
  const headers = {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Origin": allowedOrigins.has(origin) ? origin : "https://heav.ch",
    Vary: "Origin",
  };
  if (request.method === "OPTIONS") return new Response("ok", { headers });
  if (request.method !== "POST") return reply({ error: "Method not allowed" }, 405, headers);
  if (origin && !allowedOrigins.has(origin)) return reply({ error: "Origin not allowed" }, 403, headers);

  try {
    const authorization = request.headers.get("authorization") || "";
    if (!authorization.startsWith("Bearer ")) return reply({ error: "Anmeldung erforderlich." }, 401, headers);
    const { offerId } = await request.json();
    if (typeof offerId !== "string" || !uuidPattern.test(offerId)) return reply({ error: "Ungültige Offerte." }, 400, headers);

    const url = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const caller = createClient(url, anonKey, { global: { headers: { Authorization: authorization } }, auth: { autoRefreshToken: false, persistSession: false } });
    const { data: identity, error: identityError } = await caller.auth.getUser();
    if (identityError || !identity.user) return reply({ error: "Anmeldung erforderlich." }, 401, headers);

    const service = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: offer, error: offerError } = await service.from("offers")
      .select("id,owner_id,customer_id,offer_number,title,valid_until,status,total_rappen")
      .eq("id", offerId).eq("owner_id", identity.user.id).maybeSingle();
    if (offerError) throw offerError;
    if (!offer) return reply({ error: "Offerte nicht gefunden." }, 404, headers);
    if (offer.status !== "sent") return reply({ error: "Die Offerte muss zuerst freigegeben werden." }, 409, headers);
    if (offer.valid_until < new Date().toISOString().slice(0, 10)) return reply({ error: "Diese Offerte ist abgelaufen." }, 409, headers);

    const [{ data: customer, error: customerError }, { data: memberships, error: membershipError }, { data: settings, error: settingsError }] = await Promise.all([
      service.from("customers").select("email,company,contact_name").eq("id", offer.customer_id).eq("owner_id", identity.user.id).maybeSingle(),
      service.from("customer_portal_memberships").select("id").eq("customer_id", offer.customer_id).eq("status", "active").limit(1),
      service.from("company_settings").select("company_name,owner_name,email").eq("owner_id", identity.user.id).maybeSingle(),
    ]);
    if (customerError || membershipError || settingsError) throw customerError || membershipError || settingsError;
    if (!customer || !validMailbox(customer.email)) return reply({ error: "Für diesen Kunden fehlt eine gültige E-Mail-Adresse." }, 409, headers);
    if (!memberships?.length) return reply({ error: "Der Kundenportalzugang muss zuerst per Einladung freigeschaltet werden." }, 409, headers);
    if (!validMailbox(settings?.email)) return reply({ error: "Die HEAV-Antwortadresse ist ungültig." }, 409, headers);

    const resendKey = Deno.env.get("RESEND_API_KEY");
    const fromEmail = Deno.env.get("RESEND_FROM_EMAIL");
    if (!resendKey || !validMailbox(fromEmail)) return reply({ error: "E-Mail-Versand ist noch nicht konfiguriert." }, 503, headers);
    const recipientName = customer.contact_name || customer.company || "Guten Tag";
    const portalLink = `https://heav.ch/client/?offer=${encodeURIComponent(offer.id)}`;
    const subject = `Offerte ${offer.offer_number} von ${settings.company_name || "HEAV"}`;
    const text = `Hallo ${recipientName}\n\nDeine Offerte „${offer.title}" über ${chf(offer.total_rappen)} liegt bereit.\n\nIm geschützten Kundenportal ansehen und verbindlich annehmen:\n${portalLink}\n\nFreundliche Grüsse\n${settings.owner_name || "HEAV"}\n${settings.company_name || "HEAV"}`;
    const html = `<div style="margin:0;padding:32px 20px;background:#eeeae0;color:#090a08;font-family:Arial,sans-serif"><div style="max-width:620px;margin:0 auto;background:#fffdf8"><div style="padding:24px 28px;background:#090a08;color:#eeeae0;font-size:25px;font-weight:700;letter-spacing:-1px">HEAV</div><div style="padding:34px 28px"><p style="margin:0 0 18px">Hallo ${esc(recipientName)}</p><h1 style="margin:0 0 16px;font-size:30px;font-weight:400">Deine Offerte ist bereit.</h1><p style="line-height:1.55">${esc(offer.title)} · ${esc(chf(offer.total_rappen))}</p><p style="margin:28px 0"><a href="${portalLink}" style="display:inline-block;padding:14px 20px;background:#d7ff38;color:#090a08;text-decoration:none;font-weight:700">Offerte ansehen</a></p><p style="color:#686761;font-size:13px;line-height:1.5">Die Offerte ist im geschützten Kundenportal verfügbar und kann dort verbindlich angenommen werden.</p><p style="margin:28px 0 0">Freundliche Grüsse<br>${esc(settings.owner_name || "HEAV")}<br>${esc(settings.company_name || "HEAV")}</p></div></div></div>`;
    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json", "Idempotency-Key": `offer-${offer.id}-${crypto.randomUUID()}` },
      body: JSON.stringify({ from: fromEmail, to: [customer.email], reply_to: settings.email, subject, text, html }),
    });
    const emailData = await emailResponse.json().catch(() => ({}));
    if (!emailResponse.ok) return reply({ error: String(emailData.message || "E-Mail konnte nicht gesendet werden.") }, 502, headers);
    const { error: eventError } = await service.from("offer_events").insert({ owner_id: offer.owner_id, offer_id: offer.id, kind: "emailed", actor_id: identity.user.id, details: { recipient: customer.email, resend_id: emailData.id || null } });
    if (eventError) throw eventError;
    return reply({ ok: true, recipient: customer.email }, 200, headers);
  } catch (error) {
    console.error("offer email failed", error);
    return reply({ error: error instanceof Error ? error.message : "Offerte konnte nicht per E-Mail gesendet werden." }, 400, headers);
  }
});
