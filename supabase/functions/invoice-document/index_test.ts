import { assert, assertEquals, assertGreater } from "jsr:@std/assert@1";
import { PDFDocument } from "npm:pdf-lib@1.17.1";
import {
  buildInvoiceEmail,
  buildInvoiceText,
  buildSwissQrPayload,
  createInvoicePdf,
  escapeHtml,
  formatPaymentReference,
  validVatNumber,
} from "./index.ts";

Deno.test("escapeHtml neutralisiert Kundendaten im E-Mail-HTML", () => {
  assertEquals(
    escapeHtml(`<img src=x onerror="alert('x')"> & Firma`),
    "&lt;img src=x onerror=&quot;alert(&#39;x&#39;)&quot;&gt; &amp; Firma",
  );
});

Deno.test("Zahlungsreferenzen bleiben in ISO-11649-Vierergruppen lesbar", () => {
  assertEquals(formatPaymentReference("RF43HEAV2026002"), "RF43 HEAV 2026 002");
  assertEquals(formatPaymentReference("RF24HEAV2026000002"), "RF24 HEAV 2026 0000 02");
});

Deno.test("MWST-Nummern werden streng validiert und normalisiert", () => {
  assert(validVatNumber("CHE-123.456.789 MWST"));
  assert(validVatNumber("che-123.456.789 tva"));
  assert(!validVatNumber("x"));
  assert(!validVatNumber("CHE123456789"));
});

Deno.test("buildSwissQrPayload erzeugt einen vollständigen Swiss-QR-Payload", () => {
  const payload = buildSwissQrPayload({
    iban: "CH82 0076 9420 6757 9200 2",
    creditorName: "HEAV · Michias Tegegne",
    creditorStreet: "Oskar-Bider-Strass",
    creditorHouseNumber: "25",
    creditorPostalCode: "4410",
    creditorCity: "Liestal",
    debtorName: "Wizdomblend",
    debtorStreet: "Musterweg",
    debtorHouseNumber: "8",
    debtorPostalCode: "8000",
    debtorCity: "Zürich",
    amountRappen: 135882,
    reference: "RF43HEAV2026002",
    message: "HEAV-2026-002 · Shortform Content Produktion",
  });
  const lines = payload.split("\n");
  assertEquals(lines.length, 34);
  assertEquals(lines.slice(0, 4), [
    "SPC",
    "0200",
    "1",
    "CH8200769420675792002",
  ]);
  assertEquals(lines.slice(4, 11), [
    "S",
    "HEAV · Michias Tegegne",
    "Oskar-Bider-Strass",
    "25",
    "4410",
    "Liestal",
    "CH",
  ]);
  assertEquals(lines[18], "1358.82");
  assertEquals(lines[19], "CHF");
  assertEquals(lines.slice(20, 27), [
    "S",
    "Wizdomblend",
    "Musterweg",
    "8",
    "8000",
    "Zürich",
    "CH",
  ]);
  assertEquals(lines[27], "SCOR");
  assertEquals(lines[28], "RF43HEAV2026002");
  assertEquals(lines[29], "HEAV-2026-002 · Shortform Content Produktion");
  assertEquals(lines[30], "EPD");
});

Deno.test("buildSwissQrPayload lehnt ungültige IBANs und Beträge ab", () => {
  for (
    const patch of [{ iban: "CH00 0000 0000 0000 0000 0" }, { iban: "CH44 3199 9123 0008 8901 2" }, { amountRappen: 0 }, { creditorCountry: "Österreichisch" }, { creditorName: "HEAV 😀" }, { message: "Test\u0001" }]
  ) {
    let failed = false;
    try {
      buildSwissQrPayload({
        iban: "CH82 0076 9420 6757 9200 2",
        creditorName: "HEAV",
        creditorStreet: "Oskar-Bider-Strass",
        creditorHouseNumber: "25",
        creditorPostalCode: "4410",
        creditorCity: "Liestal",
        amountRappen: 100,
        reference: "RF43HEAV2026002",
        message: "Test",
        ...patch,
      });
    } catch {
      failed = true;
    }
    assert(failed);
  }
});

