const toRappen = (value) => Math.round(Number(value || 0) * 100);

export function calculateInvoice(items, taxRate = 0) {
  const subtotalRappen = items.reduce(
    (sum, item) => sum + Math.round(Number(item.quantity || 0) * toRappen(item.unitPrice)),
    0,
  );
  const taxRappen = Math.round(subtotalRappen * (Number(taxRate || 0) / 100));
  return {
    subtotalRappen,
    taxRappen,
    totalRappen: subtotalRappen + taxRappen,
  };
}

export function formatCHF(rappen) {
  const amount = Math.round(Number(rappen || 0)) / 100;
  const [whole, decimals] = amount.toFixed(2).split(".");
  return `CHF ${whole.replace(/\B(?=(\d{3})+(?!\d))/g, "’")}.${decimals}`;
}

const STATUS_TRANSITIONS = {
  draft: { send: "sent", cancel: "cancelled" },
  sent: { send: "sent", mark_paid: "paid", cancel: "cancelled" },
  overdue: { send: "overdue", mark_paid: "paid", cancel: "cancelled" },
  paid: {},
  cancelled: {},
};

export function getNextInvoiceStatus(currentStatus, action) {
  return STATUS_TRANSITIONS[currentStatus]?.[action] ?? null;
}

export function validateInvoice(invoice) {
  const errors = {};
  if (!invoice.customerId) {
    errors.customerId = "Bitte einen Kunden auswählen.";
  }
  if (!invoice.issueDate) {
    errors.issueDate = "Bitte ein Rechnungsdatum angeben.";
  }
  if (!invoice.dueDate) {
    errors.dueDate = "Bitte ein Fälligkeitsdatum angeben.";
  } else if (invoice.issueDate && invoice.dueDate < invoice.issueDate) {
    errors.dueDate = "Das Fälligkeitsdatum darf nicht vor dem Rechnungsdatum liegen.";
  }
  const completeItem = invoice.items?.some(
    (item) =>
      String(item.description || "").trim() &&
      Number(item.quantity) > 0 &&
      Number(item.unitPrice) >= 0,
  );
  if (!completeItem) {
    errors.items = "Mindestens eine vollständige Position mit positivem Betrag ist erforderlich.";
  }
  return errors;
}
