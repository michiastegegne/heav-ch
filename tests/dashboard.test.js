import test from "node:test";
import assert from "node:assert/strict";
import { buildPaidRevenueSeries } from "../admin/assets/dashboard.js";

test("Dashboard gruppiert bezahlten Nettoumsatz nach paid_at über zwölf Kalendermonate", () => {
  const invoices = [
    { status: "paid", paid_at: "2025-10-01T00:15:00Z", subtotal_rappen: 10000, tax_rappen: 810, total_rappen: 10810 },
    { status: "paid", paid_at: "2026-08-14T08:00:00Z", subtotal_rappen: 20000, tax_rappen: 0, total_rappen: 20000 },
    { status: "paid", paid_at: "2026-09-15T18:30:00Z", subtotal_rappen: 5000, tax_rappen: 405, total_rappen: 5405 },
    { status: "paid", paid_at: null, subtotal_rappen: 3000, tax_rappen: 0, total_rappen: 3000 },
    { status: "sent", paid_at: "2026-09-10T10:00:00Z", subtotal_rappen: 99999, tax_rappen: 0, total_rappen: 99999 },
    { status: "paid", paid_at: "2025-09-10T10:00:00Z", subtotal_rappen: 7777, tax_rappen: 0, total_rappen: 7777 },
  ];

  const result = buildPaidRevenueSeries(invoices, new Date("2026-09-16T12:00:00Z"));

  assert.equal(result.months.length, 12);
  assert.deepEqual(result.months.map((month) => month.key), [
    "2025-10", "2025-11", "2025-12", "2026-01", "2026-02", "2026-03",
    "2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09",
  ]);
  assert.deepEqual(result.months.find((month) => month.key === "2025-11"), {
    key: "2025-11", label: "Nov", longLabel: "November 2025", netRappen: 0, taxRappen: 0, grossRappen: 0, invoiceCount: 0,
  });
  assert.equal(result.months.find((month) => month.key === "2026-08").netRappen, 20000);
  assert.deepEqual(result.totals, { netRappen: 35000, taxRappen: 1215, grossRappen: 36215, invoiceCount: 3 });
  assert.deepEqual(result.missingPaidAt, { count: 1, grossRappen: 3000 });
});

test("Dashboard skaliert Nullmonate sicher und ignoriert ungültige Zahlungsdaten", () => {
  const result = buildPaidRevenueSeries([
    { status: "paid", paid_at: "kein-datum", subtotal_rappen: 12000, tax_rappen: 0, total_rappen: 12000 },
  ], new Date("2026-09-16T12:00:00Z"));

  assert.equal(result.maxNetRappen, 0);
  assert.equal(result.months.every((month) => month.netRappen === 0), true);
  assert.deepEqual(result.missingPaidAt, { count: 1, grossRappen: 12000 });
});