Deno.test("Rechnungs-E-Mail zeigt Positionen, HEAV-Kontaktdaten und bleibt XSS-sicher", () => {
  const invoice = {
    id: "invoice-email-test",
    owner_id: "owner-test",
    invoice_number: "HEAV-2026-009",
    payment_reference: "RF43HEAV2026002",
    issue_date: "2026-08-10",
    due_date: "2026-09-09",
    status: "draft",
    tax_rate: 0,
    subtotal_rappen: 108100,
    tax_rappen: 0,
    total_rappen: 108100,
    notes: "",
    customers: {
      company: "Test & Partner AG",
      contact_name: `<script>alert("x")</script>`,
      email: "rechnung@example.com",
      address_line1: "Testweg 1",
      postal_code: "4000",
      city: "Basel",
      country: "CH",
    },
    invoice_items: [{ description: "Filmproduktion & Schnitt", quantity: 1, unit_price_rappen: 108100, position: 1 }],
  };
  const settings = {
    company_name: "HEAV",
    owner_name: "Michias Tegegne",
    email: "hello@heav.ch",
    phone: "+41 79 000 00 00",
    address_line1: "Teststrasse 2",
    postal_code: "4051",
    city: "Basel",
    country: "CH",
    iban: "CH82 0076 9420 6757 9200 2",
    vat_number: "",
    website_url: "https://heav.ch",
    instagram_url: "https://instagram.com/heav",
  };
  const html = buildInvoiceEmail(invoice, settings);
  assert(html.includes("RECHNUNG"));
  assert(!html.includes("LEISTUNGEN&nbsp;&nbsp;&nbsp;"));
  assert(!html.includes("Filmproduktion · Content · Postproduktion"));
  assert(html.includes("EINZELPREIS"));
  assert(html.includes("RF43 HEAV 2026 002"));
  assert(html.includes("Filmproduktion &amp; Schnitt"));
  assert(html.includes("Nicht MWST-pflichtig"));
  assert(html.includes("CHF 1’081.00"));
  assert(html.includes("Instagram"));
  assert(!html.includes("<script>"));
  assert(html.includes("&lt;script&gt;"));
  const text = buildInvoiceText({ ...invoice, customers: { ...invoice.customers, contact_name: "Mira\r\nBcc: fremd@example.com" } }, settings);
  assert(text.includes("RF43 HEAV 2026 002"));
  assert(text.includes("Filmproduktion & Schnitt"));
  assert(!text.includes("\r"));
});

Deno.test("createInvoicePdf erzeugt eine valide einseitige HEAV-Rechnung", async () => {
  const bytes = await createInvoicePdf({
    id: "invoice-test",
    owner_id: "owner-test",
    invoice_number: "HEAV-2026-TEST",
    payment_reference: "RF43HEAV2026002",
    issue_date: "2026-08-03",
    due_date: "2026-09-02",
    status: "draft",
    tax_rate: 0,
    subtotal_rappen: 150000,
    tax_rappen: 0,
    total_rappen: 150000,
    notes: "",
    customers: {
      company: "Testkunde ĀČŐ AG",
      contact_name: "Mira Černý",
      email: "mira@example.com",
      address_line1: "Testweg 1",
      postal_code: "4000",
      city: "Basel",
      country: "Schweiz",
    },
    invoice_items: [
      {
        position: 1,
        description: "Konzeption ĀČŐ",
        quantity: 1,
        unit_price_rappen: 100000,
      },
      {
        position: 2,
        description: "Postproduktion",
        quantity: 2,
        unit_price_rappen: 25000,
      },
    ],
  }, {
    company_name: "HEAV ĀČŐ",
    owner_name: "Michias Tegegne",
    email: "hello@heav.ch",
    phone: "",
    address_line1: "Teststrasse 2",
    postal_code: "4051",
    city: "Basel",
    country: "Schweiz",
    iban: "CH36 0000 0000 0000 0000 0",
    vat_number: "",
  });

  assertGreater(bytes.length, 10000);
  assertEquals(new TextDecoder().decode(bytes.slice(0, 5)), "%PDF-");
  const pdf = await PDFDocument.load(bytes);
  assertEquals(pdf.getPageCount(), 1);
  assertEquals(pdf.getTitle(), "HEAV-2026-TEST – HEAV");
  assert(pdf.getAuthor()?.includes("Michias Tegegne"));
  assertEquals(pdf.getSubject(), "Rechnung mit Swiss QR-Zahlteil");
  await Deno.writeFile("/tmp/heav-edge-invoice-test.pdf", bytes);
});
