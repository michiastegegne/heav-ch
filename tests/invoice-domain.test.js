import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateInvoice,
  formatCHF,
  getNextInvoiceStatus,
  statusLabel,
  validateInvoice,
} from "../admin/assets/domain.js";

test("calculateInvoice rechnet Beträge in Rappen ohne Float-Fehler", () => {
  const result = calculateInvoice(
    [
      { quantity: 1, unitPrice: 1250.5 },
      { quantity: 2.5, unitPrice: 300 },
    ],
    8.1,
  );

  assert.deepEqual(result, {
    subtotalRappen: 200050,
    taxRappen: 16204,
    totalRappen: 216254,
  });
});

test("formatCHF formatiert Schweizer Franken konsistent", () => {
  assert.equal(formatCHF(216254), "CHF 2’162.54");
  assert.equal(formatCHF(0), "CHF 0.00");
});

test("Rechnungsstatus erlaubt nur nachvollziehbare Übergänge", () => {
  assert.equal(getNextInvoiceStatus("draft", "send"), "sent");
  assert.equal(getNextInvoiceStatus("sent", "mark_paid"), "paid");
  assert.equal(getNextInvoiceStatus("paid", "send"), null);
  assert.equal(getNextInvoiceStatus("cancelled", "mark_paid"), null);
});

test("Rechnungsstatus beschreibt einen Entwurf eindeutig als nicht versendet", () => {
  assert.equal(statusLabel("draft"), "Nicht versendet");
  assert.equal(statusLabel("sent"), "Versendet");
  assert.equal(statusLabel("paid"), "Bezahlt");
});

test("validateInvoice verlangt Kunde, Positionen, Datum und Fälligkeit", () => {
  const errors = validateInvoice({
    customerId: "",
    issueDate: "2026-08-03",
    dueDate: "2026-08-01",
    items: [{ description: "", quantity: 0, unitPrice: -1 }],
  });

  assert.deepEqual(errors, {
    customerId: "Bitte einen Kunden auswählen.",
    dueDate: "Das Fälligkeitsdatum darf nicht vor dem Rechnungsdatum liegen.",
    items: "Mindestens eine vollständige Position mit positivem Betrag ist erforderlich.",
  });
});
