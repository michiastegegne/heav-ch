import { assert, assertEquals, assertGreater } from "jsr:@std/assert@1";
import { PDFDocument } from "npm:pdf-lib@1.17.1";
import {
  buildInvoicePaymentMessage,
  buildInvoiceText,
  buildSwissQrPayload,
  createInvoicePdf,
  formatDiscountPercent,
  formatDocumentReference,
  formatPaymentReference,
  invoiceFilename,
  shouldRenderPaymentPartOnFirstPage,
  shouldRenderPaymentPartTearOffGuide,
  shouldRenderPostDiscountSubtotal,
  validVatNumber,
} from "./index.ts";

Deno.test("Zahlungsreferenzen bleiben in ISO-11649-Vierergruppen lesbar", () => {
  assertEquals(formatPaymentReference("RF43HEAV2026002"), "RF43 HEAV 2026 002");
  assertEquals(
    formatPaymentReference("RF24HEAV2026000002"),
    "RF24 HEAV 2026 0000 02",
  );
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
    "HEAV - Michias Tegegne",
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
    "Zuerich",
    "CH",
  ]);
  assertEquals(lines[27], "SCOR");
  assertEquals(lines[28], "RF43HEAV2026002");
  assertEquals(lines[29], "HEAV-2026-002 - Shortform Content Produktion");
  assertEquals(lines[30], "EPD");
  const blkbAllowed = /^[A-Za-z0-9 ?!%_.,:/*"&;()'+-]$/;
  assert(
    [...payload].filter((character) => character !== "\n").every((
      character,
    ) => blkbAllowed.test(character)),
  );
});

Deno.test("buildSwissQrPayload lehnt ungültige IBANs und Beträge ab", () => {
  for (
    const patch of [
      { iban: "CH00 0000 0000 0000 0000 0" },
      { iban: "CH44 3199 9123 0008 8901 2" },
      { amountRappen: 0 },
      { creditorCountry: "Österreichisch" },
    ]
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

Deno.test("E-Mail-Text nennt das Projekt und bleibt gegen Header-Injection geschützt", () => {
  const invoice = {
    invoice_number: "HEAV-2026-009",
    project_title_snapshot: "Post Production des Yousty Videos",
    customers: { contact_name: "Yoyo\r\nBcc: fremd@example.com" },
  };
  const settings = { owner_name: "Michias Tegegne", company_name: "HEAV" };
  const text = buildInvoiceText(invoice as never, settings as never);
  assert(text.includes("Hello Yoyo Bcc: fremd@example.com"));
  assert(text.includes("invoice for “Post Production des Yousty Videos”"));
  assert(
    text.includes("Thank you for the opportunity and the great collaboration."),
  );
  assert(
    text.includes(
      "If you have any questions, please feel free to get in touch.",
    ),
  );
  assert(!text.includes("Swiss-QR"));
  assert(!text.includes("\r"));
});

Deno.test("E-Mail-Text bleibt ohne Projekt klar und professionell", () => {
  const invoice = { customers: { contact_name: "Yoyo" } };
  const text = buildInvoiceText(
    invoice as never,
    { owner_name: "Michias Tegegne", company_name: "HEAV" } as never,
  );
  assert(text.includes("Please find the invoice attached as a PDF."));
});

Deno.test("Rechnungsversand nutzt nur Klartext und PDF ohne HTML-Trackingfläche", async () => {
  const source = await Deno.readTextFile(
    new URL("./index.ts", import.meta.url),
  );
  const resendPayload = source.match(
    /body: JSON\.stringify\(\{[\s\S]*?attachments: \[\{[\s\S]*?\}\],[\s\S]*?\}\),/,
  )?.[0] ?? "";
  assert(resendPayload.includes("text: buildInvoiceText(invoice, settings)"));
  assert(!resendPayload.includes("html:"));
  assert(!resendPayload.includes("buildInvoiceEmailHtml"));
});

Deno.test("Rabattprozente werden aus Rabattbetrag und Zwischentotal klar formatiert", () => {
  assertEquals(formatDiscountPercent(-6190, 41250), "15 %");
  assertEquals(formatDiscountPercent(-5000, 0), "Rabatt");
});

Deno.test("Jede Rabattzeile erhält ein Zwischentotal nach dem Rabatt", () => {
  assert(shouldRenderPostDiscountSubtotal(-6190));
  assert(shouldRenderPostDiscountSubtotal(-1));
  assert(!shouldRenderPostDiscountSubtotal(0));
  assert(!shouldRenderPostDiscountSubtotal(100));
});

Deno.test("Zwischentotal nach Rabatt wird als klare fette Ergebniszeile gesetzt", async () => {
  const source = await Deno.readTextFile(
    new URL("./index.ts", import.meta.url),
  );
  const block = source.match(
    /"ZWISCHENTOTAL NACH RABATT"[\s\S]{0,450}?y -= rowHeight/,
  )?.[0] ?? "";
  assertEquals(block.match(/paymentBold/g)?.length, 2);
  assert(block.includes("colors.night"));
});

Deno.test("Zahlteil bleibt bei bis zu fünf sichtbaren Rechnungszeilen auf der ersten Seite", () => {
  assert(shouldRenderPaymentPartOnFirstPage(4));
  assert(shouldRenderPaymentPartOnFirstPage(5));
  assert(!shouldRenderPaymentPartOnFirstPage(6));
});

Deno.test("Der moderne Zahlteil zeigt keine Abrissanleitung", () => {
  assert(!shouldRenderPaymentPartTearOffGuide());
});

Deno.test("PDF-Dateiname verwendet zuerst den Projekt-Titel und sonst den Kunden", () => {
  const base = {
    invoice_number: "HEAV-2026-009",
    customers: { company: "Kunde & Partner AG", contact_name: "" },
  };
  assertEquals(
    invoiceFilename(
      { ...base, project_title_snapshot: "Launchfilm Herbst 2026" } as never,
    ),
    "HEAV-Rechnung-Launchfilm-Herbst-2026-00009.pdf",
  );
  assertEquals(
    invoiceFilename(base as never),
    "HEAV-Rechnung-Kunde-Partner-AG-00009.pdf",
  );
});

Deno.test("createInvoicePdf erzeugt eine valide einseitige HEAV-Rechnung", async () => {
  const bytes = await createInvoicePdf({
    id: "invoice-test",
    owner_id: "owner-test",
    invoice_number: "HEAV-2026-TEST",
    payment_reference: "RF43HEAV2026002",
    project_title_snapshot: "Launchfilm – HEAV Studio",
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
        description: "Konzeption – Yousty",
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

Deno.test("QR-Zusatzinformation bleibt bei freien Positionszeichen kontrolliert", () => {
  const message = buildInvoicePaymentMessage({
    invoice_number: "HEAV-2026-1267",
    invoice_items: [{
      description: "Postproduktion – Yousty 🎬",
      quantity: 1,
      unit_price_rappen: 150000,
      position: 1,
    }],
  });

  assertEquals(message, "HEAV 01267");
  const payload = buildSwissQrPayload({
    iban: "CH9300762011623852957",
    creditorName: "HEAV",
    creditorStreet: "Musterstrasse",
    creditorPostalCode: "8000",
    creditorCity: "Zürich",
    amountRappen: 150000,
    reference: "RF18539007547034",
    message,
  });
  assert(payload.includes("\nHEAV 01267\nEPD\n"));
});
