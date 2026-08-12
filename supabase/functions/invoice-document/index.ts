import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { PDFDocument, rgb } from "npm:pdf-lib@1.17.1";
import fontkit from "npm:@pdf-lib/fontkit@1.1.1";

const corsHeaders = {
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const allowedOrigins = new Set(["https://heav.ch", "https://www.heav.ch", "http://localhost:4179", "http://127.0.0.1:4179"]);
const colors = {
  night: rgb(9 / 255, 10 / 255, 8 / 255),
  paper: rgb(238 / 255, 234 / 255, 224 / 255),
  acid: rgb(215 / 255, 255 / 255, 56 / 255),
  sage: rgb(190 / 255, 198 / 255, 183 / 255),
  totalSage: rgb(220 / 255, 225 / 255, 215 / 255),
  muted: rgb(112 / 255, 111 / 255, 105 / 255),
  line: rgb(200 / 255, 196 / 255, 186 / 255),
};

type InvoiceItem = { description: string; quantity: number; unit_price_rappen: number; position: number };
type Customer = { company: string; contact_name: string; email: string; address_line1: string; postal_code: string; city: string; country: string };
type Settings = { company_name: string; owner_name: string; email: string; phone: string; address_line1: string; postal_code: string; city: string; country: string; iban: string; vat_number: string };
type Invoice = { id: string; owner_id: string; invoice_number: string; issue_date: string; due_date: string; sent_at?: string | null; status: string; tax_rate: number; subtotal_rappen: number; tax_rappen: number; total_rappen: number; notes: string; customers: Customer; invoice_items: InvoiceItem[] };

export function escapeHtml(value: unknown) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character] as string);
}

function safeHeader(value: unknown) {
  return String(value ?? "").replace(/[\r\n]+/g, " ").slice(0, 160);
}

function safeFilename(value: unknown) {
  const cleaned = String(value ?? "invoice").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return (cleaned || "invoice").slice(0, 100);
}

async function responsePayload(response: Response) {
  const text = await response.text();
  if (!text) return {};
  try { return JSON.parse(text); } catch { return { message: text.slice(0, 500) }; }
}

const formatCHF = (rappen: number) => {
  const [whole, decimals] = (Math.round(rappen) / 100).toFixed(2).split(".");
  return `CHF ${whole.replace(/\B(?=(\d{3})+(?!\d))/g, "’")}.${decimals}`;
};
const formatDate = (date: string) => date.split("-").reverse().join(".");
const base64 = (bytes: Uint8Array) => {
  let binary = "";
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  return btoa(binary);
};

