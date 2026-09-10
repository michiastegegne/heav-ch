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
const topbarCreate = document.querySelector(".topbar .primary-action");
const workspace = document.querySelector(".workspace");
const navMenuButton = document.querySelector("[data-open-nav]");
const actionConfirmDialog = document.querySelector("#action-confirm-dialog");
const actionConfirmKicker = document.querySelector("#action-confirm-kicker");
const actionConfirmTitle = document.querySelector("#action-confirm-title");
const actionConfirmCopy = document.querySelector("#action-confirm-copy");
const actionConfirmButton = document.querySelector("#action-confirm-button");
let navRestoreFocus = null;

const viewNames = {
  dashboard: "Übersicht",
  customers: "Kunden",
  projects: "Projekte",
  invoices: "Rechnungen",
  offers: "Offerten",
  settings: "Einstellungen",
  "portal-requests": "Portal-Anfragen",
};
const state = { view: "dashboard", query: "", filter: "all", selectedProjectId: null, data: null, supabase: null, sendRequestKeys: new Map() };
const esc = (value = "") => String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
const formatDate = (value) => value ? new Intl.DateTimeFormat("de-CH").format(new Date(`${value}T12:00:00`)) : "–";
const today = () => new Date().toISOString().slice(0, 10);
const plusDays = (date, days) => { const result = new Date(`${date}T12:00:00`); result.setDate(result.getDate() + days); return result.toISOString().slice(0, 10); };
const formatReference = (value = "") => String(value).replace(/\s+/g, "").replace(/(.{4})(?=.)/g, "$1 ");
const normalizeVatNumber = (value = "") => String(value).trim().toUpperCase();
const validVatNumber = (value = "") => /^CHE-\d{3}\.\d{3}\.\d{3} (MWST|TVA|IVA)$/.test(normalizeVatNumber(value));


function showToast(message, tone = "default") {
  toast.className = "toast";
  toast.textContent = message;
  toast.style.borderLeft = `4px solid ${tone === "error" ? "#ff5b35" : "#d7ff38"}`;
  toast.hidden = false;
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => { toast.hidden = true; }, 4200);
}

function showDispatchSuccess(title = "Rechnung versendet", copy = "Der sichere Versand wurde bestätigt.") {
  toast.className = "toast is-dispatch-success";
  toast.style.borderLeft = "4px solid #d7ff38";
  toast.innerHTML = `<span class="dispatch-plane" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><path d="M21 3 10 14"/><path d="m21 3-7 18-4-7-7-4Z"/></svg></span><span><strong>${esc(title)}</strong><small>${esc(copy)}</small></span><span class="dispatch-check" aria-hidden="true">✓</span>`;
  toast.hidden = false;
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => { toast.hidden = true; }, 4200);
}

