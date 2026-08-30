import { HEAV_ADMIN_CONFIG, isBackendConfigured } from "/admin/config.js";
import { calculateInvoice, formatCHF, statusLabel, validateCustomer, validateInvoice } from "/admin/assets/domain.js";

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
  "portal-requests": "Portal-Anfragen",
};
const state = { view: "dashboard", query: "", filter: "all", data: null, supabase: null, sendRequestKeys: new Map() };
const esc = (value = "") => String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
const formatDate = (value) => value ? new Intl.DateTimeFormat("de-CH").format(new Date(`${value}T12:00:00`)) : "–";
const today = () => new Date().toISOString().slice(0, 10);
const plusDays = (date, days) => { const result = new Date(`${date}T12:00:00`); result.setDate(result.getDate() + days); return result.toISOString().slice(0, 10); };
const formatReference = (value = "") => String(value).replace(/\s+/g, "").replace(/(.{4})(?=.)/g, "$1 ");
const normalizeVatNumber = (value = "") => String(value).trim().toUpperCase();
const validVatNumber = (value = "") => /^CHE-\d{3}\.\d{3}\.\d{3} (MWST|TVA|IVA)$/.test(normalizeVatNumber(value));


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
    invoices: data.invoices.map((item) => ({ ...item, customer: item.customer_snapshot || customers.get(item.customer_id) })),
  };
}


function customerLabel(customer) {
  return customer?.company || customer?.contact_name || "Ohne Namen";
}