export async function createInvoicePdf(invoice: Invoice, settings: Settings) {
  if (!invoice.invoice_items?.length) throw new Error("Die Rechnung enthält keine Positionen.");
  if (invoice.invoice_items.length > 10) throw new Error("Maximal 10 Rechnungspositionen pro Dokument werden unterstützt.");
  const computedSubtotal = invoice.invoice_items.reduce(
    (sum, item) => sum + Math.round(Number(item.quantity) * item.unit_price_rappen),
    0,
  );
  const computedTax = Math.round(computedSubtotal * Number(invoice.tax_rate) / 100);
  if (
    computedSubtotal !== invoice.subtotal_rappen ||
    computedTax !== invoice.tax_rappen ||
    computedSubtotal + computedTax !== invoice.total_rappen
  ) throw new Error("Die Rechnungsbeträge sind inkonsistent. Bitte Rechnung neu erstellen.");
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const fontRoot = new URL("../_shared/fonts/", import.meta.url);
  const [dmBytes, serifBytes, italicBytes, syneBytes] = await Promise.all([
    Deno.readFile(new URL("dm-sans.ttf", fontRoot)),
    Deno.readFile(new URL("instrument-serif.ttf", fontRoot)),
    Deno.readFile(new URL("instrument-serif-italic.ttf", fontRoot)),
    Deno.readFile(new URL("syne.ttf", fontRoot)),
  ]);
  const [dm, serif, italic, syne] = await Promise.all([
    pdf.embedFont(dmBytes, { subset: true }), pdf.embedFont(serifBytes, { subset: true }),
    pdf.embedFont(italicBytes, { subset: true }), pdf.embedFont(syneBytes, { subset: true }),
  ]);
  const page = pdf.addPage([595.28, 841.89]);
  const { width, height } = page.getSize();
  const margin = 51;
  const right = width - margin;
  const draw = (text: string, x: number, y: number, size = 9, font = dm, color = colors.night) => page.drawText(String(text || ""), { x, y, size, font, color });
  const drawRight = (text: string, x: number, y: number, size = 9, font = dm, color = colors.night) => draw(text, x - font.widthOfTextAtSize(text, size), y, size, font, color);
  const line = (y: number, x1 = margin, x2 = right, color = colors.line, thickness = 0.6) => page.drawLine({ start: { x: x1, y }, end: { x: x2, y }, color, thickness });

  page.drawRectangle({ x: 0, y: height - 250, width, height: 250, color: colors.night });
  draw("HEAV", margin, height - 56, 20, syne, colors.paper);
  drawRight("FILMPRODUKTION · SCHWEIZ", right, height - 52, 7, dm, colors.muted);
  line(height - 72, margin, right, rgb(.2, .2, .19));
  draw("RECHNUNG", margin, height - 112, 7, syne, colors.acid);
  draw("Clear work.", margin, height - 164, 39, serif, colors.paper);
  draw("Clear numbers.", margin + 177, height - 164, 39, italic, colors.acid);
  draw("Strategy, story & craft. In one frame.", margin, height - 190, 8, dm, colors.muted);
  page.drawRectangle({ x: margin, y: height - 232, width: 4, height: 3, color: colors.acid });
  draw("PRODUKTION · BILDER · BEARBEITUNG", margin + 10, height - 235, 6.5, syne, colors.acid);
  draw("RECHNUNGSNUMMER", 407, height - 111, 6.5, dm, colors.muted);
  draw(invoice.invoice_number, 407, height - 137, 13, syne, colors.paper);
  page.drawRectangle({ x: 407, y: height - 183, width: 98, height: 25, color: colors.acid });
  draw(invoice.status === "paid" ? "BEZAHLT" : invoice.status === "sent" ? "VERSENDET" : "OFFEN", 419, height - 175, 7, dm, colors.night);

  const customer = invoice.customers;
  draw("RECHNUNG AN", margin, height - 286, 6.5, syne, colors.muted);
  [customer.company, customer.contact_name, customer.address_line1, `${customer.postal_code} ${customer.city}`, customer.country].filter(Boolean).forEach((text, index) => draw(text, margin, height - 312 - index * 14, index === 0 ? 10 : 8.7, dm));
  draw("RECHNUNGSDETAILS", 337, height - 286, 6.5, syne, colors.muted);
  [["Rechnungsdatum", formatDate(invoice.issue_date)], ["Fällig am", formatDate(invoice.due_date)], ["Währung", "CHF"]].forEach(([label, value], index) => { draw(label, 337, height - 312 - index * 18, 8, dm, colors.muted); drawRight(value, right, height - 312 - index * 18, 8.5, dm); });

  let y = height - 400;
  line(y, margin, right, colors.night, 1);
  draw("POS", margin, y - 17, 6, syne, colors.muted); draw("LEISTUNG", margin + 44, y - 17, 6, syne, colors.muted);
  drawRight("MENGE", 406, y - 17, 6, syne, colors.muted); drawRight("EINZELPREIS", 490, y - 17, 6, syne, colors.muted); drawRight("BETRAG", right, y - 17, 6, syne, colors.muted);
  y -= 30;
  for (const item of [...invoice.invoice_items].sort((a, b) => a.position - b.position)) {
    const amount = Math.round(Number(item.quantity) * item.unit_price_rappen);
    draw(String(item.position).padStart(2, "0"), margin, y - 11, 7.5, syne);
    draw(item.description.slice(0, 64), margin + 44, y - 11, 8.5, dm);
    drawRight(String(Number(item.quantity)), 406, y - 11, 8, dm);
    drawRight(formatCHF(item.unit_price_rappen).replace("CHF ", ""), 490, y - 11, 8, dm);
    drawRight(formatCHF(amount).replace("CHF ", ""), right, y - 11, 8, dm);
    y -= 32; line(y, margin, right);
  }

  const totalY = Math.max(185, y - 24);
  const totalX = 337;
  const totalWidth = right - totalX;
  page.drawRectangle({ x: totalX, y: totalY - 67, width: totalWidth, height: 67, color: colors.totalSage });
  page.drawRectangle({ x: totalX, y: totalY - 3, width: totalWidth, height: 3, color: colors.acid });
  draw("Zwischensumme", totalX + 13, totalY - 19, 7.5, dm, colors.muted); drawRight(formatCHF(invoice.subtotal_rappen), right - 13, totalY - 19, 8.5, dm);
  draw(`MWST ${Number(invoice.tax_rate).toFixed(1)} %`, totalX + 13, totalY - 37, 7.5, dm, colors.muted); drawRight(formatCHF(invoice.tax_rappen), right - 13, totalY - 37, 8.5, dm);
  line(totalY - 46, totalX + 13, right - 13, colors.night, 0.8);
  draw("TOTAL", totalX + 13, totalY - 61, 9, syne); drawRight(formatCHF(invoice.total_rappen), right - 13, totalY - 62, 12, syne);

  page.drawRectangle({ x: 0, y: 0, width, height: 118, color: colors.sage });
  draw("ZAHLUNGSINFORMATIONEN", margin, 87, 6.5, syne);
  draw(`IBAN  ${settings.iban}`, margin, 63, 8, dm); draw(`Kontoinhaber  ${settings.company_name} · ${settings.owner_name}`, margin, 48, 8, dm); draw(`Zahlungsreferenz  ${invoice.invoice_number}`, margin, 33, 8, dm);
  draw("ABSENDER", 337, 87, 6.5, syne);
  draw(`${settings.company_name} · ${settings.owner_name}`, 337, 63, 8, dm); draw(`${settings.address_line1} · ${settings.postal_code} ${settings.city}`, 337, 48, 8, dm); draw(`${settings.email}${settings.vat_number ? ` · ${settings.vat_number}` : ""}`, 337, 33, 8, dm);
  pdf.setTitle(`${invoice.invoice_number} – HEAV`); pdf.setAuthor(`${settings.company_name} · ${settings.owner_name}`); pdf.setSubject("Rechnung");
  return pdf.save();
}

