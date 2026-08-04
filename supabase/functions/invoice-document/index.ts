import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { PDFDocument, rgb } from "npm:pdf-lib@1.17.1";
import fontkit from "npm:@pdf-lib/fontkit@1.1.1";
// @ts-types="npm:@types/qrcode@1.5.5"
import QRCode from "npm:qrcode@1.5.4";

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
const compactText = (value: unknown, maxLength: number) =>
  String(value ?? "").replace(/[\r\n]+/g, " ").trim().slice(0, maxLength);
const countryCode = (value: unknown) =>
  /^(ch|schweiz|switzerland|suisse|svizzera)$/i.test(String(value ?? "").trim())
    ? "CH"
    : compactText(value, 2).toUpperCase();

function validIban(value: string) {
  const iban = value.replace(/\s+/g, "").toUpperCase();
  if (!/^(CH|LI)[A-Z0-9]{19}$/.test(iban)) return false;
  const expanded = `${iban.slice(4)}${iban.slice(0, 4)}`.replace(
    /[A-Z]/g,
    (letter) => String(letter.charCodeAt(0) - 55),
  );
  let remainder = 0;
  for (const digit of expanded) {
    remainder = (remainder * 10 + Number(digit)) % 97;
  }
  return remainder === 1;
}

type SwissQrPayload = {
  iban: string;
  creditorName: string;
  creditorStreet: string;
  creditorHouseNumber?: string;
  creditorPostalCode: string;
  creditorCity: string;
  creditorCountry?: string;
  debtorName?: string;
  debtorStreet?: string;
  debtorHouseNumber?: string;
  debtorPostalCode?: string;
  debtorCity?: string;
  debtorCountry?: string;
  amountRappen: number;
  message: string;
};

export function buildSwissQrPayload(input: SwissQrPayload) {
  const iban = input.iban.replace(/\s+/g, "").toUpperCase();
  if (!validIban(iban)) {
    throw new Error(
      "Für den Swiss QR Code ist eine gültige Schweizer oder Liechtensteiner IBAN erforderlich.",
    );
  }
  if (
    !Number.isInteger(input.amountRappen) || input.amountRappen <= 0 ||
    input.amountRappen > 99999999999
  ) throw new Error("Der Swiss-QR-Betrag ist ungültig.");
  const required = [
    input.creditorName,
    input.creditorStreet,
    input.creditorPostalCode,
    input.creditorCity,
  ];
  if (required.some((value) => !String(value ?? "").trim())) {
    throw new Error(
      "Die Gläubigeradresse ist für den Swiss QR Code unvollständig.",
    );
  }
  const debtorComplete = [
    input.debtorName,
    input.debtorStreet,
    input.debtorPostalCode,
    input.debtorCity,
  ].every((value) => String(value ?? "").trim());
  const lines = [
    "SPC",
    "0200",
    "1",
    iban,
    "S",
    compactText(input.creditorName, 70),
    compactText(input.creditorStreet, 70),
    compactText(input.creditorHouseNumber, 16),
    compactText(input.creditorPostalCode, 16),
    compactText(input.creditorCity, 35),
    countryCode(input.creditorCountry || "CH"),
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    (input.amountRappen / 100).toFixed(2),
    "CHF",
    ...(debtorComplete
      ? [
        "S",
        compactText(input.debtorName, 70),
        compactText(input.debtorStreet, 70),
        compactText(input.debtorHouseNumber, 16),
        compactText(input.debtorPostalCode, 16),
        compactText(input.debtorCity, 35),
        countryCode(input.debtorCountry || "CH"),
      ]
      : ["", "", "", "", "", "", ""]),
    "NON",
    "",
    compactText(input.message, 140),
    "EPD",
    "",
    "",
    "",
  ];
  return lines.join("\n");
}

