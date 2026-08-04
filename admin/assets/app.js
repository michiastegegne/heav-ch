import { HEAV_ADMIN_CONFIG, isBackendConfigured } from "/admin/config.js";
import { calculateInvoice, formatCHF, validateInvoice } from "/admin/assets/domain.js";

const shell = document.querySelector("#admin-shell");
const loading = document.querySelector("#loading-screen");
const content = document.querySelector("#app-content");
const title = document.querySelector("#view-title");
const dialog = document.querySelector("#editor-dialog");
const dialogForm = document.querySelector("#editor-form");
const dialogBody = document.querySelector("#dialog-body");
const dialogTitle = document.querySelector("#dialog-title");
const dialogKicker = document.querySelector("#dialog-kicker");
const formError = document.querySelector("#form-error");
const toast = document.querySelector("#toast");

const viewNames = {
  dashboard: "Übersicht",
  customers: "Kunden",
  projects: "Projekte",
  invoices: "Rechnungen",
  settings: "Einstellungen",
};
const state = { view: "dashboard", query: "", filter: "all", data: null, supabase: null };
const esc = (value = "") => String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
const formatDate = (value) => value ? new Intl.DateTimeFormat("de-CH").format(new Date(`${value}T12:00:00`)) : "–";
const today = () => new Date().toISOString().slice(0, 10);
const plusDays = (date, days) => { const result = new Date(`${date}T12:00:00`); result.setDate(result.getDate() + days); return result.toISOString().slice(0, 10); };


function showToast(message, tone = "default") {
  toast.textContent = message;
  toast.style.borderLeft = `4px solid ${tone === "error" ? "#ff5b35" : "#d7ff38"}`;
  toast.hidden = false;
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => { toast.hidden = true; }, 4200);
}

function joinedData(data) {
  const customers = new Map(data.customers.map((item) => [item.id, item]));
  return {
    ...data,
    projects: data.projects.map((item) => ({ ...item, customer: customers.get(item.customer_id) })),
    invoices: data.invoices.map((item) => ({ ...item, customer: customers.get(item.customer_id) })),
  };
}