if (import.meta.main) Deno.serve(async (request) => {
  const origin = request.headers.get("origin") || "";
  const responseCors = { ...corsHeaders, "Access-Control-Allow-Origin": allowedOrigins.has(origin) ? origin : "https://heav.ch", Vary: "Origin" };
  if (request.method === "OPTIONS") return new Response("ok", { headers: responseCors });
  if (request.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405, headers: responseCors });
  if (origin && !allowedOrigins.has(origin)) return Response.json({ error: "Origin not allowed" }, { status: 403, headers: responseCors });
  try {
    const authorization = request.headers.get("Authorization");
    if (!authorization) throw new Error("Nicht angemeldet.");
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authorization } } });
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) throw new Error("Sitzung ungültig.");
    const { invoiceId, action } = await request.json();
    if (!invoiceId || !["download", "send", "mark_paid"].includes(action)) throw new Error("Ungültige Rechnungsaktion.");
    if (action === "mark_paid") {
      const { error } = await supabase.rpc("record_invoice_action", {
        p_invoice_id: invoiceId,
        p_action: "paid",
        p_recipient: null,
        p_details: {},
      });
      if (error) throw error;
      return Response.json({ ok: true }, { headers: responseCors });
    }
    const [{ data: invoice, error: invoiceError }, { data: settings, error: settingsError }] = await Promise.all([
      supabase.from("invoices").select("*, customers(*), invoice_items(*)").eq("id", invoiceId).single(),
      supabase.from("company_settings").select("*").single(),
    ]);
    if (invoiceError || !invoice) throw invoiceError || new Error("Rechnung nicht gefunden.");
    if (settingsError || !settings) throw new Error("Bitte zuerst die Absender- und Bankangaben vervollständigen.");
    const pdfBytes = await createInvoicePdf(invoice as Invoice, settings as Settings);
    if (action === "download") {
      const { error: eventError } = await supabase.rpc("record_invoice_action", {
        p_invoice_id: invoiceId,
        p_action: "downloaded",
        p_recipient: null,
        p_details: {},
      });
      if (eventError) throw eventError;
      const pdfBody = new ArrayBuffer(pdfBytes.byteLength);
      new Uint8Array(pdfBody).set(pdfBytes);
      return new Response(pdfBody, { headers: { ...responseCors, "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${safeFilename(invoice.invoice_number)}.pdf"`, "Cache-Control": "no-store" } });
    }
    const resendKey = Deno.env.get("RESEND_API_KEY");
    const fromEmail = Deno.env.get("RESEND_FROM_EMAIL");
    if (!resendKey || !fromEmail) throw new Error("E-Mail-Versand ist noch nicht konfiguriert.");
    const customer = invoice.customers as Customer;
    if (!["draft", "sent", "overdue"].includes(invoice.status)) throw new Error("Diese Rechnung kann nicht versendet werden.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email) || /[\r\n]/.test(customer.email)) throw new Error("Die Kunden-E-Mail ist ungültig.");
    const sendVersion = invoice.status === "draft" ? "initial" : (invoice.sent_at || "resend");
    const idempotencyKey = safeHeader(`invoice-${invoice.id}-${sendVersion}`).replace(/[^a-zA-Z0-9._-]/g, "-");
    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [customer.email],
        reply_to: settings.email,
        subject: safeHeader(`Rechnung ${invoice.invoice_number} von ${settings.company_name}`),
        html: `<div style="font-family:Arial,sans-serif;color:#090a08;line-height:1.6"><p>Hallo ${escapeHtml(customer.contact_name || customer.company)}</p><p>Im Anhang findest du die Rechnung <strong>${escapeHtml(invoice.invoice_number)}</strong> über <strong>${escapeHtml(formatCHF(invoice.total_rappen))}</strong>.</p><p>Zahlbar bis ${escapeHtml(formatDate(invoice.due_date))}.</p><p>Vielen Dank für die Zusammenarbeit.</p><p>${escapeHtml(settings.owner_name)}<br>${escapeHtml(settings.company_name)}<br><a href="https://heav.ch">heav.ch</a></p></div>`,
        attachments: [{ filename: `${safeFilename(invoice.invoice_number)}.pdf`, content: base64(pdfBytes) }],
      }),
    });
    const emailData = await responsePayload(emailResponse);
    if (!emailResponse.ok) {
      const { error: eventError } = await supabase.rpc("record_invoice_action", {
        p_invoice_id: invoiceId,
        p_action: "send_failed",
        p_recipient: customer.email,
        p_details: emailData,
      });
      if (eventError) console.error("send_failed audit event failed", eventError);
      throw new Error(emailData.message || "E-Mail konnte nicht gesendet werden.");
    }
    const { error: actionError } = await supabase.rpc("record_invoice_action", {
      p_invoice_id: invoiceId,
      p_action: "sent",
      p_recipient: customer.email,
      p_details: { resend_id: emailData.id, idempotency_key: idempotencyKey },
    });
    if (actionError) throw actionError;
    return Response.json({ ok: true, emailId: emailData.id }, { headers: responseCors });
  } catch (error) {
    console.error(error);
    return Response.json({ error: error instanceof Error ? error.message : "Unbekannter Fehler" }, { status: 400, headers: responseCors });
  }
});