function splitStreet(value: string) {
  const match = String(value ?? "").trim().match(/^(.*?)[,\s]+(\d+[\w/-]*)$/u);
  return match
    ? { street: match[1].trim(), houseNumber: match[2] }
    : { street: String(value ?? "").trim(), houseNumber: "" };
}
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
  const margin = 42.52;
  const right = width - margin;
  const draw = (
    text: string,
    x: number,
    y: number,
    size = 9,
    font = dm,
    color = colors.night,
  ) => page.drawText(String(text || ""), { x, y, size, font, color });
  const drawRight = (
    text: string,
    x: number,
    y: number,
    size = 9,
    font = dm,
    color = colors.night,
  ) => draw(text, x - font.widthOfTextAtSize(text, size), y, size, font, color);
  const line = (
    y: number,
    x1 = margin,
    x2 = right,
    color = colors.line,
    thickness = 0.6,
  ) =>
    page.drawLine({ start: { x: x1, y }, end: { x: x2, y }, color, thickness });
  const fittedSize = (
    text: string,
    font: typeof dm,
    maxSize: number,
    maxWidth: number,
    minSize = 7,
  ) => {
    let size = maxSize;
    while (size > minSize && font.widthOfTextAtSize(text, size) > maxWidth) {
      size -= 0.25;
    }
    return size;
  };
  const drawWrapped = (
    target: typeof page,
    text: string,
    x: number,
    y: number,
    maxWidth: number,
    size: number,
    font = dm,
    color = colors.night,
    leading = size * 1.25,
    maxLines = 3,
  ) => {
    const words = compactText(text, 280).split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    for (const word of words) {
      const candidate = lines.length
        ? `${lines[lines.length - 1]} ${word}`
        : word;
      if (!lines.length || font.widthOfTextAtSize(candidate, size) > maxWidth) {
        lines.push(word);
      } else lines[lines.length - 1] = candidate;
      if (lines.length > maxLines) break;
    }
    lines.slice(0, maxLines).forEach((entry, index) =>
      target.drawText(entry, { x, y: y - index * leading, size, font, color })
    );
  };

  // Header: clear hierarchy and a dedicated, collision-free invoice-number column.
  page.drawRectangle({
    x: 0,
    y: height - 154,
    width,
    height: 154,
    color: colors.night,
  });
  draw("HEAV", margin, height - 46, 19, syne, colors.paper);
  drawRight(
    "FILMPRODUKTION · SCHWEIZ",
    right,
    height - 43,
    6.5,
    dm,
    colors.muted,
  );
  line(height - 62, margin, right, rgb(.2, .2, .19));
  draw("RECHNUNG", margin, height - 106, 34, serif, colors.paper);
  draw(
    "PRODUKTION · BILDER · BEARBEITUNG",
    margin + 2,
    height - 129,
    6.5,
    syne,
    colors.acid,
  );
  page.drawLine({
    start: { x: 348, y: height - 132 },
    end: { x: 348, y: height - 82 },
    color: rgb(.24, .24, .22),
    thickness: .7,
  });
  draw("RECHNUNGSNUMMER", 366, height - 88, 5.8, syne, colors.muted);
  const numberSize = fittedSize(
    invoice.invoice_number,
    syne,
    13,
    right - 366,
    8,
  );
  draw(
    invoice.invoice_number,
    366,
    height - 110,
    numberSize,
    syne,
    colors.paper,
  );
  const statusLabel = invoice.status === "paid"
    ? "BEZAHLT"
    : invoice.status === "sent"
    ? "VERSENDET"
    : "OFFEN";
  page.drawRectangle({
    x: 366,
    y: height - 138,
    width: 78,
    height: 17,
    color: colors.acid,
  });
  draw(statusLabel, 376, height - 132.5, 5.8, syne, colors.night);

  const customer = invoice.customers;
  draw("RECHNUNG AN", margin, height - 192, 6, syne, colors.muted);
  [
    customer.company,
    customer.contact_name,
    customer.address_line1,
    `${customer.postal_code} ${customer.city}`,
    customer.country,
  ]
    .filter(Boolean)
    .forEach((text, index) =>
      draw(
        text,
        margin,
        height - 216 - index * 13,
        index === 0 ? 10 : 8.2,
        index === 0 ? syne : dm,
      )
    );
  draw("RECHNUNGSDETAILS", 337, height - 192, 6, syne, colors.muted);
  [["Rechnungsdatum", formatDate(invoice.issue_date)], [
    "Fällig am",
    formatDate(invoice.due_date),
  ], ["Währung", "CHF"]]
    .forEach(([label, value], index) => {
      draw(label, 337, height - 216 - index * 17, 7.5, dm, colors.muted);
      drawRight(value, right, height - 216 - index * 17, 8, dm);
    });

  let y = height - 318;
  line(y, margin, right, colors.night, 1);
  draw("POS", margin, y - 16, 5.8, syne, colors.muted);
  draw("LEISTUNG", margin + 40, y - 16, 5.8, syne, colors.muted);
  drawRight("MENGE", 404, y - 16, 5.8, syne, colors.muted);
  drawRight("EINZELPREIS", 486, y - 16, 5.8, syne, colors.muted);
  drawRight("BETRAG", right, y - 16, 5.8, syne, colors.muted);
  y -= 27;
  const rowHeight = invoice.invoice_items.length > 6 ? 19 : 27;
  for (
    const item of [...invoice.invoice_items].sort((a, b) =>
      a.position - b.position
    )
  ) {
    const amount = Math.round(Number(item.quantity) * item.unit_price_rappen);
    draw(String(item.position).padStart(2, "0"), margin, y - 9, 7, syne);
    const descriptionSize = fittedSize(
      compactText(item.description, 80),
      dm,
      8,
      250,
      6.5,
    );
    draw(
      compactText(item.description, 80),
      margin + 40,
      y - 9,
      descriptionSize,
      dm,
    );
    drawRight(String(Number(item.quantity)), 404, y - 9, 7.5, dm);
    drawRight(
      formatCHF(item.unit_price_rappen).replace("CHF ", ""),
      486,
      y - 9,
      7.5,
      dm,
    );
    drawRight(formatCHF(amount).replace("CHF ", ""), right, y - 9, 7.5, dm);
    y -= rowHeight;
    line(y, margin, right);
  }

  const totalY = Math.max(invoice.invoice_items.length > 6 ? 86 : 334, y - 19);
  draw("Zwischensumme", 355, totalY, 7.5, dm, colors.muted);
  drawRight(formatCHF(invoice.subtotal_rappen), right, totalY, 8, dm);
  draw(
    `MWST ${Number(invoice.tax_rate).toFixed(1)} %`,
    355,
    totalY - 17,
    7.5,
    dm,
    colors.muted,
  );
  drawRight(formatCHF(invoice.tax_rappen), right, totalY - 17, 8, dm);
  line(totalY - 28, 355, right, colors.night, 1);
  draw("TOTAL", 355, totalY - 49, 8.5, syne);
  drawRight(formatCHF(invoice.total_rappen), right, totalY - 51, 12, syne);

  const creditorAddress = splitStreet(settings.address_line1);
  const debtorAddress = splitStreet(customer.address_line1);
  const qrPayload = buildSwissQrPayload({
    iban: settings.iban,
    creditorName: `${settings.company_name} · ${settings.owner_name}`,
    creditorStreet: creditorAddress.street,
    creditorHouseNumber: creditorAddress.houseNumber,
    creditorPostalCode: settings.postal_code,
    creditorCity: settings.city,
    creditorCountry: settings.country,
    debtorName: customer.company || customer.contact_name,
    debtorStreet: debtorAddress.street,
    debtorHouseNumber: debtorAddress.houseNumber,
    debtorPostalCode: customer.postal_code,
    debtorCity: customer.city,
    debtorCountry: customer.country,
    amountRappen: invoice.total_rappen,
    message: `${invoice.invoice_number} · ${
      invoice.invoice_items[0]?.description || "Rechnung"
    }`,
  });

  const renderPaymentPart = (target: typeof page) => {
    const sectionTop = 297.64; // 105 mm Swiss payment-part height.
    const receiptWidth = 175.75; // 62 mm receipt width.
    target.drawLine({
      start: { x: 0, y: sectionTop },
      end: { x: width, y: sectionTop },
      color: colors.night,
      thickness: .55,
      dashArray: [3, 2],
    });
    target.drawLine({
      start: { x: receiptWidth, y: 0 },
      end: { x: receiptWidth, y: sectionTop },
      color: colors.night,
      thickness: .55,
      dashArray: [3, 2],
    });
    const pdraw = (text: string, x: number, y: number, size = 6.2, font = dm) =>
      target.drawText(String(text || ""), {
        x,
        y,
        size,
        font,
        color: colors.night,
      });
    const pdrawRight = (
      text: string,
      x: number,
      y: number,
      size = 6.2,
      font = dm,
    ) => pdraw(text, x - font.widthOfTextAtSize(text, size), y, size, font);
    const creditorLines = [
      `${settings.company_name} · ${settings.owner_name}`,
      `${creditorAddress.street} ${creditorAddress.houseNumber}`.trim(),
      `${settings.postal_code} ${settings.city}`,
    ];
    const debtorLines = [
      customer.company || customer.contact_name,
      `${debtorAddress.street} ${debtorAddress.houseNumber}`.trim(),
      `${customer.postal_code} ${customer.city}`,
    ];

    pdraw("Empfangsschein", 14, sectionTop - 22, 9, syne);
    pdraw("Konto / Zahlbar an", 14, sectionTop - 43, 5.7, syne);
    pdraw(
      settings.iban.replace(/(.{4})/g, "$1 ").trim(),
      14,
      sectionTop - 55,
      6.1,
      dm,
    );
    creditorLines.forEach((entry, index) =>
      pdraw(entry, 14, sectionTop - 66 - index * 9, 5.8, dm)
    );
    pdraw("Zahlbar durch", 14, sectionTop - 105, 5.7, syne);
    debtorLines.forEach((entry, index) =>
      pdraw(entry, 14, sectionTop - 117 - index * 9, 5.8, dm)
    );
    pdraw("Währung", 14, 70, 5.7, syne);
    pdraw("Betrag", 62, 70, 5.7, syne);
    pdraw("CHF", 14, 56, 7, syne);
    pdrawRight(
      (invoice.total_rappen / 100).toFixed(2),
      receiptWidth - 14,
      56,
      8,
      syne,
    );
    pdraw("Annahmestelle", 95, 18, 5.7, syne);

    const paymentX = receiptWidth + 17;
    pdraw("Zahlteil", paymentX, sectionTop - 22, 9, syne);
    const qrSize = 130.39; // 46 mm.
    const qrX = paymentX;
    const qrY = 48;
    const qr = QRCode.create(qrPayload, { errorCorrectionLevel: "M" });
    const moduleCount = qr.modules.size;
    const moduleSize = qrSize / (moduleCount + 8);
    const offsetX = qrX + moduleSize * 4;
    const offsetY = qrY + moduleSize * 4;
    for (let row = 0; row < moduleCount; row++) {
      for (let column = 0; column < moduleCount; column++) {
        if (qr.modules.get(row, column)) {
          target.drawRectangle({
            x: offsetX + column * moduleSize,
            y: offsetY + (moduleCount - row - 1) * moduleSize,
            width: moduleSize + .03,
            height: moduleSize + .03,
            color: colors.night,
          });
        }
      }
    }
    const crossSize = 19.84;
    const crossX = qrX + (qrSize - crossSize) / 2;
    const crossY = qrY + (qrSize - crossSize) / 2;
    target.drawRectangle({
      x: crossX - 1.4,
      y: crossY - 1.4,
      width: crossSize + 2.8,
      height: crossSize + 2.8,
      color: rgb(1, 1, 1),
    });
    target.drawRectangle({
      x: crossX,
      y: crossY,
      width: crossSize,
      height: crossSize,
      color: colors.night,
    });
    target.drawRectangle({
      x: crossX + 7.2,
      y: crossY + 3.3,
      width: 5.4,
      height: 13.2,
      color: rgb(1, 1, 1),
    });
    target.drawRectangle({
      x: crossX + 3.3,
      y: crossY + 7.2,
      width: 13.2,
      height: 5.4,
      color: rgb(1, 1, 1),
    });
    pdraw("Währung", qrX, 31, 5.7, syne);
    pdraw("Betrag", qrX + 49, 31, 5.7, syne);
    pdraw("CHF", qrX, 17, 7, syne);
    pdraw((invoice.total_rappen / 100).toFixed(2), qrX + 49, 17, 8, syne);

    const infoX = 343;
    pdraw("Konto / Zahlbar an", infoX, sectionTop - 43, 5.7, syne);
    pdraw(
      settings.iban.replace(/(.{4})/g, "$1 ").trim(),
      infoX,
      sectionTop - 55,
      6.2,
      dm,
    );
    creditorLines.forEach((entry, index) =>
      pdraw(entry, infoX, sectionTop - 67 - index * 9, 5.8, dm)
    );
    pdraw("Referenz", infoX, sectionTop - 105, 5.7, syne);
    pdraw("Keine Referenz", infoX, sectionTop - 117, 5.8, dm);
    pdraw("Zusätzliche Informationen", infoX, sectionTop - 139, 5.7, syne);
    drawWrapped(
      target,
      `${invoice.invoice_number} · ${
        invoice.invoice_items[0]?.description || "Rechnung"
      }`,
      infoX,
      sectionTop - 151,
      right - infoX,
      5.8,
      dm,
      colors.night,
      7.5,
      3,
    );
    pdraw("Zahlbar durch", infoX, sectionTop - 190, 5.7, syne);
    debtorLines.forEach((entry, index) =>
      pdraw(entry, infoX, sectionTop - 202 - index * 9, 5.8, dm)
    );
  };

  if (invoice.invoice_items.length <= 6) renderPaymentPart(page);
  else {
    draw("Zahlteil auf der Folgeseite", margin, 29, 6.5, syne, colors.muted);
    const paymentPage = pdf.addPage([595.28, 841.89]);
    paymentPage.drawText("HEAV", {
      x: margin,
      y: height - 46,
      size: 19,
      font: syne,
      color: colors.night,
    });
    paymentPage.drawText(`${invoice.invoice_number} · Zahlungsseite`, {
      x: margin,
      y: height - 68,
      size: 8,
      font: dm,
      color: colors.muted,
    });
    renderPaymentPart(paymentPage);
  }
  pdf.setTitle(`${invoice.invoice_number} – HEAV`);
  pdf.setAuthor(`${settings.company_name} · ${settings.owner_name}`);
  pdf.setSubject("Rechnung mit Swiss QR-Zahlteil");
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
