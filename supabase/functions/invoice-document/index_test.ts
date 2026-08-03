import { assert, assertEquals, assertGreater } from "jsr:@std/assert@1";
import { PDFDocument } from "npm:pdf-lib@1.17.1";
import { createInvoicePdf, escapeHtml } from "./index.ts";

Deno.test("escapeHtml neutralisiert Kundendaten im E-Mail-HTML", () => {
  assertEquals(
    escapeHtml(`<img src=x onerror="alert('x')"> & Firma`),
    "&lt;img src=x onerror=&quot;alert(&#39;x&#39;)&quot;&gt; &amp; Firma",
  );
});

Deno.test("createInvoicePdf erzeugt eine valide einseitige HEAV-Rechnung", async () => {
  const bytes = await createInvoicePdf({
    id: "invoice-test",
    owner_id: "owner-test",
    invoice_number: "HEAV-2026-TEST",
    issue_date: "2026-08-03",
    due_date: "2026-09-02",
    status: "draft",
    tax_rate: 8.1,
    subtotal_rappen: 150000,
    tax_rappen: 12150,
    total_rappen: 162150,
    notes: "",
    customers: {
      company: "Testkunde AG",
      contact_name: "Mira Muster",
      email: "mira@example.com",
      address_line1: "Testweg 1",
      postal_code: "4000",
      city: "Basel",
      country: "Schweiz",
    },
    invoice_items: [
      { position: 1, description: "Konzeption", quantity: 1, unit_price_rappen: 100000 },
      { position: 2, description: "Postproduktion", quantity: 2, unit_price_rappen: 25000 },
    ],
  }, {
    company_name: "HEAV",
    owner_name: "Michias Tegegne",
    email: "hello@heav.ch",
    phone: "",
    address_line1: "Teststrasse 2",
    postal_code: "4051",
    city: "Basel",
    country: "Schweiz",
    iban: "CH00 0000 0000 0000 0000 0",
    vat_number: "CHE-000.000.000 MWST",
  });

  assertGreater(bytes.length, 10000);
  assertEquals(new TextDecoder().decode(bytes.slice(0, 5)), "%PDF-");
  const pdf = await PDFDocument.load(bytes);
  assertEquals(pdf.getPageCount(), 1);
  assertEquals(pdf.getTitle(), "HEAV-2026-TEST – HEAV");
  assert(pdf.getAuthor()?.includes("Michias Tegegne"));
  await Deno.writeFile("/tmp/heav-edge-invoice-test.pdf", bytes);
});