function createSupabaseAdapter(supabase, session) {
  const ownerId = session.user.id;
  const fail = (error) => { if (error) throw error; };
  return {
    async loadAll() {
      const [customers, projects, invoices, settings, portalRequests] = await Promise.all([
        supabase.from("customers").select("*").order("company"),
        supabase.from("projects").select("*").order("created_at", { ascending: false }),
        supabase.from("invoices").select("*, invoice_items(*)").order("issue_date", { ascending: false }),
        supabase.from("company_settings").select("*").maybeSingle(),
        supabase.from("customer_portal_requests").select("*").order("created_at", { ascending: false }),
      ]);
      [customers, projects, invoices, settings, portalRequests].forEach((result) => fail(result.error));
      const normalizedInvoices = invoices.data.map((invoice) => ({ ...invoice, items: invoice.invoice_items || [] }));
      return joinedData({ customers: customers.data, projects: projects.data, invoices: normalizedInvoices, settings: settings.data || {}, portalRequests: portalRequests.data || [] });
    },
    async saveCustomer(payload) { const result = await supabase.from("customers").insert({ ...payload, owner_id: ownerId }); fail(result.error); },
    async updateCustomer(id, payload) { const result = await supabase.rpc("update_customer", { p_customer_id: id, p_company: payload.company, p_contact_name: payload.contact_name, p_email: payload.email, p_phone: payload.phone, p_address_line1: payload.address_line1, p_postal_code: payload.postal_code, p_city: payload.city, p_country: payload.country }); fail(result.error); },
    async saveProject(payload) { const result = await supabase.from("projects").insert({ ...payload, owner_id: ownerId }); fail(result.error); },
    async updateProject(id, payload) { const result = await supabase.rpc("update_project", { p_project_id: id, p_customer_id: payload.customer_id, p_title: payload.title, p_description: payload.description, p_status: payload.status, p_budget_rappen: payload.budget_rappen, p_start_date: payload.start_date, p_due_date: payload.due_date }); fail(result.error); },
    async saveInvoice(payload) {
      const items = payload.items;
      const result = await supabase.rpc("create_invoice", {
        p_customer_id: payload.customer_id,
        p_project_id: payload.project_id,
        p_issue_date: payload.issue_date,
        p_due_date: payload.due_date,
        p_tax_rate: payload.tax_rate,
        p_notes: payload.notes,
        p_items: items,
      });
      fail(result.error);
    },
    async updateInvoice(id, payload) {
      const result = await supabase.rpc("update_invoice", { p_invoice_id: id, p_customer_id: payload.customer_id, p_project_id: payload.project_id, p_issue_date: payload.issue_date, p_due_date: payload.due_date, p_status: payload.status, p_tax_rate: payload.tax_rate, p_notes: payload.notes, p_items: payload.items });
      fail(result.error);
    },
    async deleteRecord(type, id) {
      const rpcNames = { customer: "delete_customer", project: "delete_project", invoice: "delete_draft_invoice" };
      const parameterNames = { customer: "p_customer_id", project: "p_project_id", invoice: "p_invoice_id" };
      const result = await supabase.rpc(rpcNames[type], { [parameterNames[type]]: id });
      fail(result.error);
    },
    async processPortalRequest(id, action) {
      const result = await supabase.rpc("process_customer_portal_request", { p_request_id: id, p_action: action });
      fail(result.error);
      return result.data;
    },
    async sendPortalInvite(customerId) {
      const { data, error } = await supabase.functions.invoke("portal-send-invite", { body: { customerId } });
      if (error) {
        const details = await error.context?.json?.().catch(() => null);
        throw new Error(details?.error || "Einladung konnte nicht versendet werden.");
      }
      return data;
    },
    async saveSettings(payload) { const result = await supabase.from("company_settings").upsert({ ...payload, owner_id: ownerId }, { onConflict: "owner_id" }); fail(result.error); },
    async invoiceAction(id, action, requestKey = null) {
      const { data: sessionData } = await supabase.auth.getSession();
      const response = await fetch(`${HEAV_ADMIN_CONFIG.supabaseUrl}/functions/v1/invoice-document`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${sessionData.session.access_token}`, apikey: HEAV_ADMIN_CONFIG.supabaseAnonKey },
        body: JSON.stringify({ invoiceId: id, action, requestKey }),
      });
      if (!response.ok) { const error = await response.json().catch(() => ({})); throw new Error(error.error || "Rechnungsaktion fehlgeschlagen"); }
      return action === "download" ? response.blob() : response.json();
    },
    async logout() { await supabase.auth.signOut(); },
  };
}

let adapter;

function metric(label, value) { return `<article class="metric"><span>${esc(label)}</span><strong>${esc(value)}</strong></article>`; }
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
function filterToolbar(placeholder, filters) { return `<div class="toolbar"><label class="search-field"><span class="sr-only">Suchen</span><input type="search" data-search placeholder="${esc(placeholder)}" value="${esc(state.query)}"></label><div class="filter-tabs">${filters.map(([value,label]) => `<button class="filter-tab ${state.filter === value ? "is-active" : ""}" data-filter="${value}">${label}</button>`).join("")}</div></div>`; }

function renderCustomers() {
  const items = filtered(state.data.customers, ["company", "contact_name", "email", "city"]);
  if (!state.data.customers.length) return `<section class="view">${emptyState("Der erste Kontakt.", "Erfasse deinen ersten Kunden und verknüpfe danach Projekte und Rechnungen.", "customer")}</section>`;
  const rows = items.map((item) => `<tr><td><strong>${esc(customerLabel(item))}</strong><small>${esc(item.company && item.contact_name ? item.contact_name : item.company ? "" : "Privatkunde")}</small></td><td>${esc(item.email || "–")}</td><td>${esc(item.phone || "–")}</td><td>${esc([item.postal_code,item.city].filter(Boolean).join(" ") || "–")}</td><td><button class="text-button" data-edit="customer" data-id="${esc(item.id)}">Bearbeiten</button><button class="danger-button" data-delete-record="customer" data-id="${esc(item.id)}" aria-label="Kunde löschen: ${esc(customerLabel(item))}">Löschen</button></td></tr>`).join("");
  const cards = items.map((item) => `<article class="mobile-card"><div><strong>${esc(customerLabel(item))}</strong><small>${esc(item.company && item.contact_name ? item.contact_name : item.company ? "" : "Privatkunde")} · ${esc(item.email || "Keine E-Mail")}</small><button class="text-button" data-edit="customer" data-id="${esc(item.id)}">Bearbeiten</button><button class="danger-button" data-delete-record="customer" data-id="${esc(item.id)}" aria-label="Kunde löschen: ${esc(customerLabel(item))}">Löschen</button></div><span>${esc(item.city || "")}</span></article>`).join("");
  return `<section class="view">${toolbar("customer", "Kunden durchsuchen …")}<table class="data-table"><thead><tr><th>Kunde</th><th>E-Mail</th><th>Telefon</th><th>Ort</th><th>Aktionen</th></tr></thead><tbody>${rows}</tbody></table><div class="mobile-card-list">${cards}</div></section>`;
}

function renderProjects() {
  const all = state.data.projects;
  const items = filtered(all.filter((item) => state.filter === "all" || item.status === state.filter), ["title", "description"]);
  if (!all.length) return `<section class="view">${emptyState("From idea to frame.", "Lege das erste Projekt an und halte Status, Kunde und Budget im Blick.", "project")}</section>`;
  const rows = items.map((item) => `<tr><td><strong>${esc(item.title)}</strong><small>${esc(item.customer?.company || "Ohne Kunde")}</small></td><td><span class="status ${esc(item.status)}">${esc(statusLabel(item.status))}</span></td><td>${formatDate(item.due_date)}</td><td>${formatCHF(item.budget_rappen || 0)}</td><td><button class="text-button" data-edit="project" data-id="${esc(item.id)}">Bearbeiten</button><button class="danger-button" data-delete-record="project" data-id="${esc(item.id)}" aria-label="Projekt löschen: ${esc(item.title)}">Löschen</button></td></tr>`).join("");
  const cards = items.map((item) => `<article class="mobile-card"><div><strong>${esc(item.title)}</strong><small>${esc(item.customer?.company || "Ohne Kunde")} · ${formatDate(item.due_date)}</small><button class="text-button" data-edit="project" data-id="${esc(item.id)}">Bearbeiten</button><button class="danger-button" data-delete-record="project" data-id="${esc(item.id)}" aria-label="Projekt löschen: ${esc(item.title)}">Löschen</button></div><span class="status ${esc(item.status)}">${esc(statusLabel(item.status))}</span></article>`).join("");
  return `<section class="view">${toolbar("project", "Projekte durchsuchen …", [["all","Alle"],["planning","Planung"],["active","Aktiv"],["completed","Abgeschlossen"]])}<table class="data-table"><thead><tr><th>Projekt</th><th>Status</th><th>Deadline</th><th>Budget</th><th>Aktionen</th></tr></thead><tbody>${rows}</tbody></table><div class="mobile-card-list">${cards}</div></section>`;
}

function invoiceActions(invoice) {
  return `<div class="table-actions"><button class="text-button" data-edit="invoice" data-id="${esc(invoice.id)}">Bearbeiten</button>${!invoice.is_legacy && invoice.status !== "cancelled" ? `<button class="text-button" data-invoice-action="download" data-id="${esc(invoice.id)}">PDF</button>` : ""}${!invoice.is_legacy && ["draft","sent","overdue"].includes(invoice.status) ? `<button class="text-button" data-invoice-action="send" data-id="${esc(invoice.id)}">Senden</button>` : ""}${!invoice.is_legacy && ["sent","overdue"].includes(invoice.status) ? `<button class="text-button" data-invoice-action="mark_paid" data-id="${esc(invoice.id)}">Bezahlt</button><button class="danger-button" data-invoice-action="cancel" data-id="${esc(invoice.id)}">Stornieren</button>` : ""}${!invoice.is_legacy && invoice.status === "draft" ? `<button class="danger-button" data-delete-record="invoice" data-id="${esc(invoice.id)}" aria-label="Rechnung löschen">Löschen</button>` : ""}</div>`;
}
function renderInvoices() {
  const all = state.data.invoices;
  const items = filtered(all.filter((item) => state.filter === "all" || item.status === state.filter), ["invoice_number"]);
  if (!all.length) return `<section class="view">${emptyState("Ready to invoice.", "Erstelle deine erste HEAV-Rechnung als PDF und sende sie direkt an den Kunden.", "invoice")}</section>`;
  const rows = items.map((item) => `<tr><td><strong>${esc(item.invoice_number)}</strong><small>${formatDate(item.issue_date)} · ${item.is_legacy ? "Historisch archiviert" : esc(formatReference(item.payment_reference))}</small></td><td>${esc(item.customer?.company || "Ohne Kunde")}</td><td><span class="status ${esc(item.status)}">${esc(statusLabel(item.status))}</span></td><td><strong>${formatCHF(item.total_rappen)}</strong><small>fällig ${formatDate(item.due_date)}</small></td><td>${invoiceActions(item)}</td></tr>`).join("");
  const cards = items.map((item) => `<article class="mobile-card"><div><strong>${esc(item.invoice_number)} · ${formatCHF(item.total_rappen)}</strong><small>${esc(item.customer?.company || "Ohne Kunde")} · fällig ${formatDate(item.due_date)}</small>${invoiceActions(item)}</div><span class="status ${esc(item.status)}">${esc(statusLabel(item.status))}</span></article>`).join("");
  return `<section class="view">${toolbar("invoice", "Rechnungen durchsuchen …", [["all","Alle"], ...["draft","sent","paid","overdue","cancelled"].map((status) => [status,statusLabel(status)])])}<table class="data-table"><thead><tr><th>Rechnung</th><th>Kunde</th><th>Status</th><th>Total</th><th>Aktionen</th></tr></thead><tbody>${rows}</tbody></table><div class="mobile-card-list">${cards}</div></section>`;
}

function renderPortalRequests() {
  const all = state.data.portalRequests || [];
  const items = filtered(all.filter((item) => state.filter === "all" || item.status === state.filter), ["contact_name", "company", "email", "message"]);
  const actions = (item) => {
    if (item.status === "pending") return `<div class="table-actions"><button class="primary-action" data-portal-request-action="accept" data-id="${esc(item.id)}">Akzeptieren</button><button class="danger-button" data-portal-request-action="decline" data-id="${esc(item.id)}">Ablehnen</button></div>`;
    if (item.status === "accepted") return `<div class="table-actions"><button class="primary-action" data-portal-request-action="invite" data-id="${esc(item.id)}">Einladung senden</button><span class="status paid">Akzeptiert</span></div>`;
    return `<span class="status cancelled">Abgelehnt</span>`;
  };
  if (!all.length) return `<section class="view"><div class="empty-state"><h3>Keine Portal-Anfragen.</h3><p>Neue Anfragen aus dem Kundenportal erscheinen hier.</p></div></section>`;
  const rows = items.map((item) => `<tr><td><strong>${esc(item.company || item.contact_name)}</strong><small>${esc(item.contact_name)} · ${formatDate(item.created_at?.slice(0,10))}</small></td><td>${esc(item.email)}</td><td>${esc(item.phone || "–")}</td><td><small>${esc(item.message || "–")}</small></td><td>${actions(item)}</td></tr>`).join("");
  return `<section class="view"><div class="hero-row"><h2>Neue Zugänge,<br><em>klar geprüft.</em></h2><p>Beim Akzeptieren wird automatisch ein Kundenprofil erstellt. Der Portalzugang wird erst mit der anschliessenden Einladung freigeschaltet.</p></div>${filterToolbar("Anfragen durchsuchen …", [["all","Alle"],["pending","Offen"],["accepted","Akzeptiert"],["declined","Abgelehnt"]])}<table class="data-table"><thead><tr><th>Anfrage</th><th>E-Mail</th><th>Telefon</th><th>Nachricht</th><th>Aktion</th></tr></thead><tbody>${rows}</tbody></table></section>`;
}

function renderSettings() {
  const settings = state.data.settings || {};
  return `<section class="view"><div class="hero-row"><h2>Business,<br><em>set clearly.</em></h2><p>Diese Angaben erscheinen auf deinen Rechnungen und in den Rechnungs-E-Mails. Ohne MWST-Nummer berechnet das System automatisch keine MWST.</p></div><div class="settings-grid"><article class="settings-card"><h3>Rechnungsabsender</h3><p>Rechtliche und finanzielle Angaben für alle PDF-Rechnungen.</p><div class="settings-list"><div><span>Firma</span><strong>${esc(settings.company_name || "HEAV")}</strong></div><div><span>Inhaber</span><strong>${esc(settings.owner_name || "Michias Tegegne")}</strong></div><div><span>E-Mail</span><strong>${esc(settings.email || "hello@heav.ch")}</strong></div><div><span>MWST</span><strong>${esc(settings.vat_number || "Nicht MWST-pflichtig")}</strong></div><div><span>IBAN</span><strong>${esc(settings.iban || "Noch offen")}</strong></div></div><button class="primary-action" data-create="settings" style="margin-top:24px">Angaben bearbeiten</button></article><article class="settings-card"><h3>Systemstatus</h3><p>Der Adminbereich nutzt einen getrennten, geschützten Backend-Zugang.</p><div class="settings-list"><div><span>Modus</span><strong>Produktion</strong></div><div><span>Datenbank</span><strong>Supabase RLS</strong></div><div><span>Rechnungsversand</span><strong>billing@heav.ch</strong></div><div><span>Website</span><strong>heav.ch</strong></div></div></article></div></section>`;
}

const renderers = { dashboard: renderDashboard, customers: renderCustomers, projects: renderProjects, invoices: renderInvoices, settings: renderSettings, "portal-requests": renderPortalRequests };
function render() { title.textContent = viewNames[state.view]; content.innerHTML = renderers[state.view](); content.focus({ preventScroll: true }); }
async function refresh() { state.data = await adapter.loadAll(); render(); }
function setView(view) { state.view = view; state.query = ""; state.filter = "all"; document.querySelectorAll(".nav-link").forEach((item) => item.classList.toggle("is-active", item.dataset.view === view)); shell.classList.remove("nav-open"); render(); }

function customerOptions(selected = "") { return state.data.customers.map((item) => `<option value="${esc(item.id)}" ${item.id === selected ? "selected" : ""}>${esc(customerLabel(item))}</option>`).join(""); }
function projectOptions(customerId = "", selected = "") { return state.data.projects.filter((item) => item.customer_id === customerId).map((item) => `<option value="${esc(item.id)}" ${item.id === selected ? "selected" : ""}>${esc(item.title)}</option>`).join(""); }
function field(label, name, type = "text", value = "", wide = false, extra = "") { return `<label class="form-field ${wide ? "wide" : ""}"><span>${esc(label)}</span><input type="${type}" name="${name}" value="${esc(value)}" ${extra}></label>`; }
function openEditor(type, existing = null) {
  formError.textContent = "";
  dialogForm.dataset.type = type;
  dialogForm.dataset.editId = existing?.id || "";
  dialogKicker.textContent = existing ? "BEARBEITEN" : "NEU";
  if (type === "customer") {
    const item = existing || {};
    dialogTitle.textContent = existing ? "Kunde bearbeiten" : "Kunde erfassen";
    dialogBody.innerHTML = `<p class="form-hint">Firma oder Kontaktperson genügt. Adresse, E-Mail und Telefon kannst du später ergänzen.</p><div class="form-grid">${field("Firma","company","text",item.company || "")}${field("Kontaktperson","contact_name","text",item.contact_name || "")}${field("E-Mail","email","email",item.email || "")}${field("Telefon","phone","tel",item.phone || "")}${field("Strasse / Nr.","address_line1","text",item.address_line1 || "",true)}${field("PLZ","postal_code","text",item.postal_code || "")}${field("Ort","city","text",item.city || "")}${field("Land","country","text",item.country || "Schweiz",true)}</div>`;
  } else if (type === "project") {
    if (!state.data.customers.length) { showToast("Bitte zuerst einen Kunden erfassen.", "error"); setView("customers"); return; }
    const item = existing || {};
    dialogTitle.textContent = existing ? "Projekt bearbeiten" : "Projekt anlegen";
    dialogBody.innerHTML = `<div class="form-grid"><label class="form-field wide"><span>Kunde *</span><select name="customer_id" required><option value="">Bitte wählen</option>${customerOptions(item.customer_id)}</select></label>${field("Projekttitel *","title","text",item.title || "",true,"required")}<label class="form-field"><span>Status</span><select name="status">${[["planning","Planung"],["active","Aktiv"],["completed","Abgeschlossen"],["on_hold","Pausiert"]].map(([v,l]) => `<option value="${v}" ${item.status === v ? "selected" : ""}>${l}</option>`).join("")}</select></label>${field("Budget CHF","budget","number",item.budget_rappen != null ? item.budget_rappen / 100 : "",false,'min="0" step="0.05"')}${field("Start","start_date","date",item.start_date || "")}${field("Deadline","due_date","date",item.due_date || "")}<label class="form-field wide"><span>Beschreibung</span><textarea name="description">${esc(item.description || "")}</textarea></label></div>`;
  } else if (type === "invoice") {
    if (!state.data.customers.length) { showToast("Bitte zuerst einen Kunden erfassen.", "error"); setView("customers"); return; }
    const item = existing || {};
    dialogTitle.textContent = existing ? `Rechnung bearbeiten · ${item.invoice_number}` : "Rechnung erstellen";
    const vatRegistered = validVatNumber(state.data.settings?.vat_number);
    const customerId = item.customer_id || "";
    dialogBody.innerHTML = `<div class="form-grid"><label class="form-field"><span>Kunde *</span><select name="customer_id" required><option value="">Bitte wählen</option>${customerOptions(customerId)}</select></label><label class="form-field"><span>Projekt</span><select name="project_id"><option value="">Kein Projekt</option>${projectOptions(customerId,item.project_id || "")}</select></label>${existing ? `<label class="form-field wide"><span>Versand- und Zahlungsstatus · auch für manuell versandte PDFs</span><select name="status">${["draft","sent","paid","overdue","cancelled"].map((status) => `<option value="${status}" ${item.status === status ? "selected" : ""}>${statusLabel(status)}</option>`).join("")}</select></label>` : ""}${!existing ? `<div class="sequence-note wide"><strong>Automatische Referenz</strong><span>Die Zahlungsreferenz wird beim Speichern fortlaufend und buchhaltungssicher vergeben.</span></div>` : ""}${field(vatRegistered ? "MWST %" : "MWST % · nicht registriert","tax_rate","number",item.tax_rate ?? (vatRegistered ? (state.data.settings?.default_tax_rate ?? 0) : 0),false,vatRegistered ? 'min="0" step="0.1"' : 'readonly aria-readonly="true"')}${field("Rechnungsdatum *","issue_date","date",item.issue_date || today(),false,"required")}${field("Fällig am *","due_date","date",item.due_date || plusDays(today(),state.data.settings?.default_due_days || 30),false,"required")}<div class="invoice-items"><span class="items-label">Positionen *</span><div id="invoice-item-list"></div><div class="invoice-add-actions"><button class="secondary-button" type="button" data-add-item>Position hinzufügen</button><button class="secondary-button" type="button" data-add-discount>Rabatt hinzufügen</button></div></div><label class="form-field wide"><span>Hinweis auf Rechnung</span><textarea name="notes">${esc(item.notes || "")}</textarea></label><div class="invoice-total" id="invoice-total">TOTAL&nbsp;&nbsp; CHF 0.00</div></div>`;
    (existing ? item.items : [null]).forEach((invoiceItem) => addInvoiceItem(invoiceItem));
  } else {
    const settings = state.data.settings || {};
    dialogKicker.textContent = "EINSTELLUNGEN"; dialogTitle.textContent = "Rechnungsabsender";
    dialogBody.innerHTML = `<div class="form-grid">${field("Firma *","company_name","text",settings.company_name || "HEAV",false,"required")}${field("Inhaber *","owner_name","text",settings.owner_name || "Michias Tegegne",false,"required")}${field("E-Mail *","email","email",settings.email || "hello@heav.ch",false,"required")}${field("Telefon","phone","tel",settings.phone || "")}${field("Website","website_url","url",settings.website_url || "https://heav.ch")}${field("Instagram URL","instagram_url","url",settings.instagram_url || "")}${field("Strasse / Nr. *","address_line1","text",settings.address_line1 || "",true,"required")}${field("PLZ *","postal_code","text",settings.postal_code || "",false,"required")}${field("Ort *","city","text",settings.city || "",false,"required")}${field("IBAN *","iban","text",settings.iban || "",true,"required")}${field("MWST-Nr. · leer lassen, wenn nicht registriert","vat_number","text",settings.vat_number || "",true)}${field("Standard-MWST %","default_tax_rate","number",settings.vat_number ? (settings.default_tax_rate ?? 0) : 0,false,'min="0" step="0.1"')}${field("Standard-Zahlungsfrist (Tage)","default_due_days","number",settings.default_due_days || 30,false,'min="1" step="1"')}</div>`;
  }
  dialog.showModal();
}
function readInvoiceEditorItems() {
  return [...document.querySelectorAll(".invoice-item")].map((row) => {
    const description = row.querySelector('[name="item_description"]').value.trim();
    if (row.dataset.kind === "discount") {
      return {
        description,
        quantity: 1,
        unitPrice: -Math.abs(Number(row.querySelector('[name="discount_value"]').value)),
      };
    }
    return {
      description,
      quantity: Number(row.querySelector('[name="item_quantity"]').value),
      unitPrice: Number(row.querySelector('[name="item_price"]').value),
    };
  });
}

function addInvoiceItem(item = null, kind = "service") {
  const list = document.querySelector("#invoice-item-list");
  const row = document.createElement("div");
  const isDiscount = kind === "discount" || Number(item?.unit_price_rappen) < 0;
  row.className = `invoice-item ${isDiscount ? "is-discount" : ""}`;
  row.dataset.kind = isDiscount ? "discount" : "service";
  const remove = `<button class="remove-item" type="button" data-remove-item aria-label="Position entfernen">×</button>`;
  row.innerHTML = isDiscount
    ? `<input name="item_description" placeholder="Rabatt" aria-label="Rabatt" value="${esc(item?.description || "Rabatt")}" required><span class="discount-kind" aria-label="Rabattart: fixer Betrag">Rabatt</span><input name="discount_value" type="number" min="0.01" step="0.01" placeholder="CHF" value="${item ? Math.abs(Number(item.unit_price_rappen)) / 100 : ""}" aria-label="Rabatt in CHF" required>${remove}`
    : `<input name="item_description" placeholder="Leistung" aria-label="Leistung" value="${esc(item?.description || "")}" required><input name="item_quantity" type="number" value="${item?.quantity ?? 1}" min="0.01" step="0.01" aria-label="Menge" required><input name="item_price" type="number" min="0" step="0.05" placeholder="CHF" value="${item ? item.unit_price_rappen / 100 : ""}" aria-label="Einzelpreis in CHF" required>${remove}`;
  list.append(row);
  updateInvoiceTotal();
}
function updateInvoiceTotal() {
  const total = document.querySelector("#invoice-total"); if (!total) return;
  const tax = dialogForm.elements.tax_rate?.value || 0;
  total.innerHTML = `TOTAL&nbsp;&nbsp; ${formatCHF(calculateInvoice(readInvoiceEditorItems(), tax).totalRappen)}`;
}

async function saveEditor(type) {
  if (!dialogForm.reportValidity()) return false;
  const data = Object.fromEntries(new FormData(dialogForm));
  if (type === "customer") {
    const payload = { company: data.company.trim(), contact_name: data.contact_name.trim(), email: data.email.trim(), phone: data.phone.trim(), address_line1: data.address_line1.trim(), postal_code: data.postal_code.trim(), city: data.city.trim(), country: data.country.trim() || "Schweiz" };
    const errors = validateCustomer({ company: payload.company, contactName: payload.contact_name, email: payload.email });
    if (Object.keys(errors).length) { formError.textContent = Object.values(errors)[0]; return false; }
    if (dialogForm.dataset.editId) await adapter.updateCustomer(dialogForm.dataset.editId, payload); else await adapter.saveCustomer(payload);
  }
  if (type === "project") { const payload = { customer_id: data.customer_id, title: data.title.trim(), status: data.status, budget_rappen: Math.round(Number(data.budget || 0) * 100), start_date: data.start_date || null, due_date: data.due_date || null, description: data.description.trim() }; if (dialogForm.dataset.editId) await adapter.updateProject(dialogForm.dataset.editId, payload); else await adapter.saveProject(payload); }
  if (type === "invoice") {
    const editorItems = readInvoiceEditorItems();
    const items = editorItems.map((item) => ({ description: item.description, quantity: item.quantity, unit_price_rappen: Math.round(item.unitPrice * 100) }));
    const payload = { customerId: data.customer_id, issueDate: data.issue_date, dueDate: data.due_date, items: editorItems };
    const errors = validateInvoice(payload); if (Object.keys(errors).length) { formError.textContent = Object.values(errors)[0]; return false; }
    const invoicePayload = { customer_id: data.customer_id, project_id: data.project_id || null, issue_date: data.issue_date, due_date: data.due_date, status: data.status || "draft", tax_rate: Number(data.tax_rate || 0), notes: data.notes.trim(), items }; if (dialogForm.dataset.editId) await adapter.updateInvoice(dialogForm.dataset.editId, invoicePayload); else await adapter.saveInvoice(invoicePayload);
  }
  if (type === "settings") {
    const vatNumber = normalizeVatNumber(data.vat_number);
    if (vatNumber && !validVatNumber(vatNumber)) {
      formError.textContent = "MWST-Nummer im Format CHE-123.456.789 MWST eingeben oder leer lassen.";
      return false;
    }
    await adapter.saveSettings({ company_name: data.company_name.trim(), owner_name: data.owner_name.trim(), email: data.email.trim(), phone: data.phone.trim(), website_url: data.website_url.trim() || "https://heav.ch", instagram_url: data.instagram_url.trim(), address_line1: data.address_line1.trim(), postal_code: data.postal_code.trim(), city: data.city.trim(), iban: data.iban.trim(), vat_number: vatNumber, default_tax_rate: vatNumber ? Number(data.default_tax_rate || 0) : 0, default_due_days: Number(data.default_due_days || 30) });
  }
  return true;
}

async function invoiceAction(id, action, button) {
  const current = state.data.invoices.find((item) => item.id === id);
  if (action === "send") {
    const recipient = current?.customer?.email || "unbekannte Adresse";
    const total = formatCHF(current?.total_rappen || 0);
    if (!window.confirm(`Rechnung ${current?.invoice_number || ""} über ${total} jetzt an ${recipient} senden?`)) return;
  }
  if (action === "cancel" && !window.confirm(`Rechnung ${current?.invoice_number || ""} wirklich stornieren? Danach sind Versand und Zahlungs-PDF gesperrt.`)) return;
  button.disabled = true;
  try {
    const requestKey = action === "send" ? (state.sendRequestKeys.get(id) || crypto.randomUUID()) : null;
    if (requestKey) state.sendRequestKeys.set(id, requestKey);
    const result = await adapter.invoiceAction(id, action, requestKey);
    if (action === "send") state.sendRequestKeys.delete(id);
    if (action === "download") {
      const url = URL.createObjectURL(result); const link = document.createElement("a"); link.href = url; link.download = `${state.data.invoices.find((item) => item.id === id)?.invoice_number || "HEAV-Rechnung"}.pdf`; link.click(); URL.revokeObjectURL(url); showToast("PDF wurde erstellt.");
    } else { showToast(action === "send" ? "Rechnung wurde versendet." : action === "cancel" ? "Rechnung wurde storniert." : "Rechnung als bezahlt markiert."); await refresh(); }
  } catch (error) { showToast(error.message || "Aktion fehlgeschlagen.", "error"); }
  finally { button.disabled = false; }
}

async function deleteRecord(type, id, button) {
  const labels = { customer: "diesen Kunden", project: "dieses Projekt", invoice: "diesen Rechnungsentwurf" };
  if (!window.confirm(`Willst du ${labels[type]} wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.`)) return;
  button.disabled = true;
  try {
    await adapter.deleteRecord(type, id);
    await refresh();
    showToast("Gelöscht.");
  } catch (error) {
    showToast(error.message || "Löschen fehlgeschlagen.", "error");
  } finally {
    button.disabled = false;
  }
}

async function portalRequestAction(id, action, button) {
  const request = state.data.portalRequests.find((item) => item.id === id);
  const label = request?.company || request?.contact_name || "diese Anfrage";
  const question = action === "accept" ? `${label} akzeptieren und als Kundenprofil anlegen?` : action === "invite" ? `Sichere Portal-Einladung an ${request?.email || "diese Adresse"} senden?` : `${label} wirklich ablehnen?`;
  if (!window.confirm(question)) return;
  button.disabled = true;
  try {
    if (action === "invite") {
      if (!request?.customer_id) throw new Error("Für diese Anfrage fehlt das Kundenprofil.");
      await adapter.sendPortalInvite(request.customer_id);
      showToast(`Einladung wurde an ${request.email} gesendet.`);
    } else {
      await adapter.processPortalRequest(id, action);
      await refresh();
      showToast(action === "accept" ? "Anfrage akzeptiert. Kundenprofil wurde erstellt." : "Anfrage abgelehnt.");
    }
  } catch (error) { showToast(error.message || "Anfrage konnte nicht verarbeitet werden.", "error"); }
  finally { button.disabled = false; }
}

content.addEventListener("click", (event) => {
  const create = event.target.closest("[data-create]"); if (create) openEditor(create.dataset.create);
  const view = event.target.closest("[data-view]"); if (view) setView(view.dataset.view);
  const filter = event.target.closest("[data-filter]"); if (filter) { state.filter = filter.dataset.filter; render(); }
  const edit = event.target.closest("[data-edit]"); if (edit) { const collections = { customer: state.data.customers, project: state.data.projects, invoice: state.data.invoices }; openEditor(edit.dataset.edit, collections[edit.dataset.edit].find((item) => item.id === edit.dataset.id)); }
  const action = event.target.closest("[data-invoice-action]"); if (action) invoiceAction(action.dataset.id, action.dataset.invoiceAction, action);
  const requestAction = event.target.closest("[data-portal-request-action]"); if (requestAction) portalRequestAction(requestAction.dataset.id, requestAction.dataset.portalRequestAction, requestAction);
  const remove = event.target.closest("[data-delete-record]"); if (remove) deleteRecord(remove.dataset.deleteRecord, remove.dataset.id, remove);
});
content.addEventListener("input", (event) => { if (event.target.matches("[data-search]")) { state.query = event.target.value; const position = event.target.selectionStart; render(); const next = document.querySelector("[data-search]"); next.focus(); next.setSelectionRange(position, position); } });
dialogBody.addEventListener("click", (event) => { if (event.target.closest("[data-add-item]")) addInvoiceItem(); if (event.target.closest("[data-add-discount]")) addInvoiceItem(null, "discount"); if (event.target.closest("[data-remove-item]")) { if (document.querySelectorAll(".invoice-item").length > 1) event.target.closest(".invoice-item").remove(); updateInvoiceTotal(); } });
dialogBody.addEventListener("input", (event) => { if (event.target.matches('[name="item_quantity"],[name="item_price"],[name="discount_value"],[name="tax_rate"]')) updateInvoiceTotal(); });
dialogBody.addEventListener("change", (event) => { if (event.target.matches('[name="customer_id"]') && dialogForm.dataset.type === "invoice") { const projects = dialogForm.elements.project_id; projects.innerHTML = `<option value="">Kein Projekt</option>${projectOptions(event.target.value)}`; } });
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
