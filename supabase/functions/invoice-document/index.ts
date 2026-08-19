import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { degrees, PDFDocument, rgb } from "npm:pdf-lib@1.17.1";
import fontkit from "npm:@pdf-lib/fontkit@1.1.1";
// @ts-types="npm:@types/qrcode@1.5.5"
import QRCode from "npm:qrcode@1.5.4";

const corsHeaders = {
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const allowedOrigins = new Set([
  "https://heav.ch",
  "https://www.heav.ch",
  "http://localhost:4179",
  "http://127.0.0.1:4179",
]);
const colors = {
  night: rgb(9 / 255, 10 / 255, 8 / 255),
  paper: rgb(238 / 255, 234 / 255, 224 / 255),
  acid: rgb(215 / 255, 255 / 255, 56 / 255),
  sage: rgb(190 / 255, 198 / 255, 183 / 255),
  totalSage: rgb(220 / 255, 225 / 255, 215 / 255),
  muted: rgb(112 / 255, 111 / 255, 105 / 255),
  line: rgb(200 / 255, 196 / 255, 186 / 255),
};

type InvoiceItem = {
  description: string;
  quantity: number;
  unit_price_rappen: number;
  position: number;
};
type Customer = {
  company: string;
  contact_name: string;
  email: string;
  address_line1: string;
  postal_code: string;
  city: string;
  country: string;
};
type Settings = {
  company_name: string;
  owner_name: string;
  email: string;
  phone: string;
  address_line1: string;
  postal_code: string;
  city: string;
  country: string;
  iban: string;
  vat_number: string;
  website_url?: string;
  instagram_url?: string;
};
type Invoice = {
  id: string;
  owner_id: string;
  invoice_number: string;
  payment_reference: string;
  project_title_snapshot?: string | null;
  is_legacy?: boolean;
  issue_date: string;
  due_date: string;
  sent_at?: string | null;
  status: string;
  tax_rate: number;
  subtotal_rappen: number;
  tax_rappen: number;
  total_rappen: number;
  notes: string;
  customers: Customer;
  customer_snapshot?: Customer;
  issuer_snapshot?: Settings;
  invoice_items: InvoiceItem[];
};

export function escapeHtml(value: unknown) {
  return String(value ?? "").replace(/[&<>"']/g, (character) =>
    ({
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
  const cleaned = String(value ?? "invoice").replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  return (cleaned || "invoice").slice(0, 100);
}

export function invoiceFilename(invoice: Invoice) {
  const subject = compactText(
    invoice.project_title_snapshot || invoice.customers?.company ||
      invoice.customers?.contact_name,
    90,
  );
  const parts = [
    "HEAV-Rechnung",
    subject,
    formatDocumentReference(invoice.invoice_number),
  ];
  return `${safeFilename(parts.filter(Boolean).join("-"))}.pdf`;
}

async function responsePayload(response: Response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { message: text.slice(0, 500) };
  }
}

const formatCHF = (rappen: number) => {
  const [whole, decimals] = (Math.round(rappen) / 100).toFixed(2).split(".");
  return `CHF ${whole.replace(/\B(?=(\d{3})+(?!\d))/g, "’")}.${decimals}`;
};
const formatDate = (date: string) => date.split("-").reverse().join(".");
export const formatPaymentReference = (value: string) =>
  String(value ?? "")
    .replace(/\s+/g, "")
    .toUpperCase()
    .replace(/(.{4})/g, "$1 ")
    .trim();
export const formatDocumentReference = (value: string) => {
  const raw = String(value ?? "").trim();
  const digits = raw.match(/(?:#|\D)*(\d+)$/)?.[1] || raw.replace(/\D/g, "");
  return `#${digits.padStart(5, "0")}`;
};

// The QR reference is the authoritative payment identifier. Keep the optional
// QR information field independent from free-form line-item text, because that
// text may contain Unicode characters outside the Swiss QR character repertoire.
export const buildInvoicePaymentMessage = (
  invoice: Pick<Invoice, "invoice_number" | "invoice_items">,
) => `HEAV ${formatDocumentReference(invoice.invoice_number).slice(1)}`;

const compactText = (value: unknown, maxLength: number) =>
  String(value ?? "").replace(/[\r\n]+/g, " ").trim().slice(0, maxLength);
const normalizedVatNumber = (value: unknown) =>
  String(value ?? "").trim().toUpperCase();
export const validVatNumber = (value: unknown) =>
  /^CHE-\d{3}\.\d{3}\.\d{3} (MWST|TVA|IVA)$/.test(normalizedVatNumber(value));
const validMailbox = (value: unknown, allowDisplayName = false) => {
  const raw = String(value ?? "");
  if (/[\r\n]/.test(raw)) return false;
  const address = allowDisplayName && raw.includes("<")
    ? raw.match(/^[^<>]{1,100}<([^\s<>@]+@[^\s<>@]+\.[^\s<>@]+)>$/)?.[1]
    : raw;
  return Boolean(address && /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(address));
};

const safePublicUrl = (value: unknown, fallback = "") => {
  try {
    const url = new URL(String(value || fallback));
    return ["http:", "https:"].includes(url.protocol)
      ? url.toString()
      : fallback;
  } catch {
    return fallback;
  }
};

function invoiceGreetingAndProject(invoice: Invoice) {
  const greeting = compactText(
    invoice.customers.contact_name || invoice.customers.company,
    160,
  );
  const projectTitle = compactText(invoice.project_title_snapshot, 160);
  const projectLine = projectTitle
    ? `Please find attached the invoice for “${projectTitle}”.`
    : "Please find the invoice attached as a PDF.";
  return { greeting, projectLine };
}

export function buildInvoiceText(invoice: Invoice, settings: Settings) {
  const { greeting, projectLine } = invoiceGreetingAndProject(invoice);
  return `Hello ${greeting}\n\n${projectLine}\n\nThank you for the opportunity and the great collaboration.\n\nIf you have any questions, please feel free to get in touch.\n\nKind regards\n${
    compactText(settings.owner_name, 160)
  }\n${compactText(settings.company_name, 160)}`;
}

export function buildInvoiceEmailHtml(invoice: Invoice, settings: Settings) {
  const { greeting, projectLine } = invoiceGreetingAndProject(invoice);
  const name = escapeHtml(compactText(settings.owner_name, 160));
  const company = escapeHtml(compactText(settings.company_name, 160));
  const phone = compactText(settings.phone, 80);
  const email = compactText(settings.email, 160);
  const website = safePublicUrl(settings.website_url, "https://heav.ch");
  const profileImage =
    "https://heav.ch/assets/images/michias-email-profile-headroom.jpg";
  const wordmarkImage = "https://heav.ch/assets/images/heav-email-wordmark.png";
  const phoneRow = phone
    ? `<br><a href="tel:${
      escapeHtml(phone.replace(/[^+0-9]/g, ""))
    }" style="color:#777777;text-decoration:none;">${escapeHtml(phone)}</a>`
    : "";
  return `<div style="margin:0;padding:0;font-family:Arial,Helvetica,sans-serif;color:#151515;font-size:16px;line-height:1.55;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;margin:0 0 28px;padding:0;background:#080909;">
    <tr>
      <td style="padding:18px 20px;">
        <img src="${wordmarkImage}" width="154" height="35" alt="HEAV" style="display:block;width:154px;height:35px;border:0;outline:none;text-decoration:none;" />
      </td>
    </tr>
  </table>
  <p style="margin:0 0 20px;">Hello ${escapeHtml(greeting)}</p>
  <p style="margin:0 0 20px;">${escapeHtml(projectLine)}</p>
  <p style="margin:0 0 20px;">Thank you for the opportunity and the great collaboration.</p>
  <p style="margin:0 0 26px;">If you have any questions, please feel free to get in touch.</p>
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin:0;padding:0;">
    <tr>
      <td valign="middle" style="padding:0 18px 0 0;">
        <img src="${profileImage}" width="88" height="88" alt="${name}" style="display:block;width:88px;height:88px;border:1px solid #151515;border-radius:50%;object-fit:cover;" />
      </td>
      <td valign="middle" style="padding:0;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.45;">
        <strong style="display:block;color:#111111;font-size:18px;line-height:1.2;">${name}</strong>
        <span style="display:block;margin:3px 0 7px;color:#777777;">Founder &amp; Owner | ${company}</span>
        <a href="mailto:${
    escapeHtml(email)
  }" style="color:#111111;text-decoration:underline;text-underline-offset:2px;">${
    escapeHtml(email)
  }</a>${phoneRow}<br>
        <a href="${
    escapeHtml(website)
  }" style="color:#777777;text-decoration:underline;text-underline-offset:2px;">${
    escapeHtml(website.replace(/^https?:\/\//, "").replace(/\/$/, ""))
  }</a>
      </td>
    </tr>
  </table>
</div>`;
}

const isoCountryCodes = new Set(
  "AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW"
    .split(" "),
);
const countryAliases = new Map([
  ["schweiz", "CH"],
  ["switzerland", "CH"],
  ["suisse", "CH"],
  ["svizzera", "CH"],
  ["liechtenstein", "LI"],
  ["deutschland", "DE"],
  ["germany", "DE"],
  ["österreich", "AT"],
  ["austria", "AT"],
  ["frankreich", "FR"],
  ["france", "FR"],
  ["italien", "IT"],
  ["italy", "IT"],
  ["vereinigtes königreich", "GB"],
  ["united kingdom", "GB"],
]);
const countryCode = (value: unknown) => {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const alias = countryAliases.get(raw.toLocaleLowerCase("de-CH"));
  const code = alias || raw.toUpperCase();
  if (!/^[A-Z]{2}$/.test(code) || !isoCountryCodes.has(code)) {
    throw new Error(
      `Ungültiges Rechnungsland: ${
        compactText(raw, 80)
      }. Bitte ISO-Ländercode verwenden.`,
    );
  }
  return code;
};

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

function isQrIban(value: string) {
  const compact = value.replace(/\s+/g, "").toUpperCase();
  const iid = Number(compact.slice(4, 9));
  return Number.isInteger(iid) && iid >= 30000 && iid <= 31999;
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
  reference: string;
  message: string;
};

function validCreditorReference(value: string) {
  const reference = value.replace(/\s+/g, "").toUpperCase();
  if (!/^RF\d{2}[A-Z0-9]{1,21}$/.test(reference)) return false;
  const expanded = `${reference.slice(4)}${reference.slice(0, 4)}`.replace(
    /[A-Z]/g,
    (letter) => String(letter.charCodeAt(0) - 55),
  );
  let remainder = 0;
  for (const digit of expanded) {
    remainder = (remainder * 10 + Number(digit)) % 97;
  }
  return remainder === 1;
}

const blkbAllowedQrCharacter = /^[A-Za-z0-9 ?!%_.,:/*"&;()'+-]$/;

const swissQrText = (value: unknown, maxLength: number, field: string) => {
  // BLKB accepts the QR text only in this conservative ASCII repertoire.
  // Preserve German spellings before stripping remaining Unicode marks, then
  // replace typographic punctuation and discard data-irrelevant symbols.
  const text = String(value ?? "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/Ä/g, "Ae")
    .replace(/Ö/g, "Oe")
    .replace(/Ü/g, "Ue")
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .replace(/[·•–—]/g, "-")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[^A-Za-z0-9 ?!%_.,:/*"&;()'+-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength)
    .trim();
  if (![...text].every((character) => blkbAllowedQrCharacter.test(character))) {
    throw new Error(
      `${field} enthält Zeichen, die im Swiss QR Code nicht zulässig sind.`,
    );
  }
  return text;
};

export function buildSwissQrPayload(input: SwissQrPayload) {
  const iban = input.iban.replace(/\s+/g, "").toUpperCase();
  if (!validIban(iban)) {
    throw new Error(
      "Für den Swiss QR Code ist eine gültige Schweizer oder Liechtensteiner IBAN erforderlich.",
    );
  }
  if (isQrIban(iban)) {
    throw new Error(
      "Eine QR-IBAN ist nur mit einer numerischen QRR-Referenz zulässig. Für die HEAV-SCOR-Referenz ist eine normale IBAN erforderlich.",
    );
  }
  if (
    !Number.isInteger(input.amountRappen) || input.amountRappen <= 0 ||
    input.amountRappen > 99999999999
  ) throw new Error("Der Swiss-QR-Betrag ist ungültig.");
  const reference = input.reference.replace(/\s+/g, "").toUpperCase();
  if (!validCreditorReference(reference)) {
    throw new Error("Die Swiss-QR-Referenz ist ungültig.");
  }
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
    swissQrText(input.creditorName, 70, "Gläubigername"),
    swissQrText(input.creditorStreet, 70, "Gläubigerstrasse"),
    swissQrText(input.creditorHouseNumber, 16, "Gläubiger-Hausnummer"),
    swissQrText(input.creditorPostalCode, 16, "Gläubiger-Postleitzahl"),
    swissQrText(input.creditorCity, 35, "Gläubigerort"),
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
        swissQrText(input.debtorName, 70, "Zahlungspflichtiger Name"),
        swissQrText(input.debtorStreet, 70, "Zahlungspflichtiger Strasse"),
        swissQrText(
          input.debtorHouseNumber,
          16,
          "Zahlungspflichtiger Hausnummer",
        ),
        swissQrText(
          input.debtorPostalCode,
          16,
          "Zahlungspflichtiger Postleitzahl",
        ),
        swissQrText(input.debtorCity, 35, "Zahlungspflichtiger Ort"),
        countryCode(input.debtorCountry || "CH"),
      ]
      : ["", "", "", "", "", "", ""]),
    "SCOR",
    reference,
    swissQrText(input.message, 140, "Zusätzliche Information"),
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
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  return btoa(binary);
};

export async function createInvoicePdf(invoice: Invoice, settings: Settings) {
  if (!invoice.invoice_items?.length) {
    throw new Error("Die Rechnung enthält keine Positionen.");
  }
  if (invoice.invoice_items.length > 10) {
    throw new Error(
      "Maximal 10 Rechnungspositionen pro Dokument werden unterstützt.",
    );
  }
  if (Number(invoice.tax_rate) > 0 && !validVatNumber(settings.vat_number)) {
    throw new Error(
      "Für MWST ist eine gültige Schweizer MWST-Nummer erforderlich.",
    );
  }
  const computedSubtotal = invoice.invoice_items.reduce(
    (sum, item) =>
      sum + Math.round(Number(item.quantity) * item.unit_price_rappen),
    0,
  );
  const computedTax = Math.round(
    computedSubtotal * Number(invoice.tax_rate) / 100,
  );
  if (
    computedSubtotal !== invoice.subtotal_rappen ||
    computedTax !== invoice.tax_rappen ||
    computedSubtotal + computedTax !== invoice.total_rappen
  ) {
    throw new Error(
      "Die Rechnungsbeträge sind inkonsistent. Bitte Rechnung neu erstellen.",
    );
  }
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const fontRoot = new URL("../_shared/fonts/", import.meta.url);
  const [
    dmBytes,
    serifBytes,
    syneBytes,
    paymentRegularBytes,
    paymentBoldBytes,
    wordmarkBytes,
  ] = await Promise.all([
    Deno.readFile(new URL("dm-sans.ttf", fontRoot)),
    Deno.readFile(new URL("instrument-serif.ttf", fontRoot)),
    Deno.readFile(new URL("syne.ttf", fontRoot)),
    Deno.readFile(new URL("liberation-sans.ttf", fontRoot)),
    Deno.readFile(new URL("liberation-sans-bold.ttf", fontRoot)),
    Deno.readFile(
      new URL("../_shared/assets/heav-wordmark-aligned.png", import.meta.url),
    ),
  ]);
  const [dm, serif, syne] = await Promise.all([
    pdf.embedFont(dmBytes, { subset: true }),
    pdf.embedFont(serifBytes, { subset: true }),
    pdf.embedFont(syneBytes, { subset: true }),
  ]);
  const [paymentRegular, paymentBold] = await Promise.all([
    pdf.embedFont(paymentRegularBytes, { subset: true }),
    pdf.embedFont(paymentBoldBytes, { subset: true }),
  ]);
  const wordmark = await pdf.embedPng(wordmarkBytes);
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
  // Exact supplied HEAV wordmark, cropped to its visible bounds with a small
  // right-side safety margin so the lime dot cannot be clipped in the PDF.
  const wordmarkWidth = 92;
  const wordmarkVisibleHeight = wordmarkWidth * (30 / 162);
  // The raster wordmark has been trimmed to its true visible bounds. Its H
  // must share the identical document margin as the visible R in RECHNUNG.
  const headerLogoX = margin;
  page.drawImage(wordmark, {
    x: headerLogoX,
    y: height - 52,
    width: wordmarkWidth,
    height: wordmarkVisibleHeight,
  });
  drawRight(
    "FILMPRODUKTION · SCHWEIZ",
    right,
    height - 43,
    6.5,
    dm,
    colors.acid,
  );
  line(height - 62, margin, right, rgb(.2, .2, .19));
  draw("RECHNUNG", margin, height - 106, 34, serif, colors.paper);

  page.drawLine({
    start: { x: 348, y: height - 132 },
    end: { x: 348, y: height - 82 },
    color: rgb(.24, .24, .22),
    thickness: .7,
  });
  draw("REFERENZNUMMER", 366, height - 88, 5.8, syne, colors.acid);
  const visibleReference = formatDocumentReference(invoice.invoice_number);
  const qrReference = formatPaymentReference(invoice.payment_reference);
  const numberSize = fittedSize(
    visibleReference,
    syne,
    13,
    right - 366,
    8,
  );
  draw(
    visibleReference,
    366,
    height - 110,
    numberSize,
    syne,
    colors.paper,
  );

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
        index === 0 ? paymentBold : paymentRegular,
      )
    );
  draw("RECHNUNGSDETAILS", 337, height - 192, 6, syne, colors.muted);
  const invoiceDetails = [
    ["Rechnungsdatum", formatDate(invoice.issue_date)],
    [
      "Fällig am",
      formatDate(invoice.due_date),
    ],
    ["Währung", "CHF"],
    ["QR-Referenz", qrReference],
  ];
  const projectTitle = compactText(invoice.project_title_snapshot, 120);
  if (projectTitle) {
    invoiceDetails.splice(2, 0, ["Projekt", projectTitle]);
  }
  if (Number(invoice.tax_rate) > 0) {
    invoiceDetails.push(["MWST-Nr.", normalizedVatNumber(settings.vat_number)]);
  }
  invoiceDetails
    .forEach(([label, value], index) => {
      draw(label, 337, height - 216 - index * 17, 7.5, dm, colors.muted);
      const detailValue = String(value);
      drawRight(
        detailValue,
        right,
        height - 216 - index * 17,
        fittedSize(detailValue, dm, 8, right - 405, 6),
        dm,
      );
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
      paymentRegular,
      8,
      250,
      6.5,
    );
    draw(
      compactText(item.description, 80),
      margin + 40,
      y - 9,
      descriptionSize,
      paymentRegular,
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
  if (Number(invoice.tax_rate) > 0) {
    draw(
      `MWST ${Number(invoice.tax_rate).toFixed(1)} %`,
      355,
      totalY - 17,
      7.5,
      dm,
      colors.muted,
    );
    drawRight(formatCHF(invoice.tax_rappen), right, totalY - 17, 8, dm);
  } else {
    draw("Nicht MWST-pflichtig", 355, totalY - 17, 7.5, dm, colors.muted);
  }
  line(totalY - 28, 355, right, colors.night, 1);
  draw("TOTAL", 355, totalY - 49, 8.5, syne);
  drawRight(formatCHF(invoice.total_rappen), right, totalY - 51, 12, syne);

  const rawCreditorAddress = splitStreet(settings.address_line1);
  const rawDebtorAddress = splitStreet(customer.address_line1);
  const creditorName = compactText(
    `${settings.company_name} · ${settings.owner_name}`,
    70,
  );
  const creditorAddress = {
    street: compactText(rawCreditorAddress.street, 70),
    houseNumber: compactText(rawCreditorAddress.houseNumber, 16),
  };
  const creditorPostalCode = compactText(settings.postal_code, 16);
  const creditorCity = compactText(settings.city, 35);
  const creditorCountry = countryCode(settings.country || "CH");
  const debtorName = compactText(customer.company || customer.contact_name, 70);
  const debtorAddress = {
    street: compactText(rawDebtorAddress.street, 70),
    houseNumber: compactText(rawDebtorAddress.houseNumber, 16),
  };
  const debtorPostalCode = compactText(customer.postal_code, 16);
  const debtorCity = compactText(customer.city, 35);
  const debtorCountry = countryCode(customer.country || "CH");
  const paymentMessage = buildInvoicePaymentMessage(invoice);
  const qrPayload = buildSwissQrPayload({
    iban: settings.iban,
    creditorName,
    creditorStreet: creditorAddress.street,
    creditorHouseNumber: creditorAddress.houseNumber,
    creditorPostalCode,
    creditorCity,
    creditorCountry,
    debtorName,
    debtorStreet: debtorAddress.street,
    debtorHouseNumber: debtorAddress.houseNumber,
    debtorPostalCode,
    debtorCity,
    debtorCountry,
    amountRappen: invoice.total_rappen,
    reference: invoice.payment_reference,
    message: paymentMessage,
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
    target.drawText("Vor der Einzahlung abzutrennen", {
      x: width - 137,
      y: sectionTop + 4,
      size: 6,
      font: paymentRegular,
      color: colors.night,
    });
    target.drawText("Vor der Einzahlung abzutrennen", {
      x: receiptWidth - 4,
      y: 8,
      size: 6,
      font: paymentRegular,
      color: colors.night,
      rotate: degrees(90),
    });
    const pdraw = (
      text: string,
      x: number,
      y: number,
      size = 6.2,
      font = paymentRegular,
    ) =>
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
      font = paymentRegular,
    ) => pdraw(text, x - font.widthOfTextAtSize(text, size), y, size, font);
    const creditorLines = [
      creditorName,
      `${creditorAddress.street} ${creditorAddress.houseNumber}`.trim(),
      `${creditorPostalCode} ${creditorCity} ${creditorCountry}`,
    ];
    const debtorLines = [
      debtorName,
      `${debtorAddress.street} ${debtorAddress.houseNumber}`.trim(),
      `${debtorPostalCode} ${debtorCity} ${debtorCountry}`,
    ];
    const receiptLineWidth = receiptWidth - 28;
    if (
      [...creditorLines, ...debtorLines].some((entry) =>
        paymentRegular.widthOfTextAtSize(entry, 8) > receiptLineWidth
      )
    ) {
      throw new Error(
        "Eine Adresse ist für den Empfangsschein zu lang. Bitte Namen oder Adresszeilen kürzen.",
      );
    }

    pdraw("Empfangsschein", 14, sectionTop - 22, 11, paymentBold);
    pdraw("Konto / Zahlbar an", 14, sectionTop - 43, 6, paymentBold);
    pdraw(
      settings.iban.replace(/(.{4})/g, "$1 ").trim(),
      14,
      sectionTop - 55,
      8,
      paymentRegular,
    );
    creditorLines.forEach((entry, index) =>
      pdraw(entry, 14, sectionTop - 66 - index * 9, 8, paymentRegular)
    );
    pdraw("Referenz", 14, sectionTop - 101, 6, paymentBold);
    pdraw(
      formatPaymentReference(invoice.payment_reference),
      14,
      sectionTop - 113,
      8,
      paymentRegular,
    );
    pdraw("Zahlbar durch", 14, sectionTop - 135, 6, paymentBold);
    debtorLines.forEach((entry, index) =>
      pdraw(entry, 14, sectionTop - 147 - index * 9, 8, paymentRegular)
    );
    pdraw("Währung", 14, 70, 6, paymentBold);
    pdraw("Betrag", 62, 70, 6, paymentBold);
    pdraw("CHF", 14, 56, 8, paymentBold);
    pdrawRight(
      (invoice.total_rappen / 100).toFixed(2),
      receiptWidth - 14,
      56,
      8,
      paymentBold,
    );
    pdraw("Annahmestelle", 95, 18, 6, paymentBold);

    const paymentX = receiptWidth + 17;
    pdraw("Zahlteil", paymentX, sectionTop - 22, 11, paymentBold);
    const qrSize = 130.39; // The QR symbol itself is exactly 46 mm.
    const quietZone = 14.17; // Separate 5 mm quiet zone on every side.
    const qrX = paymentX + quietZone;
    const qrY = 48 + quietZone;
    const qr = QRCode.create(qrPayload, { errorCorrectionLevel: "M" });
    const moduleCount = qr.modules.size;
    const moduleSize = qrSize / moduleCount;
    const offsetX = qrX;
    const offsetY = qrY;
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
    pdraw("Währung", paymentX, 31, 6, paymentBold);
    pdraw("Betrag", paymentX + 49, 31, 6, paymentBold);
    pdraw("CHF", paymentX, 17, 8, paymentBold);
    pdraw(
      (invoice.total_rappen / 100).toFixed(2),
      paymentX + 49,
      17,
      8,
      paymentBold,
    );

    const infoX = 356;
    pdraw("Konto / Zahlbar an", infoX, sectionTop - 43, 6, paymentBold);
    pdraw(
      settings.iban.replace(/(.{4})/g, "$1 ").trim(),
      infoX,
      sectionTop - 55,
      8,
      paymentRegular,
    );
    creditorLines.forEach((entry, index) =>
      pdraw(entry, infoX, sectionTop - 67 - index * 9, 8, paymentRegular)
    );
    pdraw("Referenz", infoX, sectionTop - 105, 6, paymentBold);
    pdraw(
      formatPaymentReference(invoice.payment_reference),
      infoX,
      sectionTop - 117,
      8,
      paymentRegular,
    );
    pdraw("Zusätzliche Informationen", infoX, sectionTop - 139, 6, paymentBold);
    drawWrapped(
      target,
      paymentMessage,
      infoX,
      sectionTop - 151,
      right - infoX,
      8,
      paymentRegular,
      colors.night,
      10,
      3,
    );
    pdraw("Zahlbar durch", infoX, sectionTop - 190, 6, paymentBold);
    debtorLines.forEach((entry, index) =>
      pdraw(entry, infoX, sectionTop - 202 - index * 9, 8, paymentRegular)
    );
  };

  if (invoice.invoice_items.length <= 6) renderPaymentPart(page);
  else {
    draw("Zahlteil auf der Folgeseite", margin, 29, 6.5, syne, colors.muted);
    const paymentPage = pdf.addPage([595.28, 841.89]);
    paymentPage.drawImage(wordmark, {
      x: margin,
      y: height - 62,
      width: wordmarkWidth,
      height: wordmarkWidth * (60 / 208),
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

if (import.meta.main) {
  Deno.serve(async (request) => {
    const origin = request.headers.get("origin") || "";
    const responseCors = {
      ...corsHeaders,
      "Access-Control-Allow-Origin": allowedOrigins.has(origin)
        ? origin
        : "https://heav.ch",
      Vary: "Origin",
    };
    if (request.method === "OPTIONS") {
      return new Response("ok", { headers: responseCors });
    }
    if (request.method !== "POST") {
      return Response.json({ error: "Method not allowed" }, {
        status: 405,
        headers: responseCors,
      });
    }
    if (origin && !allowedOrigins.has(origin)) {
      return Response.json({ error: "Origin not allowed" }, {
        status: 403,
        headers: responseCors,
      });
    }
    try {
      const authorization = request.headers.get("Authorization");
      if (!authorization) throw new Error("Nicht angemeldet.");
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authorization } } },
      );
      const { data: userData, error: userError } = await supabase.auth
        .getUser();
      if (userError || !userData.user) throw new Error("Sitzung ungültig.");
      const { invoiceId, action, requestKey } = await request.json();
      if (
        !invoiceId ||
        !["download", "send", "mark_paid", "cancel"].includes(action)
      ) throw new Error("Ungültige Rechnungsaktion.");
      if (
        action === "send" &&
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
          .test(String(requestKey || ""))
      ) {
        throw new Error("Ungültige Versandanforderung.");
      }
      if (["mark_paid", "cancel"].includes(action)) {
        const { error } = await supabase.rpc("record_invoice_action", {
          p_invoice_id: invoiceId,
          p_action: action === "mark_paid" ? "paid" : "cancelled",
          p_recipient: null,
          p_details: {},
        });
        if (error) throw error;
        return Response.json({ ok: true }, { headers: responseCors });
      }
      const { data: storedInvoice, error: invoiceError } = await supabase
        .from("invoices")
        .select("*, invoice_items(*)")
        .eq("id", invoiceId)
        .single();
      if (invoiceError || !storedInvoice) {
        throw invoiceError || new Error("Rechnung nicht gefunden.");
      }
      if (storedInvoice.is_legacy) {
        throw new Error(
          "Diese historische Rechnung wurde vor der unveränderlichen Archivierung erstellt und kann nicht neu als Zahlungsdokument erzeugt oder versendet werden.",
        );
      }
      if (!storedInvoice.customer_snapshot || !storedInvoice.issuer_snapshot) {
        throw new Error(
          "Die Rechnung besitzt keinen unveränderlichen Datenstand.",
        );
      }
      const settings = storedInvoice.issuer_snapshot as Settings;
      const invoice = {
        ...storedInvoice,
        customers: storedInvoice.customer_snapshot,
      } as Invoice;
      if (invoice.status === "cancelled") {
        throw new Error(
          "Stornierte Rechnungen können nicht mehr als Zahlungsdokument geöffnet oder versendet werden.",
        );
      }
      const pdfBytes = await createInvoicePdf(invoice, settings);
      if (action === "download") {
        const { error: eventError } = await supabase.rpc(
          "record_invoice_action",
          {
            p_invoice_id: invoiceId,
            p_action: "downloaded",
            p_recipient: null,
            p_details: {},
          },
        );
        if (eventError) throw eventError;
        const pdfBody = new ArrayBuffer(pdfBytes.byteLength);
        new Uint8Array(pdfBody).set(pdfBytes);
        return new Response(pdfBody, {
          headers: {
            ...responseCors,
            "Content-Type": "application/pdf",
            "Content-Disposition": `attachment; filename="${
              invoiceFilename(invoice)
            }"`,
            "Cache-Control": "no-store",
          },
        });
      }
      const resendKey = Deno.env.get("RESEND_API_KEY");
      const fromEmail = Deno.env.get("RESEND_FROM_EMAIL");
      if (!resendKey || !fromEmail) {
        throw new Error("E-Mail-Versand ist noch nicht konfiguriert.");
      }
      if (!validMailbox(fromEmail, true)) {
        throw new Error("Der konfigurierte Rechnungsabsender ist ungültig.");
      }
      if (!validMailbox(settings.email)) {
        throw new Error(
          "Die Antwortadresse des Rechnungsabsenders ist ungültig.",
        );
      }
      const customer = invoice.customers as Customer;
      if (
        !["draft", "sent", "overdue"].includes(invoice.status)
      ) throw new Error("Diese Rechnung kann nicht versendet werden.");
      if (!validMailbox(customer.email)) {
        throw new Error("Die Kunden-E-Mail ist ungültig.");
      }
      const { data: reservations, error: reservationError } = await supabase
        .rpc("reserve_invoice_send", {
          p_invoice_id: invoiceId,
          p_request_key: requestKey,
        });
      if (reservationError) throw reservationError;
      const reservation = Array.isArray(reservations)
        ? reservations[0]
        : reservations;
      if (
        !reservation?.attempt_id || !reservation?.idempotency_key
      ) throw new Error("E-Mail-Versand konnte nicht reserviert werden.");
      const idempotencyKey = safeHeader(reservation.idempotency_key).replace(
        /[^a-zA-Z0-9._-]/g,
        "-",
      );
      let emailResponse: Response;
      let emailData: { id?: string; message?: string; [key: string]: unknown };
      try {
        emailResponse = await fetch("https://api.resend.com/emails", {
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
            subject: safeHeader(
              `Rechnung ${
                formatDocumentReference(invoice.invoice_number)
              } von ${settings.company_name}`,
            ),
            text: buildInvoiceText(invoice, settings),
            html: buildInvoiceEmailHtml(invoice, settings),
            attachments: [{
              filename: invoiceFilename(invoice),
              content: base64(pdfBytes),
            }],
          }),
        });
        emailData = await responsePayload(emailResponse);
      } catch (sendError) {
        // The provider may have accepted the request even when the response was lost.
        // Keep the durable reservation pending: a retry reuses the same idempotency key
        // and cancellation/deletion remain blocked until the outcome is resolved.
        throw sendError;
      }
      if (!emailResponse.ok) {
        const { error: completionError } = await supabase.rpc(
          "complete_invoice_send",
          {
            p_attempt_id: reservation.attempt_id,
            p_success: false,
            p_recipient: customer.email,
            p_details: emailData,
          },
        );
        if (completionError) {
          console.error("send failure completion failed", completionError);
        }
        throw new Error(
          emailData.message || "E-Mail konnte nicht gesendet werden.",
        );
      }
      const { error: completionError } = await supabase.rpc(
        "complete_invoice_send",
        {
          p_attempt_id: reservation.attempt_id,
          p_success: true,
          p_recipient: customer.email,
          p_details: {
            resend_id: emailData.id,
            idempotency_key: idempotencyKey,
          },
        },
      );
      if (completionError) {
        throw completionError;
      }
      return Response.json({ ok: true, emailId: emailData.id }, {
        headers: responseCors,
      });
    } catch (error) {
      console.error(error);
      return Response.json({
        error: error instanceof Error ? error.message : "Unbekannter Fehler",
      }, { status: 400, headers: responseCors });
    }
  });
}
