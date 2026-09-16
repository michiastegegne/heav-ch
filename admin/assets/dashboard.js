const REPORTING_TIME_ZONE = "Europe/Zurich";

function dateParts(date, options = {}) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: REPORTING_TIME_ZONE, ...options }).formatToParts(date);
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

function monthKey(date) {
  const parts = dateParts(date, { year: "numeric", month: "2-digit" });
  return `${parts.year}-${parts.month}`;
}

function monthDescriptor(year, monthIndex) {
  const date = new Date(Date.UTC(year, monthIndex, 15, 12));
  const shortLabel = new Intl.DateTimeFormat("de-CH", { month: "short", timeZone: REPORTING_TIME_ZONE }).format(date).replace(/\.$/, "");
  const longLabel = new Intl.DateTimeFormat("de-CH", { month: "long", year: "numeric", timeZone: REPORTING_TIME_ZONE }).format(date);
  return {
    key: monthKey(date),
    label: shortLabel.charAt(0).toUpperCase() + shortLabel.slice(1),
    longLabel: longLabel.charAt(0).toUpperCase() + longLabel.slice(1),
    netRappen: 0,
    taxRappen: 0,
    grossRappen: 0,
    invoiceCount: 0,
  };
}

function rappen(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.round(number)) : 0;
}

export function buildPaidRevenueSeries(invoices = [], now = new Date()) {
  const current = dateParts(now, { year: "numeric", month: "2-digit" });
  const currentYear = Number(current.year);
  const currentMonthIndex = Number(current.month) - 1;
  const months = Array.from({ length: 12 }, (_, index) => monthDescriptor(currentYear, currentMonthIndex - (11 - index)));
  const byKey = new Map(months.map((month) => [month.key, month]));
  const missingPaidAt = { count: 0, grossRappen: 0 };

  for (const invoice of invoices) {
    if (invoice?.status !== "paid") continue;
    const paidAt = invoice.paid_at ? new Date(invoice.paid_at) : null;
    if (!paidAt || Number.isNaN(paidAt.getTime())) {
      missingPaidAt.count += 1;
      missingPaidAt.grossRappen += rappen(invoice.total_rappen);
      continue;
    }
    const month = byKey.get(monthKey(paidAt));
    if (!month) continue;
    month.netRappen += rappen(invoice.subtotal_rappen);
    month.taxRappen += rappen(invoice.tax_rappen);
    month.grossRappen += rappen(invoice.total_rappen);
    month.invoiceCount += 1;
  }

  const totals = months.reduce((summary, month) => ({
    netRappen: summary.netRappen + month.netRappen,
    taxRappen: summary.taxRappen + month.taxRappen,
    grossRappen: summary.grossRappen + month.grossRappen,
    invoiceCount: summary.invoiceCount + month.invoiceCount,
  }), { netRappen: 0, taxRappen: 0, grossRappen: 0, invoiceCount: 0 });

  return {
    months,
    totals,
    missingPaidAt,
    maxNetRappen: Math.max(0, ...months.map((month) => month.netRappen)),
  };
}