function createSupabaseAdapter(supabase, session) {
  const ownerId = session.user.id;
  const fail = (error) => { if (error) throw error; };
  return {
    async loadAll() {
      const [customers, projects, invoices, settings] = await Promise.all([
        supabase.from("customers").select("*").order("company"),
        supabase.from("projects").select("*").order("created_at", { ascending: false }),
        supabase.from("invoices").select("*, invoice_items(*)").order("issue_date", { ascending: false }),
        supabase.from("company_settings").select("*").maybeSingle(),
      ]);
      [customers, projects, invoices, settings].forEach((result) => fail(result.error));
      const normalizedInvoices = invoices.data.map((invoice) => ({ ...invoice, items: invoice.invoice_items || [] }));
      return joinedData({ customers: customers.data, projects: projects.data, invoices: normalizedInvoices, settings: settings.data || {} });
    },
    async saveCustomer(payload) { const result = await supabase.from("customers").insert({ ...payload, owner_id: ownerId }); fail(result.error); },
    async saveProject(payload) { const result = await supabase.from("projects").insert({ ...payload, owner_id: ownerId }); fail(result.error); },
    async saveInvoice(payload) {
      const items = payload.items;
      const result = await supabase.rpc("create_invoice", {
        p_customer_id: payload.customer_id,
        p_project_id: payload.project_id,
        p_invoice_number: payload.invoice_number,
        p_issue_date: payload.issue_date,
        p_due_date: payload.due_date,
        p_tax_rate: payload.tax_rate,
        p_notes: payload.notes,
        p_items: items,
      });
      fail(result.error);
    },
    async saveSettings(payload) { const result = await supabase.from("company_settings").upsert({ ...payload, owner_id: ownerId }, { onConflict: "owner_id" }); fail(result.error); },
    async invoiceAction(id, action) {
      const { data: sessionData } = await supabase.auth.getSession();
      const response = await fetch(`${HEAV_ADMIN_CONFIG.supabaseUrl}/functions/v1/invoice-document`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${sessionData.session.access_token}`, apikey: HEAV_ADMIN_CONFIG.supabaseAnonKey },
        body: JSON.stringify({ invoiceId: id, action }),
      });
      if (!response.ok) { const error = await response.json().catch(() => ({})); throw new Error(error.error || "Rechnungsaktion fehlgeschlagen"); }
      return action === "download" ? response.blob() : response.json();
    },
    async logout() { await supabase.auth.signOut(); },
  };
}

let adapter;

function metric(label, value) { return `<article class="metric"><span>${esc(label)}</span><strong>${esc(value)}</strong></article>`; }
function statusLabel(status) { return ({ draft: "Entwurf", sent: "Versendet", paid: "Bezahlt", overdue: "Überfällig", cancelled: "Storniert", planning: "Planung", active: "Aktiv", completed: "Abgeschlossen", on_hold: "Pausiert" })[status] || status; }
function emptyState(titleText, copy, type) { return `<section class="empty-state"><h3>${esc(titleText)}</h3><p>${esc(copy)}</p><button class="primary-action" data-create="${type}">Jetzt erfassen <span>+</span></button></section>`; }

function renderDashboard() {
  const { customers, projects, invoices } = state.data;
  const openInvoices = invoices.filter((item) => ["sent", "overdue"].includes(item.status));
  const openTotal = openInvoices.reduce((sum, item) => sum + item.total_rappen, 0);
  const paidThisYear = invoices.filter((item) => item.status === "paid" && item.issue_date?.startsWith(String(new Date().getFullYear()))).reduce((sum, item) => sum + item.total_rappen, 0);
  const recent = [...invoices].slice(0, 5);
  return `<section class="view">
    <div class="hero-row"><h2>Good work.<br><em>Clear numbers.</em></h2><p>Dein kompakter Überblick über Kunden, laufende Produktionen und offene Rechnungen.</p></div>
    <div class="metric-grid">${metric("Kunden", customers.length)}${metric("Aktive Projekte", projects.filter((item) => ["planning", "active"].includes(item.status)).length)}${metric("Offene Rechnungen", formatCHF(openTotal))}${metric("Bezahlt dieses Jahr", formatCHF(paidThisYear))}</div>
    <div class="content-grid"><section class="panel"><div class="panel-head"><h3>LETZTE RECHNUNGEN</h3><button class="text-button" data-view="invoices">Alle ansehen</button></div><div class="activity-list">${recent.length ? recent.map((invoice) => `<article class="activity-row"><div><strong>${esc(invoice.invoice_number)}</strong><span>${esc(invoice.customer?.company || "Ohne Kunde")} · ${formatDate(invoice.issue_date)}</span></div><div><strong>${formatCHF(invoice.total_rappen)}</strong><span class="status ${esc(invoice.status)}">${esc(statusLabel(invoice.status))}</span></div></article>`).join("") : `<p>Noch keine Rechnungen.</p>`}</div></section>
    <aside class="panel"><div class="panel-head"><h3>SCHNELLSTART</h3></div><div class="quick-list"><article class="quick-row"><button data-create="customer"><strong>Kunden erfassen</strong><span>Kontaktdaten zentral speichern</span></button><b>+</b></article><article class="quick-row"><button data-create="project"><strong>Projekt anlegen</strong><span>Produktion und Budget ordnen</span></button><b>+</b></article><article class="quick-row"><button data-create="invoice"><strong>Rechnung erstellen</strong><span>PDF generieren und versenden</span></button><b>+</b></article></div></aside></div>
  </section>`;
}

function filtered(items, fields) { const query = state.query.trim().toLowerCase(); return items.filter((item) => !query || fields.some((field) => String(item[field] || "").toLowerCase().includes(query))); }
function toolbar(type, placeholder, filters = []) { return `<div class="toolbar"><label class="search-field"><span class="sr-only">Suchen</span><input type="search" data-search placeholder="${esc(placeholder)}" value="${esc(state.query)}"></label>${filters.length ? `<div class="filter-tabs">${filters.map(([value,label]) => `<button class="filter-tab ${state.filter === value ? "is-active" : ""}" data-filter="${value}">${label}</button>`).join("")}</div>` : ""}<button class="primary-action" data-create="${type}">Neu <span>+</span></button></div>`; }

function renderCustomers() {
  const items = filtered(state.data.customers, ["company", "contact_name", "email", "city"]);
  if (!state.data.customers.length) return `<section class="view">${emptyState("Der erste Kontakt.", "Erfasse deinen ersten Kunden und verknüpfe danach Projekte und Rechnungen.", "customer")}</section>`;
  const rows = items.map((item) => `<tr><td><strong>${esc(item.company)}</strong><small>${esc(item.contact_name)}</small></td><td>${esc(item.email)}</td><td>${esc(item.phone || "–")}</td><td>${esc([item.postal_code,item.city].filter(Boolean).join(" "))}</td></tr>`).join("");
  const cards = items.map((item) => `<article class="mobile-card"><div><strong>${esc(item.company)}</strong><small>${esc(item.contact_name)} · ${esc(item.email)}</small></div><span>${esc(item.city || "")}</span></article>`).join("");
  return `<section class="view">${toolbar("customer", "Kunden durchsuchen …")}<table class="data-table"><thead><tr><th>Kunde</th><th>E-Mail</th><th>Telefon</th><th>Ort</th></tr></thead><tbody>${rows}</tbody></table><div class="mobile-card-list">${cards}</div></section>`;
}

function renderProjects() {
  const all = state.data.projects;
  const items = filtered(all.filter((item) => state.filter === "all" || item.status === state.filter), ["title", "description"]);
  if (!all.length) return `<section class="view">${emptyState("From idea to frame.", "Lege das erste Projekt an und halte Status, Kunde und Budget im Blick.", "project")}</section>`;
  const rows = items.map((item) => `<tr><td><strong>${esc(item.title)}</strong><small>${esc(item.customer?.company || "Ohne Kunde")}</small></td><td><span class="status ${esc(item.status)}">${esc(statusLabel(item.status))}</span></td><td>${formatDate(item.due_date)}</td><td>${formatCHF(item.budget_rappen || 0)}</td></tr>`).join("");
  const cards = items.map((item) => `<article class="mobile-card"><div><strong>${esc(item.title)}</strong><small>${esc(item.customer?.company || "Ohne Kunde")} · ${formatDate(item.due_date)}</small></div><span class="status ${esc(item.status)}">${esc(statusLabel(item.status))}</span></article>`).join("");
  return `<section class="view">${toolbar("project", "Projekte durchsuchen …", [["all","Alle"],["planning","Planung"],["active","Aktiv"],["completed","Abgeschlossen"]])}<table class="data-table"><thead><tr><th>Projekt</th><th>Status</th><th>Deadline</th><th>Budget</th></tr></thead><tbody>${rows}</tbody></table><div class="mobile-card-list">${cards}</div></section>`;
}

function invoiceActions(invoice) {
  return `<div class="table-actions"><button class="text-button" data-invoice-action="download" data-id="${esc(invoice.id)}">PDF</button>${["draft","sent","overdue"].includes(invoice.status) ? `<button class="text-button" data-invoice-action="send" data-id="${esc(invoice.id)}">Senden</button>` : ""}${["sent","overdue"].includes(invoice.status) ? `<button class="text-button" data-invoice-action="mark_paid" data-id="${esc(invoice.id)}">Bezahlt</button>` : ""}</div>`;
}
function renderInvoices() {
  const all = state.data.invoices;
  const items = filtered(all.filter((item) => state.filter === "all" || item.status === state.filter), ["invoice_number"]);
  if (!all.length) return `<section class="view">${emptyState("Ready to invoice.", "Erstelle deine erste HEAV-Rechnung als PDF und sende sie direkt an den Kunden.", "invoice")}</section>`;
  const rows = items.map((item) => `<tr><td><strong>${esc(item.invoice_number)}</strong><small>${formatDate(item.issue_date)}</small></td><td>${esc(item.customer?.company || "Ohne Kunde")}</td><td><span class="status ${esc(item.status)}">${esc(statusLabel(item.status))}</span></td><td><strong>${formatCHF(item.total_rappen)}</strong><small>fällig ${formatDate(item.due_date)}</small></td><td>${invoiceActions(item)}</td></tr>`).join("");
  const cards = items.map((item) => `<article class="mobile-card"><div><strong>${esc(item.invoice_number)} · ${formatCHF(item.total_rappen)}</strong><small>${esc(item.customer?.company || "Ohne Kunde")} · fällig ${formatDate(item.due_date)}</small>${invoiceActions(item)}</div><span class="status ${esc(item.status)}">${esc(statusLabel(item.status))}</span></article>`).join("");
  return `<section class="view">${toolbar("invoice", "Rechnungen durchsuchen …", [["all","Alle"],["draft","Entwürfe"],["sent","Versendet"],["paid","Bezahlt"],["overdue","Überfällig"]])}<table class="data-table"><thead><tr><th>Rechnung</th><th>Kunde</th><th>Status</th><th>Total</th><th>Aktionen</th></tr></thead><tbody>${rows}</tbody></table><div class="mobile-card-list">${cards}</div></section>`;
}

function renderSettings() {
  const settings = state.data.settings || {};
  return `<section class="view"><div class="hero-row"><h2>Business,<br><em>set clearly.</em></h2><p>Diese Angaben erscheinen auf deinen Rechnungen. Ergänze vor dem ersten Versand insbesondere Adresse, IBAN und MWST-Status.</p></div><div class="settings-grid"><article class="settings-card"><h3>Rechnungsabsender</h3><p>Rechtliche und finanzielle Angaben für alle PDF-Rechnungen.</p><div class="settings-list"><div><span>Firma</span><strong>${esc(settings.company_name || "HEAV")}</strong></div><div><span>Inhaber</span><strong>${esc(settings.owner_name || "Michias Tegegne")}</strong></div><div><span>E-Mail</span><strong>${esc(settings.email || "hello@heav.ch")}</strong></div><div><span>IBAN</span><strong>${esc(settings.iban || "Noch offen")}</strong></div></div><button class="primary-action" data-create="settings" style="margin-top:24px">Angaben bearbeiten</button></article><article class="settings-card"><h3>Systemstatus</h3><p>Der Adminbereich nutzt einen getrennten, geschützten Backend-Zugang.</p><div class="settings-list"><div><span>Modus</span><strong>Produktion</strong></div><div><span>Datenbank</span><strong>Supabase RLS</strong></div><div><span>Rechnungsversand</span><strong>Resend API</strong></div><div><span>Website</span><strong>heav.ch</strong></div></div></article></div></section>`;
}

const renderers = { dashboard: renderDashboard, customers: renderCustomers, projects: renderProjects, invoices: renderInvoices, settings: renderSettings };
function render() { title.textContent = viewNames[state.view]; content.innerHTML = renderers[state.view](); content.focus({ preventScroll: true }); }
async function refresh() { state.data = await adapter.loadAll(); render(); }
function setView(view) { state.view = view; state.query = ""; state.filter = "all"; document.querySelectorAll(".nav-link").forEach((item) => item.classList.toggle("is-active", item.dataset.view === view)); shell.classList.remove("nav-open"); render(); }

function customerOptions(selected = "") { return state.data.customers.map((item) => `<option value="${esc(item.id)}" ${item.id === selected ? "selected" : ""}>${esc(item.company)}</option>`).join(""); }
function projectOptions(selected = "") { return state.data.projects.map((item) => `<option value="${esc(item.id)}" ${item.id === selected ? "selected" : ""}>${esc(item.title)}</option>`).join(""); }
function field(label, name, type = "text", value = "", wide = false, extra = "") { return `<label class="form-field ${wide ? "wide" : ""}"><span>${esc(label)}</span><input type="${type}" name="${name}" value="${esc(value)}" ${extra}></label>`; }
function openEditor(type) {
  formError.textContent = "";
  dialogForm.dataset.type = type;
  dialogKicker.textContent = "NEU";
  if (type === "customer") {
    dialogTitle.textContent = "Kunde erfassen";
    dialogBody.innerHTML = `<div class="form-grid">${field("Firma *","company","text","",false,"required")}${field("Kontaktperson","contact_name")}${field("E-Mail *","email","email","",false,"required")}${field("Telefon","phone","tel")}${field("Strasse / Nr. *","address_line1","text","",true,"required")}${field("PLZ *","postal_code","text","",false,"required")}${field("Ort *","city","text","",false,"required")}${field("Land","country","text","Schweiz",true)}</div>`;
  } else if (type === "project") {
    if (!state.data.customers.length) { showToast("Bitte zuerst einen Kunden erfassen.", "error"); setView("customers"); return; }
    dialogTitle.textContent = "Projekt anlegen";
    dialogBody.innerHTML = `<div class="form-grid"><label class="form-field wide"><span>Kunde *</span><select name="customer_id" required><option value="">Bitte wählen</option>${customerOptions()}</select></label>${field("Projekttitel *","title","text","",true,"required")}<label class="form-field"><span>Status</span><select name="status"><option value="planning">Planung</option><option value="active">Aktiv</option><option value="completed">Abgeschlossen</option><option value="on_hold">Pausiert</option></select></label>${field("Budget CHF","budget","number","","",'min="0" step="0.05"')}${field("Start","start_date","date",today())}${field("Deadline","due_date","date")}<label class="form-field wide"><span>Beschreibung</span><textarea name="description"></textarea></label></div>`;
  } else if (type === "invoice") {
    if (!state.data.customers.length) { showToast("Bitte zuerst einen Kunden erfassen.", "error"); setView("customers"); return; }
    const number = `HEAV-${new Date().getFullYear()}-${String(state.data.invoices.length + 1).padStart(3,"0")}`;
    dialogTitle.textContent = "Rechnung erstellen";
    dialogBody.innerHTML = `<div class="form-grid"><label class="form-field"><span>Kunde *</span><select name="customer_id" required><option value="">Bitte wählen</option>${customerOptions()}</select></label><label class="form-field"><span>Projekt</span><select name="project_id"><option value="">Kein Projekt</option>${projectOptions()}</select></label>${field("Rechnungsnummer *","invoice_number","text",number,false,"required")}${field("MWST %","tax_rate","number",state.data.settings?.default_tax_rate ?? 8.1,false,'min="0" step="0.1"')}${field("Rechnungsdatum *","issue_date","date",today(),false,"required")}${field("Fällig am *","due_date","date",plusDays(today(),state.data.settings?.default_due_days || 30),false,"required")}<div class="invoice-items"><span class="items-label">Positionen *</span><div id="invoice-item-list"></div><button class="secondary-button" type="button" data-add-item>Position hinzufügen</button></div><label class="form-field wide"><span>Hinweis auf Rechnung</span><textarea name="notes" placeholder="Optional"></textarea></label><div class="invoice-total" id="invoice-total">TOTAL&nbsp;&nbsp; CHF 0.00</div></div>`;
    addInvoiceItem();
  } else {
    const settings = state.data.settings || {};
    dialogKicker.textContent = "EINSTELLUNGEN";
    dialogTitle.textContent = "Rechnungsabsender";
    dialogBody.innerHTML = `<div class="form-grid">${field("Firma *","company_name","text",settings.company_name || "HEAV",false,"required")}${field("Inhaber *","owner_name","text",settings.owner_name || "Michias Tegegne",false,"required")}${field("E-Mail *","email","email",settings.email || "hello@heav.ch",false,"required")}${field("Telefon","phone","tel",settings.phone || "")}${field("Strasse / Nr. *","address_line1","text",settings.address_line1 || "",true,"required")}${field("PLZ *","postal_code","text",settings.postal_code || "",false,"required")}${field("Ort *","city","text",settings.city || "",false,"required")}${field("IBAN *","iban","text",settings.iban || "",true,"required")}${field("MWST-Nr.","vat_number","text",settings.vat_number || "")}${field("Standard-MWST %","default_tax_rate","number",settings.default_tax_rate ?? 8.1,false,'min="0" step="0.1"')}${field("Standard-Zahlungsfrist (Tage)","default_due_days","number",settings.default_due_days || 30,false,'min="1" step="1"')}</div>`;
  }
  dialog.showModal();
}

function addInvoiceItem() {
  const list = document.querySelector("#invoice-item-list");
  const row = document.createElement("div");
  row.className = "invoice-item";
  row.innerHTML = `<input name="item_description" placeholder="Leistung" aria-label="Leistung" required><input name="item_quantity" type="number" value="1" min="0.01" step="0.01" aria-label="Menge" required><input name="item_price" type="number" min="0" step="0.05" placeholder="CHF" aria-label="Einzelpreis in CHF" required><button class="remove-item" type="button" data-remove-item aria-label="Position entfernen">×</button>`;
  list.append(row);
  updateInvoiceTotal();
}
function updateInvoiceTotal() {
  const total = document.querySelector("#invoice-total"); if (!total) return;
  const rows = [...document.querySelectorAll(".invoice-item")];
  const items = rows.map((row) => ({ quantity: row.querySelector('[name="item_quantity"]').value, unitPrice: row.querySelector('[name="item_price"]').value }));
  const tax = dialogForm.elements.tax_rate?.value || 0;
  total.innerHTML = `TOTAL&nbsp;&nbsp; ${formatCHF(calculateInvoice(items, tax).totalRappen)}`;
}

async function saveEditor(type) {
  if (!dialogForm.reportValidity()) return false;
  const data = Object.fromEntries(new FormData(dialogForm));
  if (type === "customer") await adapter.saveCustomer({ company: data.company.trim(), contact_name: data.contact_name.trim(), email: data.email.trim(), phone: data.phone.trim(), address_line1: data.address_line1.trim(), postal_code: data.postal_code.trim(), city: data.city.trim(), country: data.country.trim() || "Schweiz" });
  if (type === "project") await adapter.saveProject({ customer_id: data.customer_id, title: data.title.trim(), status: data.status, budget_rappen: Math.round(Number(data.budget || 0) * 100), start_date: data.start_date || null, due_date: data.due_date || null, description: data.description.trim() });
  if (type === "invoice") {
    const rows = [...document.querySelectorAll(".invoice-item")];
    const items = rows.map((row) => ({ description: row.querySelector('[name="item_description"]').value.trim(), quantity: Number(row.querySelector('[name="item_quantity"]').value), unit_price_rappen: Math.round(Number(row.querySelector('[name="item_price"]').value) * 100) }));
    const payload = { customerId: data.customer_id, issueDate: data.issue_date, dueDate: data.due_date, items: items.map((item) => ({ description: item.description, quantity: item.quantity, unitPrice: item.unit_price_rappen / 100 })) };
    const errors = validateInvoice(payload); if (Object.keys(errors).length) { formError.textContent = Object.values(errors)[0]; return false; }
    await adapter.saveInvoice({ customer_id: data.customer_id, project_id: data.project_id || null, invoice_number: data.invoice_number.trim(), issue_date: data.issue_date, due_date: data.due_date, tax_rate: Number(data.tax_rate || 0), notes: data.notes.trim(), items });
  }
  if (type === "settings") await adapter.saveSettings({ company_name: data.company_name.trim(), owner_name: data.owner_name.trim(), email: data.email.trim(), phone: data.phone.trim(), address_line1: data.address_line1.trim(), postal_code: data.postal_code.trim(), city: data.city.trim(), iban: data.iban.trim(), vat_number: data.vat_number.trim(), default_tax_rate: Number(data.default_tax_rate || 0), default_due_days: Number(data.default_due_days || 30) });
  return true;
}

async function invoiceAction(id, action, button) {
  button.disabled = true;
  try {
    const result = await adapter.invoiceAction(id, action);
    if (action === "download") {
      const url = URL.createObjectURL(result); const link = document.createElement("a"); link.href = url; link.download = `${state.data.invoices.find((item) => item.id === id)?.invoice_number || "HEAV-Rechnung"}.pdf`; link.click(); URL.revokeObjectURL(url); showToast("PDF wurde erstellt.");
    } else { showToast(action === "send" ? "Rechnung wurde versendet." : "Rechnung als bezahlt markiert."); await refresh(); }
  } catch (error) { showToast(error.message || "Aktion fehlgeschlagen.", "error"); }
  finally { button.disabled = false; }
}

content.addEventListener("click", (event) => {
  const create = event.target.closest("[data-create]"); if (create) openEditor(create.dataset.create);
  const view = event.target.closest("[data-view]"); if (view) setView(view.dataset.view);
  const filter = event.target.closest("[data-filter]"); if (filter) { state.filter = filter.dataset.filter; render(); }
  const action = event.target.closest("[data-invoice-action]"); if (action) invoiceAction(action.dataset.id, action.dataset.invoiceAction, action);
});
content.addEventListener("input", (event) => { if (event.target.matches("[data-search]")) { state.query = event.target.value; const position = event.target.selectionStart; render(); const next = document.querySelector("[data-search]"); next.focus(); next.setSelectionRange(position, position); } });
dialogBody.addEventListener("click", (event) => { if (event.target.closest("[data-add-item]")) addInvoiceItem(); if (event.target.closest("[data-remove-item]")) { if (document.querySelectorAll(".invoice-item").length > 1) event.target.closest(".invoice-item").remove(); updateInvoiceTotal(); } });
dialogBody.addEventListener("input", (event) => { if (event.target.matches('[name="item_quantity"],[name="item_price"],[name="tax_rate"]')) updateInvoiceTotal(); });
dialogForm.addEventListener("submit", async (event) => { const submitter = event.submitter; if (submitter?.value !== "save") return; event.preventDefault(); submitter.disabled = true; formError.textContent = ""; try { if (await saveEditor(dialogForm.dataset.type)) { dialog.close(); await refresh(); showToast("Gespeichert."); } } catch (error) { formError.textContent = error.message || "Speichern fehlgeschlagen."; } finally { submitter.disabled = false; } });
document.addEventListener("click", (event) => { const nav = event.target.closest(".nav-link"); if (nav) setView(nav.dataset.view); if (event.target.closest("[data-open-nav]")) shell.classList.add("nav-open"); if (event.target.closest("[data-close-nav]")) shell.classList.remove("nav-open"); const create = event.target.closest("[data-create]"); if (create && !content.contains(create)) openEditor(create.dataset.create); });
document.querySelector("#logout-button").addEventListener("click", async () => { await adapter.logout(); window.location.replace("/login/"); });

async function boot() {
  try {
    if (!isBackendConfigured()) throw new Error("Backend ist noch nicht konfiguriert.");
    const { createClient } = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.4/+esm");
    state.supabase = createClient(HEAV_ADMIN_CONFIG.supabaseUrl, HEAV_ADMIN_CONFIG.supabaseAnonKey);
    const { data, error } = await state.supabase.auth.getSession();
    if (error || !data.session) { window.location.replace("/login/"); return; }
    adapter = createSupabaseAdapter(state.supabase, data.session);
    state.data = await adapter.loadAll();
    loading.remove(); shell.hidden = false; render();
  } catch (error) {
    loading.innerHTML = `<strong>HEAV</strong><span>${esc(error.message)}</span><a href="/login/" style="color:#d7ff38">Zum Login</a>`;
  }
}
boot();