function confirmAction({ kicker = "BESTÄTIGEN", title, copy, confirmLabel = "Bestätigen", destructive = false }) {
  actionConfirmKicker.textContent = kicker;
  actionConfirmTitle.textContent = title;
  actionConfirmCopy.textContent = copy;
  actionConfirmButton.textContent = confirmLabel;
  actionConfirmButton.classList.toggle("is-destructive", destructive);
  return new Promise((resolve) => {
    actionConfirmDialog.addEventListener("close", () => resolve(actionConfirmDialog.returnValue === "confirm"), { once: true });
    actionConfirmDialog.showModal();
    requestAnimationFrame(() => actionConfirmButton.focus({ preventScroll: true }));
  });
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
      const [customers, projects, invoices, offers, settings, portalRequests] = await Promise.all([
        supabase.from("customers").select("*").order("company"),
        supabase.from("projects").select("*").order("created_at", { ascending: false }),
        supabase.from("invoices").select("*, invoice_items(*)").order("issue_date", { ascending: false }),
        supabase.from("offers").select("*, offer_items(*) ").order("issue_date", { ascending: false }),
        supabase.from("company_settings").select("*").maybeSingle(),
        supabase.from("customer_portal_requests").select("*").order("created_at", { ascending: false }),
      ]);
      [customers, projects, invoices, offers, settings, portalRequests].forEach((result) => fail(result.error));
      const normalizedInvoices = invoices.data.map((invoice) => ({ ...invoice, items: invoice.invoice_items || [] }));
      const normalizedOffers = (offers.data || []).map((offer) => ({ ...offer, items: offer.offer_items || [] }));
      return joinedData({ customers: customers.data, projects: projects.data, invoices: normalizedInvoices, offers: normalizedOffers, settings: settings.data || {}, portalRequests: portalRequests.data || [] });
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
    async saveOffer(payload) {
      const result = await supabase.rpc("create_offer", {
        p_customer_id: payload.customer_id,
        p_project_id: payload.project_id,
        p_title: payload.title,
        p_issue_date: payload.issue_date,
        p_valid_until: payload.valid_until,
        p_tax_rate: payload.tax_rate,
        p_notes: payload.notes,
        p_terms: payload.terms,
        p_items: payload.items,
      });
      fail(result.error);
      return Array.isArray(result.data) ? result.data[0] : result.data;
    },
    async shareOffer(id) { const result = await supabase.rpc("share_customer_offer", { p_offer_id: id }); fail(result.error); },
    async sendOffer(id) {
      const { data, error } = await supabase.functions.invoke("offer-send", { body: { offerId: id } });
      if (error) {
        const details = await error.context?.json?.().catch(() => null);
        throw new Error(details?.error || "Offerte konnte nicht per E-Mail gesendet werden.");
      }
      return data;
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
const actionIcons = {
  edit: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14.5 4.5 5 5M4 20l3.8-.8L19.5 7.5a2.1 2.1 0 0 0-3-3L4.8 16.2 4 20Z"/></svg>',
  "paper-plane": '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m21 3-7.4 18-4.2-7-6.4-3.7L21 3Z"/><path d="m9.4 14 4.2-4.2"/></svg>',
  document: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v5h5M9 13h6M9 17h6"/></svg>',
  paid: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4.2 4.2L19.5 6"/></svg>',
  cancel: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>',
  trash: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3m-9 0 1 13h10l1-13M10 11v5m4-5v5"/></svg>',
  link: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.1.1l2-2a5 5 0 0 0-7.1-7.1l-1.2 1.2"/><path d="M14 11a5 5 0 0 0-7.1-.1l-2 2A5 5 0 0 0 12 20l1.2-1.2"/></svg>',
  "customer-contact": '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.3"/><path d="M4.5 20c.8-3.6 3.2-5.6 7.5-5.6s6.7 2 7.5 5.6"/></svg>',
};
function actionIconButton(icon, label, attributes, tone = "") {
  return `<button class="action-icon ${esc(tone)}" type="button" ${attributes} aria-label="${esc(label)}" title="${esc(label)}"><span class="sr-only">${esc(label)}</span>${actionIcons[icon]}</button>`;
}
function contactMark() { return `<span class="customer-contact" title="Kunde" aria-label="Kunde">${actionIcons["customer-contact"]}</span>`; }

function renderDashboard() {
  const { customers, projects, invoices, offers = [] } = state.data;
  const activeProjects = projects.filter((item) => ["planning", "active"].includes(item.status));
  const focusProject = [...activeProjects].sort((a, b) => String(a.due_date || "9999-12-31").localeCompare(String(b.due_date || "9999-12-31")))[0];
  const openInvoices = invoices.filter((item) => ["sent", "overdue"].includes(item.status));
  const openTotal = openInvoices.reduce((sum, item) => sum + item.total_rappen, 0);
  const openOffers = offers.filter((item) => ["draft", "sent"].includes(item.status));
  const offerTotal = openOffers.reduce((sum, item) => sum + (item.total_rappen || 0), 0);
  const paidThisYear = invoices.filter((item) => item.status === "paid" && item.issue_date?.startsWith(String(new Date().getFullYear()))).reduce((sum, item) => sum + item.total_rappen, 0);
  const recent = [...invoices].slice(0, 4);
  const projectInvoices = focusProject ? invoices.filter((item) => item.project_id === focusProject.id && item.status !== "cancelled") : [];
  const projectCustomer = focusProject?.customer || customers.find((item) => item.id === focusProject?.customer_id);
  const projectOpenInvoices = projectInvoices.filter((item) => ["draft", "sent", "overdue"].includes(item.status));
  const projectInvoiced = projectInvoices.reduce((sum, item) => sum + (item.total_rappen || 0), 0);
  const productionRows = [...activeProjects].sort((a, b) => String(a.due_date || "9999-12-31").localeCompare(String(b.due_date || "9999-12-31"))).slice(0, 3);
  const focusSurface = focusProject
    ? `<article class="dashboard-focus">
        <div class="dashboard-focus-head"><div><span class="kicker">IM FOKUS</span><h3>${esc(focusProject.title)}</h3><p>${esc(focusProject.description || "Produktion, Kunde und Geldfluss bleiben in einem klaren Kontext.")}</p></div><span class="status ${esc(focusProject.status)}">${esc(statusLabel(focusProject.status))}</span></div>
        <div class="dashboard-focus-modules">
          <div><span>KUNDE</span><strong>${esc(customerLabel(projectCustomer))}</strong><small>${esc(projectCustomer?.email || "E-Mail noch offen")}</small></div>
          <div><span>DEADLINE</span><strong>${formatDate(focusProject.due_date)}</strong><small>${focusProject.start_date ? `Start ${formatDate(focusProject.start_date)}` : "Start offen"}</small></div>
          <div><span>GELDFLUSS</span><strong>${formatCHF(projectInvoiced)}</strong><small>${projectOpenInvoices.length ? `${projectOpenInvoices.length} offen` : "Keine offene Rechnung"}</small></div>
        </div>
        <footer class="dashboard-focus-footer"><button class="project-module-link" type="button" data-dashboard-project-focus="${esc(focusProject.id)}">Projekt-Canvas öffnen <span aria-hidden="true">→</span></button><div><button class="secondary-button" type="button" data-create="offer" data-project-id="${esc(focusProject.id)}">Offerte</button><button class="primary-action" type="button" data-create="invoice" data-project-id="${esc(focusProject.id)}">Rechnung <span aria-hidden="true">+</span></button></div></footer>
      </article>`
    : `<article class="dashboard-focus dashboard-focus--empty"><div><span class="kicker">PRODUKTION</span><h3>Der nächste klare Schritt.</h3><p>Lege ein Projekt an. Danach bündelt HEAV Kunde, Budget, Offerte und Rechnung an einem Ort.</p></div><button class="primary-action" type="button" data-create="project">Projekt anlegen <span aria-hidden="true">+</span></button></article>`;
  return `<section class="view dashboard-view">
    <header class="dashboard-intro"><div><span class="kicker">HEAV STUDIO</span><h2>Everything,<br><em>in its place.</em></h2></div><p>Ein ruhiger Überblick für laufende Produktionen, Kundenbeziehungen und den nächsten finanziellen Schritt.</p></header>
    <section class="dashboard-stage">${focusSurface}<aside class="dashboard-money"><span class="kicker">MONEY FLOW</span><strong>${formatCHF(openTotal)}</strong><p>${openInvoices.length ? `${openInvoices.length} Rechnung${openInvoices.length === 1 ? "" : "en"} wartet auf Zahlung.` : "Keine offene Rechnung im Moment."}</p><div class="dashboard-money-list"><div><span>In Pipeline</span><b>${formatCHF(offerTotal)}</b></div><div><span>Offene Offerten</span><b>${openOffers.length}</b></div><div><span>Bezahlt dieses Jahr</span><b>${formatCHF(paidThisYear)}</b></div></div><button class="project-module-link" type="button" data-view="invoices">Rechnungen öffnen <span aria-hidden="true">→</span></button></aside></section>
    <div class="metric-grid dashboard-metrics">${metric("Kunden", customers.length)}${metric("Aktive Produktionen", activeProjects.length)}${metric("Offene Forderungen", formatCHF(openTotal))}${metric("In Pipeline", formatCHF(offerTotal))}</div>
    <section class="dashboard-grid"><section class="panel dashboard-panel"><div class="panel-head"><div><span class="kicker">RECHNUNGEN</span><h3>Letzte Bewegungen</h3></div><button class="text-button" data-view="invoices">Alle ansehen</button></div><div class="activity-list">${recent.length ? recent.map((invoice) => `<article class="activity-row"><div><strong>${esc(invoice.invoice_number)}</strong><span>${esc(invoice.customer?.company || "Ohne Kunde")} · ${formatDate(invoice.issue_date)}</span></div><div><strong>${formatCHF(invoice.total_rappen)}</strong><span class="status ${esc(invoice.status)}">${esc(statusLabel(invoice.status))}</span></div></article>`).join("") : `<p>Noch keine Rechnungen.</p>`}</div></section>
    <aside class="panel dashboard-panel dashboard-productions"><div class="panel-head"><div><span class="kicker">PRODUKTIONEN</span><h3>Was als Nächstes zählt</h3></div><button class="text-button" data-view="projects">Alle öffnen</button></div><div class="dashboard-production-list">${productionRows.length ? productionRows.map((project) => `<button class="dashboard-production-row" type="button" data-dashboard-project-focus="${esc(project.id)}"><span class="status ${esc(project.status)}">${esc(statusLabel(project.status))}</span><strong>${esc(project.title)}</strong><small>${esc(project.customer?.company || "Ohne Kunde")} · ${project.due_date ? `Deadline ${formatDate(project.due_date)}` : "Deadline offen"}</small><b aria-hidden="true">→</b></button>`).join("") : `<div class="dashboard-empty-copy"><strong>Noch keine laufende Produktion.</strong><span>Lege ein Projekt an, wenn ein Auftrag konkret wird.</span></div>`}</div><div class="dashboard-quick-actions"><button class="secondary-button" type="button" data-create="customer">Kunde</button><button class="secondary-button" type="button" data-create="project">Projekt</button><button class="primary-action" type="button" data-create="invoice">Rechnung <span aria-hidden="true">+</span></button></div></aside></section>
  </section>`;
}

function filtered(items, fields) { const query = state.query.trim().toLowerCase(); return items.filter((item) => !query || fields.some((field) => String(item[field] || "").toLowerCase().includes(query))); }
function toolbar(type, placeholder, filters = []) { return `<div class="toolbar"><label class="search-field"><span class="sr-only">Suchen</span><input type="search" data-search placeholder="${esc(placeholder)}" value="${esc(state.query)}"></label>${filters.length ? `<div class="filter-tabs">${filters.map(([value,label]) => `<button class="filter-tab ${state.filter === value ? "is-active" : ""}" data-filter="${value}">${label}</button>`).join("")}</div>` : ""}</div>`; }
function filterToolbar(placeholder, filters) { return `<div class="toolbar"><label class="search-field"><span class="sr-only">Suchen</span><input type="search" data-search placeholder="${esc(placeholder)}" value="${esc(state.query)}"></label><div class="filter-tabs">${filters.map(([value,label]) => `<button class="filter-tab ${state.filter === value ? "is-active" : ""}" data-filter="${value}">${label}</button>`).join("")}</div></div>`; }

function renderCustomers() {
  const items = filtered(state.data.customers, ["company", "contact_name", "email", "city"]);
  if (!state.data.customers.length) return `<section class="view">${emptyState("Der erste Kontakt.", "Erfasse deinen ersten Kunden und verknüpfe danach Projekte und Rechnungen.", "customer")}</section>`;
  const rows = items.map((item) => `<tr><td><strong class="customer-name">${contactMark()}${esc(customerLabel(item))}</strong><small>${esc(item.company && item.contact_name ? item.contact_name : item.company ? "" : "Privatkunde")}</small></td><td>${esc(item.email || "–")}</td><td>${esc(item.phone || "–")}</td><td>${esc([item.postal_code,item.city].filter(Boolean).join(" ") || "–")}</td><td><div class="table-actions">${actionIconButton("edit", "Bearbeiten", `data-edit="customer" data-id="${esc(item.id)}"`)}${actionIconButton("trash", `Kunde löschen: ${customerLabel(item)}`, `data-delete-record="customer" data-id="${esc(item.id)}"`, "is-danger")}</div></td></tr>`).join("");
  const cards = items.map((item) => `<article class="mobile-card"><div><strong class="customer-name">${contactMark()}${esc(customerLabel(item))}</strong><small>${esc(item.company && item.contact_name ? item.contact_name : item.company ? "" : "Privatkunde")} · ${esc(item.email || "Keine E-Mail")}</small><div class="table-actions">${actionIconButton("edit", "Bearbeiten", `data-edit="customer" data-id="${esc(item.id)}"`)}${actionIconButton("trash", `Kunde löschen: ${customerLabel(item)}`, `data-delete-record="customer" data-id="${esc(item.id)}"`, "is-danger")}</div></div><span>${esc(item.city || "")}</span></article>`).join("");
  return `<section class="view">${toolbar("customer", "Kunden durchsuchen …")}<table class="data-table"><thead><tr><th>Kunde</th><th>E-Mail</th><th>Telefon</th><th>Ort</th><th>Aktionen</th></tr></thead><tbody>${rows}</tbody></table><div class="mobile-card-list">${cards}</div></section>`;
}

function renderProjectCanvas(project) {
  const invoices = state.data.invoices.filter((item) => item.project_id === project.id && item.status !== "cancelled");
  const offers = (state.data.offers || []).filter((item) => item.project_id === project.id);
  const openInvoices = invoices.filter((item) => ["draft", "sent", "overdue"].includes(item.status));
  const invoicedTotal = invoices.reduce((sum, item) => sum + (item.total_rappen || 0), 0);
  const customer = project.customer || state.data.customers.find((item) => item.id === project.customer_id);
  const productionDetail = [project.start_date ? `Start ${formatDate(project.start_date)}` : "Start offen", project.due_date ? `Deadline ${formatDate(project.due_date)}` : "Keine Deadline"].join(" · ");
  return `<section class="project-canvas" aria-label="Projekt-Canvas">
    <header class="project-canvas-head">
      <div><span class="kicker">PROJEKT-CANVAS</span><h3>${esc(project.title)}</h3><p>${esc(project.description || "Ein klarer Ort für Produktion, Kunde und finanzielle Schritte.")}</p></div>
      ${actionIconButton("edit", `Projekt bearbeiten: ${project.title}`, `data-edit="project" data-id="${esc(project.id)}"`)}
    </header>
    <div class="project-module-grid">
      <article class="project-module project-module--production"><span class="project-module-index">01</span><div><span class="project-module-label">PRODUKTION</span><strong><span class="status ${esc(project.status)}">${esc(statusLabel(project.status))}</span></strong><p>${esc(productionDetail)}</p></div></article>
      <article class="project-module"><span class="project-module-index">02</span><div><span class="project-module-label">KUNDE</span><strong>${esc(customerLabel(customer))}</strong><p>${esc(customer?.email || "E-Mail noch offen")}</p><button class="project-module-link" type="button" data-view="customers">Kunden öffnen <span aria-hidden="true">→</span></button></div></article>
      <article class="project-module"><span class="project-module-index">03</span><div><span class="project-module-label">FINANZEN</span><strong>${formatCHF(invoicedTotal)}</strong><p>${openInvoices.length ? `${openInvoices.length} offene Rechnung${openInvoices.length === 1 ? "" : "en"}` : invoices.length ? `${invoices.length} Rechnung${invoices.length === 1 ? "" : "en"} abgeschlossen` : "Noch keine Rechnung"}</p><button class="project-module-link" type="button" data-view="invoices">Rechnungen öffnen <span aria-hidden="true">→</span></button></div></article>
      <article class="project-module project-module--next"><span class="project-module-index">04</span><div><span class="project-module-label">NÄCHSTER SCHRITT</span><strong>${offers.length ? "Offerte oder Rechnung ergänzen" : "Offerte vorbereiten"}</strong><div class="project-canvas-actions"><button class="secondary-button" type="button" data-create="offer" data-project-id="${esc(project.id)}">Offerte</button><button class="primary-action" type="button" data-create="invoice" data-project-id="${esc(project.id)}">Rechnung <span aria-hidden="true">+</span></button></div></div></article>
    </div>
  </section>`;
}

function renderProjects() {
  const all = state.data.projects;
  const items = filtered(all.filter((item) => state.filter === "all" || item.status === state.filter), ["title", "description"]);
  if (!all.length) return `<section class="view">${emptyState("From idea to frame.", "Lege das erste Projekt an und halte Status, Kunde und Budget im Blick.", "project")}</section>`;
  const selected = items.find((item) => item.id === state.selectedProjectId) || items[0] || null;
  if (selected) state.selectedProjectId = selected.id;
  const rows = items.map((item) => `<tr class="${item.id === state.selectedProjectId ? "is-selected" : ""}"><td><button class="project-record" type="button" data-project-focus="${esc(item.id)}" aria-pressed="${String(item.id === state.selectedProjectId)}"><strong>${esc(item.title)}</strong><small>${esc(item.customer?.company || "Ohne Kunde")}</small></button></td><td><span class="status ${esc(item.status)}">${esc(statusLabel(item.status))}</span></td><td>${formatDate(item.due_date)}</td><td>${formatCHF(item.budget_rappen || 0)}</td><td><div class="table-actions">${actionIconButton("edit", "Bearbeiten", `data-edit="project" data-id="${esc(item.id)}"`)}${actionIconButton("trash", `Projekt löschen: ${item.title}`, `data-delete-record="project" data-id="${esc(item.id)}"`, "is-danger")}</div></td></tr>`).join("");
  const cards = items.map((item) => `<article class="mobile-card ${item.id === state.selectedProjectId ? "is-selected" : ""}"><div><button class="project-record" type="button" data-project-focus="${esc(item.id)}" aria-pressed="${String(item.id === state.selectedProjectId)}"><strong>${esc(item.title)}</strong><small>${esc(item.customer?.company || "Ohne Kunde")} · ${formatDate(item.due_date)}</small></button><div class="table-actions">${actionIconButton("edit", "Bearbeiten", `data-edit="project" data-id="${esc(item.id)}"`)}${actionIconButton("trash", `Projekt löschen: ${item.title}`, `data-delete-record="project" data-id="${esc(item.id)}"`, "is-danger")}</div></div><span class="status ${esc(item.status)}">${esc(statusLabel(item.status))}</span></article>`).join("");
  return `<section class="view"><div class="project-view-intro"><div><span class="kicker">PROJEKTE</span><h2>One project.<br><em>One clear picture.</em></h2></div><p>Jede Produktion erhält ihren eigenen Canvas. Sichtbar bleibt nur, was als Nächstes relevant ist: Kunde, Status und Geldfluss.</p></div>${toolbar("project", "Projekte durchsuchen …", [["all","Alle"],["planning","Planung"],["active","Aktiv"],["completed","Abgeschlossen"]])}${selected ? renderProjectCanvas(selected) : `<div class="empty-state"><h3>Keine Projekte in diesem Filter.</h3><p>Wähle einen anderen Status oder passe die Suche an.</p></div>`}<div class="project-register"><div class="panel-head"><h3>PROJEKTREGISTER</h3><span>${items.length} ${items.length === 1 ? "Projekt" : "Projekte"}</span></div><table class="data-table"><thead><tr><th>Projekt</th><th>Status</th><th>Deadline</th><th>Budget</th><th>Aktionen</th></tr></thead><tbody>${rows}</tbody></table><div class="mobile-card-list">${cards}</div></div></section>`;
}

function invoiceActions(invoice) {
  const buttons = [actionIconButton("edit", "Bearbeiten", `data-edit="invoice" data-id="${esc(invoice.id)}"`)];
  if (!invoice.is_legacy && invoice.status !== "cancelled") buttons.push(actionIconButton("document", "PDF herunterladen", `data-invoice-action="download" data-id="${esc(invoice.id)}"`));
  if (!invoice.is_legacy && ["draft", "sent", "overdue"].includes(invoice.status)) buttons.push(actionIconButton("paper-plane", "Rechnung senden", `data-invoice-action="send" data-id="${esc(invoice.id)}"`));
  if (!invoice.is_legacy && ["sent", "overdue"].includes(invoice.status)) buttons.push(actionIconButton("paid", "Als bezahlt markieren", `data-invoice-action="mark_paid" data-id="${esc(invoice.id)}"`), actionIconButton("cancel", "Rechnung stornieren", `data-invoice-action="cancel" data-id="${esc(invoice.id)}"`, "is-danger"));
  if (!invoice.is_legacy && invoice.status === "draft") buttons.push(actionIconButton("trash", "Rechnung löschen", `data-delete-record="invoice" data-id="${esc(invoice.id)}"`, "is-danger"));
  return `<div class="table-actions">${buttons.join("")}</div>`;
}
function renderInvoices() {
  const all = state.data.invoices;
  const items = filtered(all.filter((item) => state.filter === "all" || item.status === state.filter), ["invoice_number"]);
  if (!all.length) return `<section class="view">${emptyState("Ready to invoice.", "Erstelle deine erste HEAV-Rechnung als PDF und sende sie direkt an den Kunden.", "invoice")}</section>`;
  const rows = items.map((item) => `<tr><td><strong>${esc(item.invoice_number)}</strong><small>${formatDate(item.issue_date)} · ${item.is_legacy ? "Historisch archiviert" : esc(formatReference(item.payment_reference))}</small></td><td>${esc(item.customer?.company || "Ohne Kunde")}</td><td><span class="status ${esc(item.status)}">${esc(statusLabel(item.status))}</span></td><td><strong>${formatCHF(item.total_rappen)}</strong><small>fällig ${formatDate(item.due_date)}</small></td><td>${invoiceActions(item)}</td></tr>`).join("");
  const cards = items.map((item) => `<article class="mobile-card"><div><strong>${esc(item.invoice_number)} · ${formatCHF(item.total_rappen)}</strong><small>${esc(item.customer?.company || "Ohne Kunde")} · fällig ${formatDate(item.due_date)}</small>${invoiceActions(item)}</div><span class="status ${esc(item.status)}">${esc(statusLabel(item.status))}</span></article>`).join("");
  return `<section class="view">${toolbar("invoice", "Rechnungen durchsuchen …", [["all","Alle"], ...["draft","sent","paid","overdue","cancelled"].map((status) => [status,statusLabel(status)])])}<table class="data-table"><thead><tr><th>Rechnung</th><th>Kunde</th><th>Status</th><th>Total</th><th>Aktionen</th></tr></thead><tbody>${rows}</tbody></table><div class="mobile-card-list">${cards}</div></section>`;
}

function renderOffers() {
  const all = state.data.offers || [];
  if (!all.length) return `<section class="view">${emptyState("Offerte erstellen.", "Erstelle eine Offerte, kopiere danach ihren geschützten Kundenportal-Link und teile ihn mit deinem Kunden.", "offer")}</section>`;
  const rows = all.map((offer) => `<tr><td><strong>${esc(offer.offer_number)}</strong><small>${esc(offer.title)} · gültig bis ${formatDate(offer.valid_until)}</small></td><td>${esc(offer.customer?.company || customerLabel(state.data.customers.find((customer) => customer.id === offer.customer_id)))}</td><td><span class="status ${esc(offer.status)}">${esc(statusLabel(offer.status))}</span></td><td><strong>${formatCHF(offer.total_rappen)}</strong></td><td><div class="table-actions">${["draft", "sent"].includes(offer.status) ? actionIconButton("paper-plane", offer.status === "draft" ? "Offerte per E-Mail senden" : "Offerte erneut per E-Mail senden", `data-send-offer="${esc(offer.id)}"`) : ""}${actionIconButton("link", "Link kopieren", `data-copy-offer="${esc(offer.id)}"`)}</div></td></tr>`).join("");
  return `<section class="view">${toolbar("offer", "Offerten durchsuchen …", [["all", "Alle"], ["draft", "Entwürfe"], ["sent", "Offen"], ["accepted", "Angenommen"], ["expired", "Abgelaufen"]])}<table class="data-table"><thead><tr><th>Offerte</th><th>Kunde</th><th>Status</th><th>Total</th><th>Aktionen</th></tr></thead><tbody>${rows}</tbody></table></section>`;
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
  const cards = items.map((item) => `<article class="mobile-card portal-request-card"><div><strong>${esc(item.company || item.contact_name)}</strong><small>${esc(item.contact_name)} · ${esc(item.email)}</small>${item.phone ? `<small>${esc(item.phone)}</small>` : ""}${item.message ? `<p>${esc(item.message)}</p>` : ""}${actions(item)}</div><span class="status ${esc(item.status === "pending" ? "draft" : item.status === "accepted" ? "paid" : "cancelled")}">${esc(item.status === "pending" ? "Offen" : item.status === "accepted" ? "Akzeptiert" : "Abgelehnt")}</span></article>`).join("");
  return `<section class="view"><div class="hero-row"><h2>Neue Zugänge,<br><em>klar geprüft.</em></h2><p>Beim Akzeptieren wird automatisch ein Kundenprofil erstellt. Der Portalzugang wird erst mit der anschliessenden Einladung freigeschaltet.</p></div>${filterToolbar("Anfragen durchsuchen …", [["all","Alle"],["pending","Offen"],["accepted","Akzeptiert"],["declined","Abgelehnt"]])}<table class="data-table"><thead><tr><th>Anfrage</th><th>E-Mail</th><th>Telefon</th><th>Nachricht</th><th>Aktion</th></tr></thead><tbody>${rows}</tbody></table><div class="mobile-card-list portal-request-cards">${cards}</div></section>`;
}

function renderSettings() {
  const settings = state.data.settings || {};
  return `<section class="view"><div class="hero-row"><h2>Business,<br><em>set clearly.</em></h2><p>Diese Angaben erscheinen auf deinen Rechnungen und in den Rechnungs-E-Mails. Ohne MWST-Nummer berechnet das System automatisch keine MWST.</p></div><div class="settings-grid"><article class="settings-card"><h3>Rechnungsabsender</h3><p>Rechtliche und finanzielle Angaben für alle PDF-Rechnungen.</p><div class="settings-list"><div><span>Firma</span><strong>${esc(settings.company_name || "HEAV")}</strong></div><div><span>Inhaber</span><strong>${esc(settings.owner_name || "Michias Tegegne")}</strong></div><div><span>E-Mail</span><strong>${esc(settings.email || "hello@heav.ch")}</strong></div><div><span>MWST</span><strong>${esc(settings.vat_number || "Nicht MWST-pflichtig")}</strong></div><div><span>IBAN</span><strong>${esc(settings.iban || "Noch offen")}</strong></div></div><button class="primary-action" data-create="settings" style="margin-top:24px">Angaben bearbeiten</button></article><article class="settings-card"><h3>Systemstatus</h3><p>Der Adminbereich nutzt einen getrennten, geschützten Backend-Zugang.</p><div class="settings-list"><div><span>Modus</span><strong>Produktion</strong></div><div><span>Datenbank</span><strong>Supabase RLS</strong></div><div><span>Rechnungsversand</span><strong>billing@heav.ch</strong></div><div><span>Website</span><strong>heav.ch</strong></div></div></article></div></section>`;
}

const renderers = { dashboard: renderDashboard, customers: renderCustomers, projects: renderProjects, invoices: renderInvoices, offers: renderOffers, settings: renderSettings, "portal-requests": renderPortalRequests };
const topbarActions = {
  dashboard: ["invoice", "Neue Rechnung"],
  customers: ["customer", "Kunde erfassen"],
  projects: ["project", "Projekt anlegen"],
  invoices: ["invoice", "Neue Rechnung"],
  offers: ["offer", "Neue Offerte"],
};
function syncTopbarAction() {
  const action = topbarActions[state.view];
  topbarCreate.hidden = !action;
  if (!action) return;
  const [type, label] = action;
  topbarCreate.dataset.create = type;
  topbarCreate.setAttribute("aria-label", label);
  topbarCreate.innerHTML = `${label} <span aria-hidden="true">+</span>`;
}
function render() { title.textContent = viewNames[state.view]; syncTopbarAction(); content.innerHTML = renderers[state.view](); content.focus({ preventScroll: true }); }
async function refresh() { state.data = await adapter.loadAll(); render(); }
function navigationFocusable() { return [...document.querySelectorAll("#sidebar a[href],#sidebar button:not([disabled])")].filter((element) => element.getClientRects().length); }
function setNavigationOpen(open, { restoreFocus = true } = {}) {
  const isOpen = Boolean(open);
  shell.classList.toggle("nav-open", isOpen);
  navMenuButton.setAttribute("aria-expanded", String(isOpen));
  workspace.inert = isOpen;
  if (isOpen) {
    navRestoreFocus = document.activeElement;
    requestAnimationFrame(() => document.querySelector(".nav-link.is-active")?.focus());
  } else if (restoreFocus && navRestoreFocus === navMenuButton) {
    navMenuButton.focus({ preventScroll: true });
  }
}

function setView(view) { state.view = view; state.query = ""; state.filter = "all"; document.querySelectorAll(".nav-link").forEach((item) => item.classList.toggle("is-active", item.dataset.view === view)); setNavigationOpen(false, { restoreFocus: false }); render(); }

function customerOptions(selected = "") { return state.data.customers.map((item) => `<option value="${esc(item.id)}" ${item.id === selected ? "selected" : ""}>${esc(customerLabel(item))}</option>`).join(""); }
function projectOptions(customerId = "", selected = "") { return state.data.projects.filter((item) => item.customer_id === customerId).map((item) => `<option value="${esc(item.id)}" ${item.id === selected ? "selected" : ""}>${esc(item.title)}</option>`).join(""); }
function field(label, name, type = "text", value = "", wide = false, extra = "") { return `<label class="form-field ${wide ? "wide" : ""}"><span>${esc(label)}</span><input type="${type}" name="${name}" value="${esc(value)}" ${extra}></label>`; }
function openEditor(type, existing = null, context = {}) {
  const contextProject = context.projectId ? state.data.projects.find((item) => item.id === context.projectId) : null;
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
    const customerId = item.customer_id || contextProject?.customer_id || "";
    const projectId = item.project_id || contextProject?.id || "";
    dialogBody.innerHTML = `<div class="form-grid"><label class="form-field"><span>Kunde *</span><select name="customer_id" required><option value="">Bitte wählen</option>${customerOptions(customerId)}</select></label><label class="form-field"><span>Projekt</span><select name="project_id"><option value="">Kein Projekt</option>${projectOptions(customerId,projectId)}</select></label>${existing ? `<label class="form-field wide"><span>Versand- und Zahlungsstatus · auch für manuell versandte PDFs</span><select name="status">${["draft","sent","paid","overdue","cancelled"].map((status) => `<option value="${status}" ${item.status === status ? "selected" : ""}>${statusLabel(status)}</option>`).join("")}</select></label>` : ""}${!existing ? `<div class="sequence-note wide"><strong>Automatische Referenz</strong><span>Die Zahlungsreferenz wird beim Speichern fortlaufend und buchhaltungssicher vergeben.</span></div>` : ""}${field(vatRegistered ? "MWST %" : "MWST % · nicht registriert","tax_rate","number",item.tax_rate ?? (vatRegistered ? (state.data.settings?.default_tax_rate ?? 0) : 0),false,vatRegistered ? 'min="0" step="0.1"' : 'readonly aria-readonly="true"')}${field("Rechnungsdatum *","issue_date","date",item.issue_date || today(),false,"required")}${field("Fällig am *","due_date","date",item.due_date || plusDays(today(),state.data.settings?.default_due_days || 30),false,"required")}<div class="invoice-items"><span class="items-label">Positionen *</span><div id="invoice-item-list"></div><div class="invoice-add-actions"><button class="secondary-button" type="button" data-add-item>Position hinzufügen</button><button class="secondary-button" type="button" data-add-discount>Rabatt hinzufügen</button></div></div><label class="form-field wide"><span>Hinweis auf Rechnung</span><textarea name="notes">${esc(item.notes || "")}</textarea></label><div class="invoice-total" id="invoice-total">TOTAL&nbsp;&nbsp; CHF 0.00</div></div>`;
    (existing ? item.items : [null]).forEach((invoiceItem) => addInvoiceItem(invoiceItem));
  } else if (type === "offer") {
    if (!state.data.customers.length) { showToast("Bitte zuerst einen Kunden erfassen.", "error"); setView("customers"); return; }
    const vatRegistered = validVatNumber(state.data.settings?.vat_number);
    dialogTitle.textContent = "Offerte erstellen";
    const customerId = contextProject?.customer_id || "";
    const projectId = contextProject?.id || "";
    const offerTitle = contextProject ? `Offerte · ${contextProject.title}` : "";
    dialogBody.innerHTML = `<div class="form-grid"><label class="form-field"><span>Kunde *</span><select name="customer_id" required><option value="">Bitte wählen</option>${customerOptions(customerId)}</select></label><label class="form-field"><span>Projekt</span><select name="project_id"><option value="">Kein Projekt</option>${projectOptions(customerId,projectId)}</select></label>${field("Titel *","title","text",offerTitle,true,"required")}${field(vatRegistered ? "MWST %" : "MWST % · nicht registriert","tax_rate","number",vatRegistered ? (state.data.settings?.default_tax_rate ?? 0) : 0,false,vatRegistered ? 'min="0" step="0.1"' : 'readonly aria-readonly="true"')}${field("Offertdatum *","issue_date","date",today(),false,"required")}${field("Gültig bis *","valid_until","date",plusDays(today(),30),false,"required")}<div class="invoice-items"><span class="items-label">Leistungen *</span><div id="invoice-item-list"></div><div class="invoice-add-actions"><button class="secondary-button" type="button" data-add-item>Position hinzufügen</button><button class="secondary-button" type="button" data-add-discount>Rabatt hinzufügen</button></div></div><label class="form-field wide"><span>Hinweis für den Kunden</span><textarea name="notes"></textarea></label><label class="form-field wide"><span>Verbindlichkeit bei Annahme *</span><textarea name="terms" required>Mit der Annahme dieser Offerte bestätigst du verbindlich die aufgeführten Leistungen, Beträge und Bedingungen.</textarea></label><div class="invoice-total" id="invoice-total">TOTAL&nbsp;&nbsp; CHF 0.00</div></div>`;
    addInvoiceItem();
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
  if (type === "offer") {
    const editorItems = readInvoiceEditorItems();
    const items = editorItems.map((item) => ({ description: item.description, quantity: item.quantity, unit_price_rappen: Math.round(item.unitPrice * 100) }));
    if (!data.customer_id || !data.title.trim() || !data.issue_date || !data.valid_until || data.valid_until < data.issue_date || !items.length) { formError.textContent = "Bitte Kunde, Titel, gültige Daten und mindestens eine Leistung ausfüllen."; return false; }
    await adapter.saveOffer({ customer_id: data.customer_id, project_id: data.project_id || null, title: data.title.trim(), issue_date: data.issue_date, valid_until: data.valid_until, tax_rate: Number(data.tax_rate || 0), notes: data.notes.trim(), terms: data.terms.trim(), items });
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
    if (!await confirmAction({ kicker: "RECHNUNG VERSENDEN", title: "Rechnung jetzt senden?", copy: `${current?.invoice_number || "Diese Rechnung"} über ${total} wird an ${recipient} gesendet.`, confirmLabel: "Jetzt senden" })) return;
  }
  if (action === "cancel" && !await confirmAction({ kicker: "RECHNUNG STORNIEREN", title: "Rechnung wirklich stornieren?", copy: `${current?.invoice_number || "Diese Rechnung"} kann danach weder versendet noch als bezahlt markiert werden.`, confirmLabel: "Stornieren", destructive: true })) return;
  button.disabled = true;
  try {
    const requestKey = action === "send" ? (state.sendRequestKeys.get(id) || crypto.randomUUID()) : null;
    if (requestKey) state.sendRequestKeys.set(id, requestKey);
    const result = await adapter.invoiceAction(id, action, requestKey);
    if (action === "send") state.sendRequestKeys.delete(id);
    if (action === "download") {
      const url = URL.createObjectURL(result); const link = document.createElement("a"); link.href = url; link.download = `${state.data.invoices.find((item) => item.id === id)?.invoice_number || "HEAV-Rechnung"}.pdf`; link.click(); URL.revokeObjectURL(url); showToast("PDF wurde erstellt.");
    } else if (action === "send") { showDispatchSuccess(); await refresh(); }
    else { showToast(action === "cancel" ? "Rechnung wurde storniert." : "Rechnung als bezahlt markiert."); await refresh(); }
  } catch (error) { showToast(error.message || "Aktion fehlgeschlagen.", "error"); }
  finally { button.disabled = false; }
}

async function deleteRecord(type, id, button) {
  const labels = { customer: "diesen Kunden", project: "dieses Projekt", invoice: "diesen Rechnungsentwurf" };
  if (!await confirmAction({ kicker: "LÖSCHEN", title: "Eintrag wirklich löschen?", copy: `Willst du ${labels[type]} wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.`, confirmLabel: "Löschen", destructive: true })) return;
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
  const question = action === "accept" ? `${label} wird akzeptiert und als Kundenprofil angelegt.` : action === "invite" ? `Die sichere Portal-Einladung wird an ${request?.email || "diese Adresse"} gesendet.` : `${label} wird abgelehnt.`;
  const options = action === "accept" ? { kicker: "ANFRAGE AKZEPTIEREN", title: "Anfrage akzeptieren?", copy: question, confirmLabel: "Akzeptieren" } : action === "invite" ? { kicker: "PORTAL-EINLADUNG", title: "Einladung jetzt senden?", copy: question, confirmLabel: "Einladung senden" } : { kicker: "ANFRAGE ABLEHNEN", title: "Anfrage wirklich ablehnen?", copy: question, confirmLabel: "Ablehnen", destructive: true };
  if (!await confirmAction(options)) return;
  button.disabled = true;
  try {
    if (action === "invite") {
      if (!request?.customer_id) throw new Error("Für diese Anfrage fehlt das Kundenprofil.");
      await adapter.sendPortalInvite(request.customer_id);
      showDispatchSuccess("Einladung versendet", "Der sichere Zugang wurde per E-Mail verschickt.");
    } else {
      await adapter.processPortalRequest(id, action);
      await refresh();
      showToast(action === "accept" ? "Anfrage akzeptiert. Kundenprofil wurde erstellt." : "Anfrage abgelehnt.");
    }
  } catch (error) { showToast(error.message || "Anfrage konnte nicht verarbeitet werden.", "error"); }
  finally { button.disabled = false; }
}

async function copyText(value) {
  if (navigator.clipboard?.writeText) {
    try { await navigator.clipboard.writeText(value); return; } catch { /* Use the legacy user-gesture path below. */ }
  }
  const field = document.createElement("textarea");
  field.value = value;
  field.setAttribute("readonly", "");
  field.style.cssText = "position:fixed;left:-9999px;top:0;opacity:0";
  document.body.append(field);
  field.focus();
  field.select();
  const copied = document.execCommand("copy");
  field.remove();
  if (!copied) throw new Error("Kopieren wurde vom Browser blockiert. Bitte den Link erneut über das Link-Icon kopieren.");
}
async function copyOfferLink(id, button) {
  button.disabled = true;
  try {
    const link = `${window.location.origin}/client/?offer=${encodeURIComponent(id)}`;
    await copyText(link);
    showToast("Geschützter Kundenportal-Link wurde kopiert.");
  } catch (error) { showToast(error.message || "Link konnte nicht kopiert werden.", "error"); }
  finally { button.disabled = false; }
}
async function sendOffer(id, button) {
  const offer = state.data.offers.find((item) => item.id === id);
  const customer = state.data.customers.find((item) => item.id === offer?.customer_id);
  const recipient = customer?.email || "die Kunden-E-Mail";
  if (!await confirmAction({ kicker: "OFFERTE VERSENDEN", title: "Offerte per E-Mail senden?", copy: `${offer?.offer_number || "Diese Offerte"} wird im Kundenportal freigegeben und an ${recipient} gesendet.`, confirmLabel: "Jetzt senden" })) return;
  button.disabled = true;
  try {
    await adapter.shareOffer(id);
    const result = await adapter.sendOffer(id);
    await refresh();
    showDispatchSuccess("Offerte versendet", `Der geschützte Portal-Link wurde an ${result?.recipient || recipient} gesendet.`);
  } catch (error) { showToast(error.message || "Offerte konnte nicht per E-Mail gesendet werden.", "error"); }
  finally { button.disabled = false; }
}

content.addEventListener("click", async (event) => {
  const create = event.target.closest("[data-create]"); if (create) openEditor(create.dataset.create, null, { projectId: create.dataset.projectId || "" });
  const view = event.target.closest("[data-view]"); if (view) setView(view.dataset.view);
  const filter = event.target.closest("[data-filter]"); if (filter) { state.filter = filter.dataset.filter; render(); }
  const projectFocus = event.target.closest("[data-project-focus]"); if (projectFocus) { state.selectedProjectId = projectFocus.dataset.projectFocus; render(); document.querySelector(`[data-project-focus="${state.selectedProjectId}"]`)?.focus({ preventScroll: true }); }
  const dashboardProjectFocus = event.target.closest("[data-dashboard-project-focus]"); if (dashboardProjectFocus) { state.selectedProjectId = dashboardProjectFocus.dataset.dashboardProjectFocus; setView("projects"); }
  const edit = event.target.closest("[data-edit]"); if (edit) { const collections = { customer: state.data.customers, project: state.data.projects, invoice: state.data.invoices }; openEditor(edit.dataset.edit, collections[edit.dataset.edit].find((item) => item.id === edit.dataset.id)); }
  const action = event.target.closest("[data-invoice-action]"); if (action) invoiceAction(action.dataset.id, action.dataset.invoiceAction, action);
  const requestAction = event.target.closest("[data-portal-request-action]"); if (requestAction) portalRequestAction(requestAction.dataset.id, requestAction.dataset.portalRequestAction, requestAction);
  const sendOfferButton = event.target.closest("[data-send-offer]"); if (sendOfferButton) await sendOffer(sendOfferButton.dataset.sendOffer, sendOfferButton);
  const copyOffer = event.target.closest("[data-copy-offer]"); if (copyOffer) await copyOfferLink(copyOffer.dataset.copyOffer, copyOffer);
  const remove = event.target.closest("[data-delete-record]"); if (remove) deleteRecord(remove.dataset.deleteRecord, remove.dataset.id, remove);
});
content.addEventListener("input", (event) => { if (event.target.matches("[data-search]")) { state.query = event.target.value; const position = event.target.selectionStart; render(); const next = document.querySelector("[data-search]"); next.focus(); next.setSelectionRange(position, position); } });
dialogBody.addEventListener("click", (event) => { if (event.target.closest("[data-add-item]")) addInvoiceItem(); if (event.target.closest("[data-add-discount]")) addInvoiceItem(null, "discount"); if (event.target.closest("[data-remove-item]")) { if (document.querySelectorAll(".invoice-item").length > 1) event.target.closest(".invoice-item").remove(); updateInvoiceTotal(); } });
dialogBody.addEventListener("input", (event) => { if (event.target.matches('[name="item_quantity"],[name="item_price"],[name="discount_value"],[name="tax_rate"]')) updateInvoiceTotal(); });
dialogBody.addEventListener("change", (event) => { if (event.target.matches('[name="customer_id"]') && ["invoice", "offer"].includes(dialogForm.dataset.type)) { const projects = dialogForm.elements.project_id; projects.innerHTML = `<option value="">Kein Projekt</option>${projectOptions(event.target.value)}`; } });
dialogForm.addEventListener("submit", async (event) => { const submitter = event.submitter; if (submitter?.value !== "save") return; event.preventDefault(); submitter.disabled = true; formError.textContent = ""; try { if (await saveEditor(dialogForm.dataset.type)) { dialog.close(); await refresh(); showToast("Gespeichert."); } } catch (error) { formError.textContent = error.message || "Speichern fehlgeschlagen."; } finally { submitter.disabled = false; } });
document.addEventListener("click", (event) => { const nav = event.target.closest(".nav-link"); if (nav) setView(nav.dataset.view); if (event.target.closest("[data-open-nav]")) setNavigationOpen(true); if (event.target.closest("[data-close-nav]")) setNavigationOpen(false); const create = event.target.closest("[data-create]"); if (create && !content.contains(create)) openEditor(create.dataset.create); });
document.addEventListener("keydown", (event) => {
  if (!shell.classList.contains("nav-open")) return;
  if (event.key === "Escape") { event.preventDefault(); setNavigationOpen(false); return; }
  if (event.key !== "Tab") return;
  const focusable = navigationFocusable();
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable.at(-1);
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  else if (!document.querySelector("#sidebar").contains(document.activeElement)) { event.preventDefault(); first.focus(); }
});
document.querySelector("#logout-button").addEventListener("click", async () => { await adapter.logout(); window.location.replace("/login/"); });

async function boot() {
  try {
    if (!isBackendConfigured()) throw new Error("Backend ist noch nicht konfiguriert.");
    const { createClient } = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.4/+esm");
    state.supabase = createClient(HEAV_ADMIN_CONFIG.supabaseUrl, HEAV_ADMIN_CONFIG.supabaseAnonKey);
    const { data, error } = await state.supabase.auth.getSession();
    if (error || !data.session) { window.location.replace("/login/"); return; }

    const userId = data.session.user.id;
    const { data: settings } = await state.supabase.from("company_settings").select("owner_id").maybeSingle();
    const isOwner = settings?.owner_id === userId;

    if (!isOwner) {
      const { data: memberships, error: membershipError } = await state.supabase
        .from("customer_portal_memberships")
        .select("id")
        .eq("user_id", userId)
        .eq("status", "active")
        .limit(1);
      if (!membershipError && memberships?.length) { window.location.replace("/client/"); return; }
    }

    adapter = createSupabaseAdapter(state.supabase, data.session);
    state.data = await adapter.loadAll();
    loading.remove(); shell.hidden = false; render();
  } catch (error) {
    loading.innerHTML = `<strong>HEAV</strong><span>${esc(error.message)}</span><a href="/login/" style="color:#d7ff38">Zum Login</a>`;
  }
}
boot();
