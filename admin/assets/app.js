import { HEAV_ADMIN_CONFIG, isBackendConfigured } from "/admin/config.js";
import { calculateInvoice, formatCHF, statusLabel, validateCustomer, validateInvoice } from "/admin/assets/domain.js";
import { buildPaidRevenueSeries } from "/admin/assets/dashboard.js?v=20260916-revenue-1";

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
const navigationPanel = document.querySelector("#sidebar");
const mobileNavigationQuery = window.matchMedia("(max-width: 820px)");
const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
const preciseHoverQuery = window.matchMedia("(hover: hover) and (pointer: fine)");
const actionConfirmDialog = document.querySelector("#action-confirm-dialog");
const actionConfirmKicker = document.querySelector("#action-confirm-kicker");
const actionConfirmTitle = document.querySelector("#action-confirm-title");
const actionConfirmCopy = document.querySelector("#action-confirm-copy");
const actionConfirmButton = document.querySelector("#action-confirm-button");
const assistantDialog = document.querySelector("#assistant-dialog");
const assistantLauncher = document.querySelector("[data-open-assistant]");
const assistantForm = document.querySelector("#assistant-form");
const assistantInput = document.querySelector("#assistant-input");
const assistantImage = document.querySelector("#assistant-image");
const assistantAttachment = document.querySelector("#assistant-attachment");
const assistantMessages = document.querySelector("#assistant-messages");
const assistantDelete = document.querySelector("[data-delete-assistant-thread]");
let navRestoreFocus = null;
let navLockedScrollY = null;
let navCloseTimer = null;
let navigationWasLastFocusContext = false;
const NAV_EXIT_DURATION_MS = 680;

document.addEventListener("focusin", (event) => {
  navigationWasLastFocusContext = navigationPanel.contains(event.target);
});

const viewNames = {
  dashboard: "Übersicht",
  emails: "E-Mail-Verlauf",
  customers: "Kunden",
  projects: "Projekte",
  invoices: "Rechnungen",
  offers: "Offerten",
  settings: "Einstellungen",
  "portal-requests": "Portal-Anfragen",
};
const state = { view: "dashboard", query: "", filter: "all", invoiceSort: "created_desc", projectDocumentSort: "newest", selectedProjectId: null, data: null, supabase: null, sendRequestKeys: new Map() };
const assistantState = { ownerId: null, threadId: null, image: null, busy: false, proposals: new Map() };
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
  toast.style.borderLeft = `4px solid ${tone === "error" ? "#ff5b35" : "#e8e4dc"}`;
  toast.hidden = false;
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => { toast.hidden = true; }, 4200);
}

function showDispatchSuccess(title = "Rechnung versendet", copy = "Der sichere Versand wurde bestätigt.") {
  toast.className = "toast is-dispatch-success";
  toast.style.borderLeft = "4px solid #e8e4dc";
  toast.innerHTML = `<span class="dispatch-plane" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><path d="M21 3 10 14"/><path d="m21 3-7 18-4-7-7-4Z"/></svg></span><span><strong>${esc(title)}</strong><small>${esc(copy)}</small></span><span class="dispatch-check" aria-hidden="true">✓</span>`;
  toast.hidden = false;
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => { toast.hidden = true; }, 4200);
}

function confirmAction({ kicker = "BESTÄTIGEN", title, copy, confirmLabel = "Bestätigen", destructive = false }) {
  if (actionConfirmDialog.open) return Promise.resolve(false);
  actionConfirmDialog.returnValue = "";
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
  const departments = new Map((data.departments || []).map((item) => [item.id, item]));
  return {
    ...data,
    projects: data.projects.map((item) => ({ ...item, customer: customers.get(item.customer_id), department: departments.get(item.department_id) })),
    invoices: data.invoices.map((item) => ({ ...item, customer: item.customer_snapshot || customers.get(item.customer_id), department: departments.get(item.department_id) })),
    offers: (data.offers || []).map((item) => ({ ...item, customer: customers.get(item.customer_id), department: departments.get(item.department_id) })),
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
      const [customers, departments, projects, invoices, offers, settings, portalRequests, activityEvents, emailLogs, emailTemplates] = await Promise.all([
        supabase.from("customers").select("*").order("company"),
        supabase.from("customer_departments").select("*").order("name"),
        supabase.from("projects").select("*").order("created_at", { ascending: false }),
        supabase.from("invoices").select("*, invoice_items(*)").order("issue_date", { ascending: false }),
        supabase.from("offers").select("*, offer_items(*) ").order("issue_date", { ascending: false }),
        supabase.from("company_settings").select("*").maybeSingle(),
        supabase.from("customer_portal_requests").select("*").order("created_at", { ascending: false }),
        supabase.from("activity_events").select("*").limit(100).order("created_at", { ascending: false }),
        supabase.from("email_delivery_logs").select("*").limit(200).order("created_at", { ascending: false }),
        supabase.from("email_templates").select("*").order("template_key"),
      ]);
      [customers, departments, projects, invoices, offers, settings, portalRequests, activityEvents, emailLogs, emailTemplates].forEach((result) => fail(result.error));
      const normalizedInvoices = invoices.data.map((invoice) => ({ ...invoice, items: invoice.invoice_items || [] }));
      const normalizedOffers = (offers.data || []).map((offer) => ({ ...offer, items: offer.offer_items || [] }));
      return joinedData({ customers: customers.data, departments: departments.data || [], projects: projects.data, invoices: normalizedInvoices, offers: normalizedOffers, settings: settings.data || {}, portalRequests: portalRequests.data || [], activityEvents: activityEvents.data || [], emailLogs: emailLogs.data || [], emailTemplates: emailTemplates.data || [] });
    },
    async saveCustomer(payload) { const result = await supabase.from("customers").insert({ ...payload, owner_id: ownerId }).select("id").single(); fail(result.error); return result.data; },
    async saveDepartment(payload) { const result = await supabase.from("customer_departments").insert({ ...payload, owner_id: ownerId }); fail(result.error); },
    async updateCustomer(id, payload) { const result = await supabase.rpc("update_customer", { p_customer_id: id, p_company: payload.company, p_contact_name: payload.contact_name, p_email: payload.email, p_phone: payload.phone, p_address_line1: payload.address_line1, p_postal_code: payload.postal_code, p_city: payload.city, p_country: payload.country }); fail(result.error); },
    async saveProject(payload) { const result = await supabase.from("projects").insert({ ...payload, owner_id: ownerId }); fail(result.error); },
    async updateProject(id, payload) { const result = await supabase.rpc("update_project", { p_project_id: id, p_customer_id: payload.customer_id, p_title: payload.title, p_description: payload.description, p_status: payload.status, p_budget_rappen: payload.budget_rappen, p_start_date: payload.start_date, p_due_date: payload.due_date }); fail(result.error); if (payload.department_id) { const department = await supabase.from("projects").update({ department_id: payload.department_id }).eq("id", id).eq("owner_id", ownerId); fail(department.error); } },
    async saveInvoice(payload) {
      const items = payload.items;
      const result = await supabase.rpc(payload.department_id ? "create_invoice_in_department" : "create_invoice", {
        p_customer_id: payload.customer_id,
        p_project_id: payload.project_id,
        p_issue_date: payload.issue_date,
        p_due_date: payload.due_date,
        p_tax_rate: payload.tax_rate,
        p_notes: payload.notes,
        p_items: items,
        ...(payload.department_id ? { p_department_id: payload.department_id } : {}),
      });
      fail(result.error);
    },
    async saveOffer(payload) {
      const result = await supabase.rpc(payload.department_id ? "create_offer_in_department" : "create_offer", {
        p_customer_id: payload.customer_id,
        p_project_id: payload.project_id,
        p_title: payload.title,
        p_issue_date: payload.issue_date,
        p_valid_until: payload.valid_until,
        p_tax_rate: payload.tax_rate,
        p_notes: payload.notes,
        p_terms: payload.terms,
        p_items: payload.items,
        ...(payload.department_id ? { p_department_id: payload.department_id } : {}),
      });
      fail(result.error);
      return Array.isArray(result.data) ? result.data[0] : result.data;
    },
    async shareOffer(id) { const result = await supabase.rpc("share_customer_offer", { p_offer_id: id }); fail(result.error); },
    async sendOffer(id, requestKey) {
      const { data, error } = await supabase.functions.invoke("offer-send", { body: { offerId: id, requestKey } });
      if (error) {
        const details = await error.context?.json?.().catch(() => null);
        throw new Error(details?.error || "Offerte konnte nicht per E-Mail gesendet werden.");
      }
      return data;
    },
    async askAssistant(payload) {
      const { data, error } = await supabase.functions.invoke("assistant-chat", { body: payload });
      if (error) {
        const details = await error.context?.json?.().catch(() => null);
        const requestError = new Error(details?.error || "Der HEAV Assistent ist gerade nicht erreichbar.");
        requestError.status = Number(error.context?.status || 0);
        throw requestError;
      }
      return data;
    },
    async loadAssistantThread(id) {
      const threadResult = await supabase.from("assistant_threads").select("id").eq("id", id).maybeSingle();
      fail(threadResult.error);
      if (!threadResult.data) return null;
      const messagesResult = await supabase.from("assistant_messages").select("role,content,proposals,created_at").eq("thread_id", id).order("created_at", { ascending: true });
      fail(messagesResult.error);
      return messagesResult.data || [];
    },
    async deleteAssistantThread(id) {
      const result = await supabase.rpc("delete_assistant_thread", { p_thread_id: id });
      fail(result.error);
    },
    async updateInvoice(id, payload) {
      const result = await supabase.rpc("update_invoice", { p_invoice_id: id, p_customer_id: payload.customer_id, p_project_id: payload.project_id, p_issue_date: payload.issue_date, p_due_date: payload.due_date, p_status: payload.status, p_tax_rate: payload.tax_rate, p_notes: payload.notes, p_items: payload.items });
      fail(result.error);
    },
    async deleteRecord(type, id) {
      const rpcNames = { customer: "delete_customer", project: "delete_project", invoice: "delete_invoice", offer: "delete_offer", "portal-request": "delete_portal_request" };
      const parameterNames = { customer: "p_customer_id", project: "p_project_id", invoice: "p_invoice_id", offer: "p_offer_id", "portal-request": "p_request_id" };
      const result = await supabase.rpc(rpcNames[type], { [parameterNames[type]]: id });
      fail(result.error);
    },
    async processPortalRequest(id, action) {
      const result = await supabase.rpc("process_customer_portal_request", { p_request_id: id, p_action: action });
      fail(result.error);
      return result.data;
    },
    async sendPortalInvite(customerId, departmentId = null) {
      const { data, error } = await supabase.functions.invoke("portal-send-invite", { body: { customerId, departmentId } });
      if (error) {
        const details = await error.context?.json?.().catch(() => null);
        throw new Error(details?.error || "Einladung konnte nicht versendet werden.");
      }
      return data;
    },
    async saveSettings(payload) { const result = await supabase.from("company_settings").upsert({ ...payload, owner_id: ownerId }, { onConflict: "owner_id" }); fail(result.error); },
    async saveEmailTemplate(templateKey, payload) { const result = await supabase.from("email_templates").upsert({ owner_id: ownerId, template_key: templateKey, subject_template: payload.subject_template, text_template: payload.text_template }, { onConflict: "owner_id,template_key" }); fail(result.error); },
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
  pencil: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14.5 4.5 5 5M4 20l3.8-.8L19.5 7.5a2.1 2.1 0 0 0-3-3L4.8 16.2 4 20Z"/></svg>',
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

function revenueTrendPercentage(revenue) {
  const previous = revenue.months.slice(0, 6).reduce((total, month) => total + month.netRappen, 0);
  const recent = revenue.months.slice(6).reduce((total, month) => total + month.netRappen, 0);
  if (!previous) return null;
  return ((recent - previous) / previous) * 100;
}
function bklitTrendBadge(value) {
  if (!Number.isFinite(value)) return "";
  const positive = value >= 0;
  const direction = positive ? "gestiegen" : "gesunken";
  return `<span class="bklit-trend-badge ${positive ? "is-positive" : "is-negative"}" title="Vergleich der letzten sechs Monate mit den sechs Monaten davor" aria-label="Umsatz ${direction} um ${Math.abs(value).toFixed(1)} Prozent"><span aria-hidden="true">${positive ? "↑" : "↓"}</span>${positive ? "+" : ""}${value.toFixed(1)}%</span>`;
}
function dashboardOpenDistribution(invoices) {
  const buckets = [
    { label: "≤ 7 T", value: 0 },
    { label: "8–14 T", value: 0 },
    { label: "15–30 T", value: 0 },
    { label: "30+ T", value: 0 },
  ];
  const now = Date.now();
  invoices.filter((item) => ["sent", "overdue"].includes(item.status)).forEach((item) => {
    const due = Date.parse(item.due_date || "");
    const days = Number.isFinite(due) ? Math.ceil((due - now) / 86400000) : 31;
    const index = days <= 7 ? 0 : days <= 14 ? 1 : days <= 30 ? 2 : 3;
    buckets[index].value += item.total_rappen || 0;
  });
  return buckets;
}
function openDistributionPath(buckets) {
  const max = Math.max(...buckets.map((item) => item.value), 0);
  if (!max) return "";
  return buckets.map((item, index) => {
    const x = index * 200;
    const y = 112 - Math.round((item.value / max) * 82);
    return `${index ? "L" : "M"}${x} ${y}`;
  }).join(" ");
}
function renderRevenueChart(invoices) {
  const revenue = buildPaidRevenueSeries(invoices);
  const trend = bklitTrendBadge(revenueTrendPercentage(revenue));
  const bars = revenue.months.map((month) => {
    const height = revenue.maxNetRappen ? Math.max(2, Math.round((month.netRappen / revenue.maxNetRappen) * 100)) : 0;
    const ariaLabel = `${month.longLabel}: ${formatCHF(month.netRappen)} Nettoumsatz aus ${month.invoiceCount} ${month.invoiceCount === 1 ? "Rechnung" : "Rechnungen"}`;
    return `<div class="dashboard-revenue-month" data-revenue-month="${esc(month.key)}" role="img" aria-label="${esc(ariaLabel)}"><span class="dashboard-revenue-bar" style="--revenue-height:${height}%"></span><small>${esc(month.label)}</small></div>`;
  }).join("");
  const missing = revenue.missingPaidAt.count
    ? `${revenue.missingPaidAt.count} ${revenue.missingPaidAt.count === 1 ? "bezahlte Rechnung" : "bezahlte Rechnungen"} ohne Zahlungsdatum · ${formatCHF(revenue.missingPaidAt.grossRappen)}`
    : "Alle bezahlten Rechnungen haben ein Zahlungsdatum.";
  const openInvoices = invoices.filter((item) => ["sent", "overdue"].includes(item.status));
  const openTotal = openInvoices.reduce((total, item) => total + (item.total_rappen || 0), 0);
  const distribution = dashboardOpenDistribution(invoices);
  const distributionPath = openDistributionPath(distribution);
  const distributionMax = Math.max(...distribution.map((item) => item.value), 0);
  const openPoints = distribution.map((item, index) => {
    const x = index * 200;
    const y = distributionMax ? 112 - Math.round((item.value / distributionMax) * 82) : 112;
    return `<circle class="dashboard-open-marker" cx="${x}" cy="${y}" r="5"><title>${esc(item.label)}: ${formatCHF(item.value)}</title></circle>`;
  }).join("");
  return `<section class="dashboard-statistics" aria-label="Finanzstatistik">
    <article class="dashboard-revenue bklit-stat-card dashboard-stat-card" aria-labelledby="dashboard-revenue-title">
      <div class="dashboard-revenue-summary bklit-stat-card__content"><div class="bklit-stat-card__heading"><span class="dashboard-stat-kicker">Zahlungseingänge</span>${trend}</div><h3 class="dashboard-stat-title" id="dashboard-revenue-title">Bezahlter Rechnungsumsatz</h3><strong data-revenue-net>${formatCHF(revenue.totals.netRappen)}</strong><p class="dashboard-stat-note">exkl. MWST · ${revenue.totals.invoiceCount} ${revenue.totals.invoiceCount === 1 ? "Zahlung" : "Zahlungen"}</p><dl class="dashboard-stat-details"><div><dt>MWST</dt><dd data-revenue-tax>${formatCHF(revenue.totals.taxRappen)}</dd></div><div><dt>Brutto</dt><dd data-revenue-gross>${formatCHF(revenue.totals.grossRappen)}</dd></div></dl><small class="dashboard-stat-foot" data-revenue-missing-date>${esc(missing)}</small></div>
      <figure class="dashboard-revenue-figure bklit-stat-card__chart ${revenue.totals.invoiceCount ? "" : "is-empty"}"><figcaption><span>NETTO · LETZTE 12 MONATE</span><span>CHF</span></figcaption><div class="dashboard-revenue-chart">${revenue.totals.invoiceCount ? "" : '<p class="dashboard-revenue-empty">Noch keine Zahlungen in diesem Zeitraum.</p>'}${bars}</div></figure>
    </article>
    <article class="dashboard-money bklit-stat-card dashboard-stat-card" aria-labelledby="dashboard-open-title">
      <div class="dashboard-money-summary bklit-stat-card__content"><div class="bklit-stat-card__heading"><span class="dashboard-stat-kicker">Offene Rechnungen</span><span class="dashboard-stat-count">${openInvoices.length} OFFEN</span></div><h3 class="dashboard-stat-title" id="dashboard-open-title">Offene Rechnungen</h3><strong>${formatCHF(openTotal)}</strong><p class="dashboard-stat-note">${openInvoices.length} versendete / überfällige Rechnungen</p></div>
      <figure class="dashboard-open-figure bklit-stat-card__chart"><figcaption><span>FÄLLIGKEITSVERTEILUNG</span><span>CHF</span></figcaption><svg class="dashboard-open-chart" viewBox="0 0 600 150" preserveAspectRatio="none" role="img" aria-label="Verteilung offener Rechnungen nach Fälligkeit"><path class="dashboard-open-grid" d="M0 30H600M0 71H600M0 112H600"/>${distributionPath ? `<path class="dashboard-open-line" d="${esc(distributionPath)}"/>${openPoints}` : ""}</svg><div class="dashboard-open-labels">${distribution.map((item) => `<span>${esc(item.label)}</span>`).join("")}</div></figure>
    </article>
  </section>`;
}


function renderActivityTimeline() {
  const events = (state.data.activityEvents || []).slice(0, 12);
  const rows = events.map((event) => {
    const customer = state.data.customers.find((item) => item.id === event.customer_id);
    const department = state.data.departments?.find((item) => item.id === event.department_id);
    const when = event.created_at ? new Intl.DateTimeFormat("de-CH", { dateStyle: "medium", timeStyle: "short" }).format(new Date(event.created_at)) : "–";
    const context = [customer && customerLabel(customer), department?.name].filter(Boolean).join(" · ");
    return `<li class="activity-timeline-item"><span class="activity-timeline-dot" aria-hidden="true"></span><div><strong>${esc(event.summary || event.event_type || "Aktivität")}</strong><small>${esc(context || "System")} · ${esc(when)}</small></div></li>`;
  }).join("");
  return `<section class="panel dashboard-panel activity-timeline" aria-labelledby="activity-timeline-title"><div class="panel-head"><div><h3 id="activity-timeline-title">Aktivitäten</h3><p>Nachvollziehbare Ereignisse aus Kunden, Abteilungen und Projekten.</p></div></div>${rows ? `<ol>${rows}</ol>` : '<p class="document-empty">Noch keine Aktivitäten erfasst.</p>'}</section>`;
}

const emailTemplateDefinitions = [
  ["invoice_send", "Rechnung versenden", "Versand einer Rechnung als PDF", "{{first_name}}, {{invoice_number}}, {{amount}}, {{due_date}}, {{company_name}}, {{owner_name}}"],
  ["offer_send", "Offerte versenden", "Link zu einer Offerte im Kundenportal", "{{first_name}}, {{offer_number}}, {{offer_title}}, {{amount}}, {{portal_link}}, {{company_name}}, {{owner_name}}"],
  ["invoice_reminder", "Zahlungserinnerung", "Automatische Erinnerung vor der Fälligkeit", "{{first_name}}, {{invoice_number}}, {{amount}}, {{due_date}}, {{company_name}}"],
];
const emailTemplateDefaults = {
  invoice_send: { subject_template: "Rechnung {{invoice_number}} von {{company_name}}", text_template: "Hallo {{first_name}}\n\nDeine Rechnung {{invoice_number}} über {{amount}} ist fällig am {{due_date}}.\n\nFreundliche Grüsse\n{{owner_name}}\n{{company_name}}" },
  offer_send: { subject_template: "Offerte {{offer_number}} von {{company_name}}", text_template: "Hallo {{first_name}}\n\nDeine Offerte {{offer_title}} über {{amount}} liegt bereit.\n\nIm Kundenportal ansehen:\n{{portal_link}}\n\nFreundliche Grüsse\n{{owner_name}}\n{{company_name}}" },
  invoice_reminder: { subject_template: "Zahlungserinnerung · Rechnung {{invoice_number}}", text_template: "Hallo {{first_name}}\n\nfreundliche Erinnerung: Die Rechnung {{invoice_number}} über {{amount}} ist am {{due_date}} fällig.\n\nFreundliche Grüsse\n{{company_name}}" },
};
function emailTemplateValue(key) { return state.data.emailTemplates?.find((item) => item.template_key === key) || { template_key: key, ...(emailTemplateDefaults[key] || { subject_template: "", text_template: "" }) }; }
function emailTemplateDefinition(key) { return emailTemplateDefinitions.find(([templateKey]) => templateKey === key) || [key, key, "", ""]; }
function emailLogCustomer(log) { return state.data.customers.find((item) => item.id === log.customer_id); }
function emailLogDate(value) { return value ? new Intl.DateTimeFormat("de-CH", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "–"; }
function renderEmailSummary() {
  const logs = state.data.emailLogs || [];
  const sent = logs.filter((item) => item.status === "sent");
  const latest = sent[0];
  return `<section class="panel dashboard-panel email-summary" aria-labelledby="email-summary-title"><div class="panel-head"><div><h3 id="email-summary-title">Versendete E-Mails</h3><p>${sent.length} erfolgreiche Versand${sent.length === 1 ? "" : "e"} in der geladenen Historie.</p></div><button class="text-button" data-view="emails">Verlauf öffnen →</button></div>${latest ? `<div class="email-summary-latest"><span class="status paid">Versendet</span><div><strong>${esc(latest.subject)}</strong><small>${esc(latest.recipient_email)} · ${esc(emailLogDate(latest.created_at))}</small></div></div>` : '<p class="document-empty">Noch keine E-Mail wurde protokolliert.</p>'}</section>`;
}
function renderEmails() {
  const logs = state.data.emailLogs || [];
  const rows = logs.map((log) => {
    const customer = emailLogCustomer(log);
    const template = emailTemplateDefinition(log.template_key);
    return `<article class="email-log-row"><div class="email-log-meta"><span class="status ${log.status === "sent" ? "paid" : "cancelled"}">${log.status === "sent" ? "Versendet" : "Fehlgeschlagen"}</span><small>${esc(template[1])} · ${esc(emailLogDate(log.created_at))}</small></div><div class="email-log-main"><strong>${esc(log.subject)}</strong><span>${esc(customerLabel(customer))} · ${esc(log.recipient_email)}</span><details><summary>Text anzeigen</summary><pre>${esc(log.text_body || "Kein Text gespeichert.")}</pre></details></div><div class="email-log-result">${log.provider_id ? `<small>Provider-ID</small><code>${esc(log.provider_id)}</code>` : log.error_message ? `<small>Fehler</small><span>${esc(log.error_message)}</span>` : ""}</div></article>`;
  }).join("");
  const templateCards = emailTemplateDefinitions.map(([key, label, description, placeholders]) => { const template = emailTemplateValue(key); return `<article class="email-template-card"><div><span class="kicker">MAIL-TEXT</span><h3>${esc(label)}</h3><p>${esc(description)}</p><small>Platzhalter: ${esc(placeholders)}</small></div><button class="secondary-button" type="button" data-edit-email-template="${esc(key)}">Text anpassen</button></article>`; }).join("");
  return `<section class="view emails-view"><div class="hero-row"><div><h2>E-Mail-Verlauf</h2><p>Jeder protokollierte Versand zeigt Empfänger, Kundenbezug, Betreff und den tatsächlich gespeicherten Text.</p></div></div><section class="email-templates"><div class="panel-head"><div><h3>Mail-Texte</h3><p>Ändere Betreff und Text für die automatisierten Studio-Mails. Platzhalter bleiben erhalten.</p></div></div><div class="email-template-grid">${templateCards}</div></section><section class="email-log"><div class="panel-head"><div><h3>Versandprotokoll</h3><p>${logs.length} Einträge · erfolgreiche und fehlgeschlagene Zustellungen</p></div></div>${rows || '<p class="document-empty">Noch keine E-Mail-Versände protokolliert.</p>'}</section></section>`;
}

function renderDashboard() {
  const { customers, projects, invoices, offers = [] } = state.data;
  const activeProjects = projects.filter(item => ["planning", "active"].includes(item.status)).sort((a,b) => String(a.due_date || "9999").localeCompare(String(b.due_date || "9999")));
  const focusProject = activeProjects[0];
  const openInvoices = invoices.filter(item => ["sent", "overdue"].includes(item.status));
  const drafts = invoices.filter(item => item.status === "draft");
  const openOffers = offers.filter(item => ["draft", "sent"].includes(item.status));
  const sum = items => items.reduce((total, item) => total + (item.total_rappen || 0), 0);
  const paid = invoices.filter(item => item.status === "paid");
  const projectCustomer = focusProject?.customer || customers.find(item => item.id === focusProject?.customer_id);
  const projectPaid = paid.filter(item => item.project_id === focusProject?.id);
  const focusSurface = focusProject ? `<article class="dashboard-focus">
    <div class="dashboard-focus-head"><div><span class="kicker">NÄCHSTE PRODUKTION</span><h3>${esc(focusProject.title)}</h3><p>${esc(focusProject.description || "")}</p></div><span class="status ${esc(focusProject.status)}">${esc(statusLabel(focusProject.status))}</span></div>
    <div class="dashboard-focus-modules"><div><span>KUNDE</span><strong>${esc(customerLabel(projectCustomer))}</strong><small>${esc(projectCustomer?.email || "Keine E-Mail hinterlegt")}</small></div><div><span>ABGABE</span><strong>${formatDate(focusProject.due_date)}</strong><small>${focusProject.start_date ? `Start ${formatDate(focusProject.start_date)}` : "Start nicht festgelegt"}</small></div><div><span>BEZAHLT</span><strong>${formatCHF(sum(projectPaid))}</strong><small>Als bezahlt erfasst</small></div></div>
    <footer class="dashboard-focus-footer"><button class="project-module-link" type="button" data-dashboard-project-focus="${esc(focusProject.id)}">Projekt-Canvas öffnen <span aria-hidden="true">→</span></button><div><button class="secondary-button" type="button" data-create="offer" data-project-id="${esc(focusProject.id)}">Offerte</button><button class="primary-action" type="button" data-create="invoice" data-project-id="${esc(focusProject.id)}">Rechnung <span aria-hidden="true">+</span></button></div></footer>
  </article>` : `<article class="dashboard-focus dashboard-focus--empty"><span class="kicker">PRODUKTION</span><h3>Kein laufendes Projekt</h3><p>Erfasse den nächsten Auftrag mit Kunde und Produktionsterminen.</p><button class="primary-action" data-create="project">Projekt anlegen</button></article>`;
  return `<section class="view dashboard-view"><header class="dashboard-intro"><div><h2>Dein Arbeitsbereich</h2><p>Einnahmen, offene Zahlungen und Produktionen in einem ruhigen Überblick.</p></div></header>
    ${renderRevenueChart(invoices)}
    <section class="dashboard-stage dashboard-stage--focus-only">${focusSurface}</section>
    <section class="dashboard-grid"><section class="panel dashboard-panel"><div class="panel-head"><h3>Nächste Finanzschritte</h3><span class="kicker">${drafts.length + openOffers.length + openInvoices.length} EINTRÄGE</span></div><div class="workspace-action-list">
      ${drafts.slice(0,3).map(item => `<article class="workspace-action"><div><span class="status draft">Entwurf</span><strong>${esc(item.invoice_number)}</strong><small>${esc(customerLabel(item.customer))} · ${formatCHF(item.total_rappen)} · noch nicht fällig</small></div>${invoiceActions(item)}</article>`).join("")}
      ${openOffers.slice(0,3).map(item => `<article class="workspace-action"><div><span class="status ${esc(item.status)}">${esc(statusLabel(item.status))}</span><strong>${esc(item.title || item.offer_number)}</strong><small>Offerte · ${formatCHF(item.total_rappen)} · gültig bis ${formatDate(item.valid_until)}</small></div>${offerActions(item)}</article>`).join("")}
      ${openInvoices.slice(0,3).map(item => `<article class="workspace-action"><div><span class="status ${esc(item.status)}">${esc(statusLabel(item.status))}</span><strong>${esc(item.invoice_number)}</strong><small>${esc(customerLabel(item.customer))} · ${formatCHF(item.total_rappen)} · fällig ${formatDate(item.due_date)}</small></div>${invoiceActions(item)}</article>`).join("")}
      ${!drafts.length && !openOffers.length && !openInvoices.length ? '<p>Keine offenen Finanzschritte.</p>' : ''}
    </div><div class="panel-footer"><button class="text-button" data-view="invoices">Alle Rechnungen</button><button class="text-button" data-view="offers">Alle Offerten</button></div></section>
    <aside class="panel dashboard-panel dashboard-productions"><div class="panel-head"><h3>Laufende Projekte</h3><button class="text-button" data-view="projects">Alle öffnen</button></div><div class="dashboard-production-list">${activeProjects.slice(0,3).map(project => `<button class="dashboard-production-row" data-dashboard-project-focus="${esc(project.id)}"><span class="status ${esc(project.status)}">${esc(statusLabel(project.status))}</span><strong>${esc(project.title)}</strong><small>${esc(customerLabel(project.customer))} · ${formatDate(project.due_date)}</small><b aria-hidden="true">→</b></button>`).join("") || '<p>Keine laufende Produktion.</p>'}</div><div class="dashboard-quick-actions"><button class="secondary-button" data-create="customer">Kunde erfassen</button><button class="primary-action" data-create="project">Projekt anlegen</button></div></aside></section>
    ${renderActivityTimeline()}${renderEmailSummary()}
  </section>`;
}

function filtered(items, fields) { const query = state.query.trim().toLowerCase(); return items.filter((item) => !query || fields.some((field) => String(item[field] || "").toLowerCase().includes(query))); }
function toolbar(type, placeholder, filters = [], trailing = "") { return `<div class="toolbar ${type === "invoice" ? "invoice-toolbar" : ""}"><label class="search-field"><span class="sr-only">Suchen</span><input type="search" data-search placeholder="${esc(placeholder)}" value="${esc(state.query)}"></label>${filters.length ? `<div class="filter-tabs">${filters.map(([value,label]) => `<button class="filter-tab ${state.filter === value ? "is-active" : ""}" data-filter="${value}">${label}</button>`).join("")}</div>` : ""}${trailing}</div>`; }
function filterToolbar(placeholder, filters) { return `<div class="toolbar"><label class="search-field"><span class="sr-only">Suchen</span><input type="search" data-search placeholder="${esc(placeholder)}" value="${esc(state.query)}"></label><div class="filter-tabs">${filters.map(([value,label]) => `<button class="filter-tab ${state.filter === value ? "is-active" : ""}" data-filter="${value}">${label}</button>`).join("")}</div></div>`; }

function invoiceTimestamp(item, field, fallback = "") {
  const value = item[field] || fallback;
  const timestamp = value ? Date.parse(value) : 0;
  return Number.isFinite(timestamp) ? timestamp : 0;
}
function newestInvoiceFirst(a, b) {
  const difference = invoiceTimestamp(b, "created_at", b.issue_date) - invoiceTimestamp(a, "created_at", a.issue_date);
  return difference || String(b.invoice_number || "").localeCompare(String(a.invoice_number || ""), "de-CH", { numeric: true });
}
function sortInvoices(items) {
  const sorted = [...items];
  if (state.invoiceSort === "sent_desc") {
    return sorted.sort((a, b) => {
      const aSent = invoiceTimestamp(a, "sent_at");
      const bSent = invoiceTimestamp(b, "sent_at");
      if (Boolean(aSent) !== Boolean(bSent)) return bSent ? 1 : -1;
      return bSent - aSent || newestInvoiceFirst(a, b);
    });
  }
  if (state.invoiceSort === "due_asc") {
    return sorted.sort((a, b) => {
      const aOpen = ["sent", "overdue"].includes(a.status) ? 0 : 1;
      const bOpen = ["sent", "overdue"].includes(b.status) ? 0 : 1;
      if (aOpen !== bOpen) return aOpen - bOpen;
      const aDue = invoiceTimestamp(a, "due_date");
      const bDue = invoiceTimestamp(b, "due_date");
      if (Boolean(aDue) !== Boolean(bDue)) return aDue ? -1 : 1;
      return aDue - bDue || newestInvoiceFirst(a, b);
    });
  }
  return sorted.sort(newestInvoiceFirst);
}
function invoiceSortControl() {
  const options = [["created_desc", "Zuletzt erstellt"], ["sent_desc", "Zuletzt versendet"], ["due_asc", "Nächste Fälligkeit"]];
  return `<label class="invoice-sort-field"><span>Sortieren</span><select data-invoice-sort aria-label="Rechnungen sortieren">${options.map(([value, label]) => `<option value="${value}" ${state.invoiceSort === value ? "selected" : ""}>${label}</option>`).join("")}</select></label>`;
}

function renderCustomers() {
  const items = filtered(state.data.customers, ["company", "contact_name", "email", "city"]);
  if (!state.data.customers.length) return `<section class="view">${emptyState("Der erste Kontakt.", "Erfasse deinen ersten Kunden und verknüpfe danach Projekte und Rechnungen.", "customer")}</section>`;
  const rows = items.map((item) => `<tr><td><strong class="customer-name">${contactMark()}${esc(customerLabel(item))}</strong><small>${esc(item.company && item.contact_name ? item.contact_name : item.company ? "" : "Privatkunde")}</small></td><td>${esc(item.email || "–")}</td><td>${esc(item.phone || "–")}</td><td>${esc([item.postal_code,item.city].filter(Boolean).join(" ") || "–")}</td><td><div class="table-actions">${actionIconButton("pencil", "Bearbeiten", `data-edit="customer" data-id="${esc(item.id)}"`)}${actionIconButton("trash", `Kunde löschen: ${customerLabel(item)}`, `data-delete-record="customer" data-id="${esc(item.id)}"`, "is-danger")}</div></td></tr>`).join("");
  const cards = items.map((item) => `<article class="mobile-card customer-card"><div><strong class="customer-name">${contactMark()}${esc(customerLabel(item))}</strong><small>${esc(item.company && item.contact_name ? item.contact_name : item.company ? "" : "Privatkunde")} · ${esc(item.email || "Keine E-Mail")}${item.city ? ` · ${esc(item.city)}` : ""}</small><div class="table-actions">${actionIconButton("pencil", "Bearbeiten", `data-edit="customer" data-id="${esc(item.id)}"`)}${actionIconButton("trash", `Kunde löschen: ${customerLabel(item)}`, `data-delete-record="customer" data-id="${esc(item.id)}"`, "is-danger")}</div></div></article>`).join("");
  return `<section class="view">${toolbar("customer", "Kunden durchsuchen …")}<table class="data-table customer-table"><thead><tr><th>Kunde</th><th>E-Mail</th><th>Telefon</th><th>Ort</th><th>Aktionen</th></tr></thead><tbody>${rows}</tbody></table><div class="mobile-card-list">${cards}</div></section>`;
}

function renderProjectCanvas(project) {
  const invoices = state.data.invoices.filter(item => item.project_id === project.id);
  const offers = (state.data.offers || []).filter(item => item.project_id === project.id);
  const sum = statuses => invoices.filter(item => statuses.includes(item.status)).reduce((total,item) => total + (item.total_rappen || 0), 0);
  const customer = project.customer || state.data.customers.find(item => item.id === project.customer_id);
  const accepted = offers.filter(item => item.status === "accepted");
  return `<section class="project-canvas" aria-label="Projekt-Canvas" aria-describedby="project-canvas-guide" tabindex="-1"><div class="project-canvas-track">
    <header class="project-canvas-head"><div><span class="kicker">PROJEKT-CANVAS</span><h3>${esc(project.title)}</h3>${project.description ? `<p>${esc(project.description)}</p>` : ''}</div>${actionIconButton("pencil", `Projekt bearbeiten: ${project.title}`, `data-edit="project" data-id="${esc(project.id)}"`)}</header>
    <div class="project-module-grid">
      <article class="project-module"><div><span class="project-module-label">KUNDE</span><strong>${esc(customerLabel(customer))}</strong><p>${esc(customer?.email || "Keine E-Mail hinterlegt")}</p>${customer ? `<button class="project-module-link" data-edit="customer" data-id="${esc(customer.id)}">Kundendaten bearbeiten <span aria-hidden="true">→</span></button>` : ''}</div></article>
      <article class="project-module project-module--production"><div><span class="project-module-label">PRODUKTION</span><strong><span class="status ${esc(project.status)}">${esc(statusLabel(project.status))}</span></strong><p>Start: ${formatDate(project.start_date)}<br>Abgabe: ${formatDate(project.due_date)}</p><p>Projektbudget: ${formatCHF(project.budget_rappen || 0)}</p></div></article>
    </div>
    <section class="project-finances" aria-label="Projektfinanzen"><h4>Finanzstand</h4><div class="project-money-grid"><div data-project-money="paid"><span>Bezahlt erfasst</span><strong>${formatCHF(sum(["paid"]))}</strong></div><div data-project-money="open"><span>Ausstehend</span><strong>${formatCHF(sum(["sent", "overdue"]))}</strong></div><div data-project-money="draft"><span>Entwürfe · nicht fällig</span><strong>${formatCHF(sum(["draft"]))}</strong></div></div></section>
    <section class="project-documents"><div class="panel-head"><div><h4>Vereinbarung · Offerten</h4><p>${accepted.length ? `${accepted.length} Offerte(n) angenommen` : "Noch keine angenommene Offerte"}</p></div><button class="secondary-button" data-create="offer" data-project-id="${esc(project.id)}">Offerte</button></div>
    ${offers.map(item => `<article class="workspace-action"><div><span class="status ${esc(item.status)}">${esc(statusLabel(item.status))}</span><strong>${esc(item.offer_number)} · ${esc(item.title)}</strong><small>${formatCHF(item.total_rappen)} · gültig bis ${formatDate(item.valid_until)}</small></div>${offerActions(item)}</article>`).join("") || '<p class="document-empty">Noch keine Offerte verknüpft. Bereite die Leistungen für diesen Kunden vor.</p>'}</section>
    <section class="project-documents"><div class="panel-head"><div><h4>Rechnungen</h4><p>Dokumente und Zahlungsstatus zu diesem Projekt</p></div><button class="primary-action" data-create="invoice" data-project-id="${esc(project.id)}">Rechnung <span aria-hidden="true">+</span></button></div>
    ${invoices.map(item => `<article class="workspace-action"><div><span class="status ${esc(item.status)}">${esc(statusLabel(item.status))}</span><strong>${esc(item.invoice_number)}</strong><small>${formatCHF(item.total_rappen)} · ${item.status === "draft" ? "Entwurf, noch nicht fällig" : `fällig ${formatDate(item.due_date)}`}</small></div>${invoiceActions(item)}</article>`).join("") || '<p class="document-empty">Noch keine Rechnung verknüpft.</p>'}</section>
  </div></section>`;
}

function renderProjectOverview(project, projects) {
  const invoices = state.data.invoices.filter((invoice) => invoice.project_id === project.id);
  const offers = (state.data.offers || []).filter((offer) => offer.project_id === project.id);
  const open = invoices.filter((invoice) => ["sent", "overdue"].includes(invoice.status));
  const openTotal = open.reduce((total, invoice) => total + (invoice.total_rappen || 0), 0);
  const billed = invoices.filter((invoice) => ["sent", "overdue", "paid"].includes(invoice.status)).reduce((total, invoice) => total + (invoice.total_rappen || 0), 0);
  const budget = project.budget_rappen || 0;
  const utilization = budget ? Math.round(billed / budget * 100) : 0;
  const documents = [...offers.map((item) => ({ type: "offer", item })), ...invoices.map((item) => ({ type: "invoice", item }))].sort((a, b) => {
    const difference = String(b.item.issue_date || b.item.created_at || "").localeCompare(String(a.item.issue_date || a.item.created_at || ""));
    return state.projectDocumentSort === "newest" ? difference : -difference;
  });
  const visibleDocuments = documents.filter(({ type, item }) => (state.filter === "all" || state.filter === type) && (!state.query.trim() || `${item.offer_number || item.invoice_number} ${item.title || ""} ${statusLabel(item.status)}`.toLowerCase().includes(state.query.trim().toLowerCase())));
  const overdue = invoices.filter((invoice) => invoice.status === "overdue");
  const owner = state.data.settings?.owner_name?.trim() || "Studio-Konto";
  const initials = owner.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
  const signals = (state.data.activityEvents || []).filter((event) => event.project_id === project.id || (event.customer_id && event.customer_id === project.customer_id)).slice(0, 3);
  return `<section class="project-strip" aria-label="Projektauswahl">${projects.map((item) => {
    const selected = item.id === project.id;
    const itemCustomer = item.customer || state.data.customers.find((customerRecord) => customerRecord.id === item.customer_id);
    const mark = item.title.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
    const itemBilled = state.data.invoices.filter((invoice) => invoice.project_id === item.id && ["sent", "overdue", "paid"].includes(invoice.status)).reduce((total, invoice) => total + (invoice.total_rappen || 0), 0);
    const progress = item.budget_rappen ? Math.min(100, Math.round(itemBilled / item.budget_rappen * 100)) : 0;
    return `<button class="project-strip-item ${selected ? "is-selected" : ""}" type="button" data-project-focus="${esc(item.id)}" aria-pressed="${selected}"><span class="project-strip-head"><span class="project-strip-mark" aria-hidden="true">${esc(mark)}</span><span class="project-strip-token">${esc(statusLabel(item.status))}</span></span><strong>${esc(item.title)}</strong><small>${esc(customerLabel(itemCustomer))} · ${item.budget_rappen ? `${progress}% abgerechnet` : "Budget offen"}</small><span class="project-strip-progress" aria-hidden="true"><span style="width:${progress}%"></span></span></button>`;
  }).join("")}</section>
  <div class="project-section-head"><div><h2>Projektlage</h2><p>Der operative Kontext bleibt sichtbar, die Kennzahlen sind nicht das Produkt.</p></div><button class="text-button" type="button" data-scroll-project-register>Alle Projekte anzeigen</button></div>
  <section class="project-metrics" aria-label="Projektkennzahlen">
    <article class="project-metric"><span>Budget <b aria-hidden="true">▥</b></span><strong>${formatCHF(budget)}</strong><small>${budget ? `${utilization}% abgerechnet` : "Kein Budget erfasst"}</small></article>
    <article class="project-metric"><span>Offen <b aria-hidden="true">→</b></span><strong>${formatCHF(openTotal)}</strong><small>${open.length} ${open.length === 1 ? "Rechnung" : "Rechnungen"}</small></article>
    <article class="project-metric"><span>Nächster Termin <b aria-hidden="true">▣</b></span><strong>${formatDate(project.due_date)}</strong><small>${project.due_date ? "Projektabgabe" : "Kein Termin erfasst"}</small></article>
    <article class="project-metric"><span>Risiko <b aria-hidden="true">△</b></span><strong>${overdue.length}</strong><small class="${overdue.length ? "is-risk" : ""}">${overdue.length ? "Überfällige Rechnungen" : "Keine überfälligen Rechnungen"}</small></article>
  </section>
  <section class="project-workspace-grid" aria-label="Projekt-Dokumente und Signale">
    <article class="project-doc-panel"><header class="project-doc-head"><div><h2>Dokumente im Kontext</h2><p>Offerten und Rechnungen für ${esc(project.title)}.</p></div><div class="project-doc-tools"><label class="project-doc-search"><span class="sr-only">Dokumente suchen</span><span aria-hidden="true">⌕</span><input type="search" data-search placeholder="Dokument suchen" value="${esc(state.query)}"></label><button class="project-doc-sort" type="button" data-sort-project-documents aria-label="Dokumente nach Datum ${state.projectDocumentSort === "newest" ? "aufsteigend" : "absteigend"} sortieren">Sortieren</button></div></header>
      <div class="project-doc-filters" role="group" aria-label="Dokumentfilter">${[["all", "Alle", documents.length], ["offer", "Offerten", offers.length], ["invoice", "Rechnungen", invoices.length]].map(([value, label, count]) => `<button class="project-doc-chip ${state.filter === value ? "is-active" : ""}" type="button" data-filter="${value}" aria-pressed="${state.filter === value}">${label} ${count}</button>`).join("")}</div>
      <div class="project-doc-scroll"><table><thead><tr><th>Dokument</th><th>Stand</th><th>Owner</th><th>Total</th><th><span class="sr-only">Aktion</span></th></tr></thead><tbody>${visibleDocuments.map(({ type, item }) => `<tr><td><span class="project-doc-name"><strong>${esc(item.offer_number || item.invoice_number)}</strong><small>${esc(type === "offer" ? `Offerte · ${item.title || "Projekt"}` : `Rechnung · ${customerLabel(item.customer)}`)}</small></span></td><td><span class="project-doc-badge ${esc(item.status)}">${esc(statusLabel(item.status))}</span></td><td><span class="project-doc-owner" title="${esc(owner)}">${esc(initials)}</span></td><td class="project-doc-amount">${formatCHF(item.total_rappen || 0)}</td><td><details class="project-doc-actions"><summary aria-label="Aktionen für ${esc(item.offer_number || item.invoice_number)}">···</summary>${type === "offer" ? offerActions(item) : invoiceActions(item)}</details></td></tr>`).join("") || '<tr><td colspan="5" class="project-doc-empty">Keine Dokumente in diesem Filter.</td></tr>'}</tbody></table></div>
    </article>
    <aside class="project-side-stack"><article class="project-side-panel project-runway"><div class="project-side-heading"><div><h2>Projektbudget</h2><p>Abgerechnet / geplant</p></div><span class="project-doc-badge ${budget && billed > budget ? "overdue" : "accepted"}">${budget ? billed > budget ? "überschritten" : "im Rahmen" : "offen"}</span></div><strong>${formatCHF(billed)}</strong><div class="project-runway-bar" role="progressbar" aria-label="Budget abgerechnet" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.min(100, utilization)}"><span style="width:${Math.min(100, utilization)}%"></span></div><div class="project-runway-meta"><span>${budget ? `${formatCHF(Math.max(0, budget - billed))} frei` : "Kein Budget erfasst"}</span><span>${budget ? `${utilization}%` : "–"}</span></div></article>
      <article class="project-side-panel"><div class="project-side-heading"><div><h2>Letzte Signale</h2><p>Echte Aktivitäten zum Projekt.</p></div></div><div class="project-signal-list">${signals.map((event) => `<div class="project-signal"><i aria-hidden="true"></i><div><strong>${esc(event.summary || event.event_type || "Aktivität")}</strong><span>${esc(customerLabel(project.customer))}</span></div><time>${event.created_at ? esc(formatDate(event.created_at.slice(0, 10))) : "–"}</time></div>`).join("") || '<p class="project-signals-empty">Noch keine Aktivitäten erfasst.</p>'}</div></article></aside>
  </section>`;
}

function renderProjects() {
  const all = state.data.projects;
  const items = all;
  if (!all.length) return `<section class="view">${emptyState("Noch keine Projekte", "Lege das erste Projekt an und halte Status, Kunde und Budget im Blick.", "project")}</section>`;
  const selected = items.find((item) => item.id === state.selectedProjectId) || items[0] || null;
  if (selected) state.selectedProjectId = selected.id;
  const rows = items.map((item) => `<tr class="${item.id === state.selectedProjectId ? "is-selected" : ""}"><td><button class="project-record" type="button" data-project-focus="${esc(item.id)}" aria-pressed="${String(item.id === state.selectedProjectId)}"><strong>${esc(item.title)}</strong><small>${esc(customerLabel(item.customer))}</small></button></td><td><span class="status ${esc(item.status)}">${esc(statusLabel(item.status))}</span></td><td>${formatDate(item.due_date)}</td><td>${formatCHF(item.budget_rappen || 0)}</td><td><div class="table-actions">${actionIconButton("pencil", "Bearbeiten", `data-edit="project" data-id="${esc(item.id)}"`)}${actionIconButton("trash", `Projekt löschen: ${item.title}`, `data-delete-record="project" data-id="${esc(item.id)}"`, "is-danger")}</div></td></tr>`).join("");
  const cards = items.map((item) => `<article class="mobile-card ${item.id === state.selectedProjectId ? "is-selected" : ""}"><div><button class="project-record" type="button" data-project-focus="${esc(item.id)}" aria-pressed="${String(item.id === state.selectedProjectId)}"><strong>${esc(item.title)}</strong><small>${esc(customerLabel(item.customer))} · ${formatDate(item.due_date)}</small></button><div class="table-actions">${actionIconButton("pencil", "Bearbeiten", `data-edit="project" data-id="${esc(item.id)}"`)}${actionIconButton("trash", `Projekt löschen: ${item.title}`, `data-delete-record="project" data-id="${esc(item.id)}"`, "is-danger")}</div></div><span class="status ${esc(item.status)}">${esc(statusLabel(item.status))}</span></article>`).join("");
  return `<section class="view projects-view">${selected ? `${renderProjectOverview(selected, items)}<label class="project-picker"><span>Projekt auswählen</span><select data-project-picker>${items.map(item => `<option value="${esc(item.id)}" ${item.id === selected.id ? "selected" : ""}>${esc(item.title)} · ${esc(customerLabel(item.customer))}</option>`).join("")}</select></label><p class="project-canvas-guide" id="project-canvas-guide"><span>6 Bereiche · horizontal erkunden →</span></p>${renderProjectCanvas(selected)}` : ""}<div class="project-register" id="project-register"><div class="panel-head"><h3>PROJEKTREGISTER</h3><span>${items.length} ${items.length === 1 ? "Projekt" : "Projekte"}</span></div><table class="data-table"><thead><tr><th>Projekt</th><th>Status</th><th>Deadline</th><th>Budget</th><th>Aktionen</th></tr></thead><tbody>${rows}</tbody></table><div class="mobile-card-list">${cards}</div></div></section>`;
}

function invoiceActions(invoice, reveal = false, instance = "record") {
  const buttons = [actionIconButton("pencil", "Bearbeiten", `data-edit="invoice" data-id="${esc(invoice.id)}"`)];
  if (!invoice.is_legacy && invoice.status !== "cancelled") buttons.push(actionIconButton("document", "PDF herunterladen", `data-invoice-action="download" data-id="${esc(invoice.id)}"`));
  if (!invoice.is_legacy && ["draft", "sent", "overdue"].includes(invoice.status)) buttons.push(actionIconButton("paper-plane", invoice.status === "draft" ? "Rechnung senden" : "Rechnung erneut senden", `data-invoice-action="send" data-id="${esc(invoice.id)}"`));
  if (!invoice.is_legacy && ["sent", "overdue"].includes(invoice.status)) buttons.push(actionIconButton("paid", "Als bezahlt markieren", `data-invoice-action="mark_paid" data-id="${esc(invoice.id)}"`), actionIconButton("cancel", "Rechnung stornieren", `data-invoice-action="cancel" data-id="${esc(invoice.id)}"`, "is-danger"));
  if (!invoice.is_legacy) buttons.push(actionIconButton("trash", "Rechnung löschen", `data-delete-record="invoice" data-id="${esc(invoice.id)}"`, "is-danger"));
  const actions = buttons.join("");
  if (!reveal) return `<div class="table-actions">${actions}</div>`;
  const panelId = `invoice-actions-${String(invoice.id).replace(/[^a-zA-Z0-9_-]/g, "-")}-${String(instance).replace(/[^a-zA-Z0-9_-]/g, "-")}`;
  return `<div class="invoice-action-reveal" data-invoice-actions><button class="invoice-action-trigger" type="button" data-invoice-actions-toggle aria-expanded="false" aria-controls="${esc(panelId)}" aria-label="Aktionen für ${esc(invoice.invoice_number)}"><span aria-hidden="true">•••</span></button><div class="table-actions invoice-actions-panel" id="${esc(panelId)}" aria-hidden="true" inert>${actions}</div></div>`;
}
function invoiceStatusControl(invoice) {
  const options = ["draft", "sent", "paid", "overdue", "cancelled"];
  return `<details class="invoice-status-menu"><summary class="status ${esc(invoice.status)}" aria-label="Status von ${esc(invoice.invoice_number)} ändern"><span class="status-dot" aria-hidden="true"></span>${esc(statusLabel(invoice.status))}<span class="status-chevron" aria-hidden="true">⌄</span></summary><div class="invoice-status-options" role="menu" aria-label="Status auswählen">${options.map((status) => `<button class="status-option status-option--${esc(status)}" type="button" role="menuitem" data-invoice-status="${esc(status)}" data-id="${esc(invoice.id)}" ${status === invoice.status ? "aria-current=\"true\"" : ""}><span class="status-dot" aria-hidden="true"></span><span>${esc(statusLabel(status))}</span>${status === invoice.status ? '<span class="status-check" aria-hidden="true">✓</span>' : ""}</button>`).join("")}</div></details>`;
}
function renderInvoices() {
  const all = state.data.invoices;
  const items = sortInvoices(filtered(all.filter((item) => state.filter === "all" || item.status === state.filter), ["invoice_number"]));
  if (!all.length) return `<section class="view">${emptyState("Noch keine Rechnungen", "Erstelle deine erste HEAV-Rechnung als PDF und sende sie direkt an den Kunden.", "invoice")}</section>`;
  const rows = items.map((item) => `<tr class="invoice-record" data-invoice-record><td><strong>${esc(item.invoice_number)}</strong><small>${formatDate(item.issue_date)} · ${item.is_legacy ? "Historisch archiviert" : esc(formatReference(item.payment_reference))}</small></td><td>${esc(customerLabel(item.customer))}</td><td>${item.is_legacy ? `<span class="status ${esc(item.status)}">${esc(statusLabel(item.status))}</span>` : invoiceStatusControl(item)}</td><td><strong>${formatCHF(item.total_rappen)}</strong><small>fällig ${formatDate(item.due_date)}</small></td><td>${invoiceActions(item, true, "desktop")}</td></tr>`).join("");
  const cards = items.map((item) => `<article class="mobile-card invoice-card invoice-record" data-invoice-record><div><strong>${esc(item.invoice_number)} · ${formatCHF(item.total_rappen)}</strong><small>${esc(customerLabel(item.customer))} · fällig ${formatDate(item.due_date)}</small>${item.is_legacy ? `<span class="status ${esc(item.status)}">${esc(statusLabel(item.status))}</span>` : invoiceStatusControl(item)}${invoiceActions(item, true, "mobile")}</div></article>`).join("");
  return `<section class="view">${toolbar("invoice", "Rechnungen durchsuchen …", [["all","Alle"], ...["draft","sent","paid","overdue","cancelled"].map((status) => [status,statusLabel(status)])], invoiceSortControl())}<table class="data-table invoice-table"><thead><tr><th>Rechnung</th><th>Kunde</th><th>Status</th><th>Total</th><th><span class="sr-only">Aktionen</span></th></tr></thead><tbody>${rows}</tbody></table><div class="mobile-card-list invoice-card-list">${cards}</div></section>`;
}

function offerActions(offer) {
  const send = ["draft", "sent"].includes(offer.status) ? actionIconButton("paper-plane", offer.status === "draft" ? "Offerte per E-Mail senden" : "Offerte erneut per E-Mail senden", `data-send-offer="${esc(offer.id)}"`) : "";
  return `<div class="table-actions">${send}${actionIconButton("link", "Link kopieren", `data-copy-offer="${esc(offer.id)}"`)}${actionIconButton("trash", "Offerte endgültig löschen", `data-delete-record="offer" data-id="${esc(offer.id)}"`, "is-danger")}</div>`;
}
function renderOffers() {
  const all = state.data.offers || [];
  if (!all.length) return `<section class="view">${emptyState("Noch keine Offerte", "Erstelle eine Offerte für deinen Kunden und teile sie über das geschützte Portal.", "offer")}</section>`;
  const items = filtered(all.filter(item => state.filter === "all" || item.status === state.filter), ["offer_number", "title"]);
  const customer = item => customerLabel(state.data.customers.find(customer => customer.id === item.customer_id));
  const rows = items.map(item => `<tr><td><strong>${esc(item.offer_number)}</strong><small>${esc(item.title)} · gültig bis ${formatDate(item.valid_until)}</small></td><td>${esc(customer(item))}</td><td><span class="status ${esc(item.status)}">${esc(statusLabel(item.status))}</span></td><td><strong>${formatCHF(item.total_rappen)}</strong></td><td>${offerActions(item)}</td></tr>`).join("");
  const cards = items.map(item => `<article class="mobile-card offer-card"><div><strong>${esc(item.offer_number)}</strong><small>${esc(item.title)}</small><small>${esc(customer(item))} · gültig bis ${formatDate(item.valid_until)}</small><p class="record-amount">${formatCHF(item.total_rappen)}</p>${offerActions(item)}</div><span class="status ${esc(item.status)}">${esc(statusLabel(item.status))}</span></article>`).join("");
  return `<section class="view">${toolbar("offer", "Offerten durchsuchen …", [["all", "Alle"], ["draft", "Entwürfe"], ["sent", "Offen"], ["accepted", "Angenommen"], ["declined", "Abgelehnt"], ["expired", "Abgelaufen"]])}${items.length ? `<table class="data-table"><thead><tr><th>Offerte</th><th>Kunde</th><th>Status</th><th>Total</th><th>Aktionen</th></tr></thead><tbody>${rows}</tbody></table><div class="mobile-card-list">${cards}</div>` : '<p class="no-results" role="status">Keine Offerten gefunden. Passe Suche oder Status an.</p>'}</section>`;
}
function renderPortalRequests() {
  const all = state.data.portalRequests || [];
  const items = filtered(all.filter((item) => state.filter === "all" || item.status === state.filter), ["contact_name", "company", "email", "message"]);
  const actions = (item, includeStatus = true) => {
    if (item.status === "pending") return `<div class="table-actions"><button class="primary-action" data-portal-request-action="accept" data-id="${esc(item.id)}">Akzeptieren</button><button class="danger-button" data-portal-request-action="decline" data-id="${esc(item.id)}">Ablehnen</button><button class="action-icon is-danger" type="button" data-delete-record="portal-request" data-id="${esc(item.id)}" aria-label="Anfrage löschen" title="Anfrage löschen">${actionIcons.trash}</button></div>`;
    if (item.status === "accepted") return `<div class="table-actions"><button class="primary-action" data-portal-request-action="invite" data-id="${esc(item.id)}">Einladung senden</button>${includeStatus ? '<span class="status paid">Akzeptiert</span>' : ''}<button class="action-icon is-danger" type="button" data-delete-record="portal-request" data-id="${esc(item.id)}" aria-label="Anfrage löschen" title="Anfrage löschen">${actionIcons.trash}</button></div>`;
    return `<div class="table-actions">${includeStatus ? '<span class="status cancelled">Abgelehnt</span>' : ''}<button class="action-icon is-danger" type="button" data-delete-record="portal-request" data-id="${esc(item.id)}" aria-label="Anfrage löschen" title="Anfrage löschen">${actionIcons.trash}</button></div>`;
  };
  if (!all.length) return `<section class="view"><div class="empty-state"><h3>Keine Portal-Anfragen.</h3><p>Neue Anfragen aus dem Kundenportal erscheinen hier.</p></div></section>`;
  const rows = items.map((item) => `<tr><td><strong>${esc(item.company || item.contact_name)}</strong><small>${esc(item.contact_name)} · ${formatDate(item.created_at?.slice(0,10))}</small></td><td>${esc(item.email)}</td><td>${esc(item.phone || "–")}</td><td><small>${esc(item.message || "–")}</small></td><td>${actions(item)}</td></tr>`).join("");
  const cards = items.map((item) => `<article class="mobile-card portal-request-card"><div><strong>${esc(item.company || item.contact_name)}</strong><small>${esc(item.contact_name)} · ${esc(item.email)}</small>${item.phone ? `<small>${esc(item.phone)}</small>` : ""}${item.message ? `<p>${esc(item.message)}</p>` : ""}${actions(item, false)}</div><span class="status ${esc(item.status === "pending" ? "draft" : item.status === "accepted" ? "paid" : "cancelled")}">${esc(item.status === "pending" ? "Offen" : item.status === "accepted" ? "Akzeptiert" : "Abgelehnt")}</span></article>`).join("");
  return `<section class="view"><div class="hero-row"><h2>Portal-Anfragen prüfen</h2><p>Beim Akzeptieren wird automatisch ein Kundenprofil erstellt. Der Portalzugang wird erst mit der anschliessenden Einladung freigeschaltet.</p></div>${filterToolbar("Anfragen durchsuchen …", [["all","Alle"],["pending","Offen"],["accepted","Akzeptiert"],["declined","Abgelehnt"]])}<table class="data-table"><thead><tr><th>Anfrage</th><th>E-Mail</th><th>Telefon</th><th>Nachricht</th><th>Aktion</th></tr></thead><tbody>${rows}</tbody></table><div class="mobile-card-list portal-request-cards">${cards}</div></section>`;
}

function renderSettings() {
  const settings = state.data.settings || {};
  return `<section class="view"><div class="hero-row"><h2>Dein Unternehmen</h2><p>Diese Angaben erscheinen auf deinen Rechnungen und in den Rechnungs-E-Mails. Ohne MWST-Nummer berechnet das System automatisch keine MWST.</p></div><div class="settings-grid"><article class="settings-card"><h3>Rechnungsabsender</h3><p>Rechtliche und finanzielle Angaben für alle PDF-Rechnungen.</p><div class="settings-list"><div><span>Firma</span><strong>${esc(settings.company_name || "HEAV")}</strong></div><div><span>Inhaber</span><strong>${esc(settings.owner_name || "Michias Tegegne")}</strong></div><div><span>E-Mail</span><strong>${esc(settings.email || "hello@heav.ch")}</strong></div><div><span>MWST</span><strong>${esc(settings.vat_number || "Nicht MWST-pflichtig")}</strong></div><div><span>IBAN</span><strong>${esc(settings.iban || "Noch offen")}</strong></div></div><button class="primary-action" data-create="settings" style="margin-top:24px">Angaben bearbeiten</button></article><article class="settings-card"><h3>Systemstatus</h3><p>Der Adminbereich nutzt einen getrennten, geschützten Backend-Zugang.</p><div class="settings-list"><div><span>Modus</span><strong>Produktion</strong></div><div><span>Datenbank</span><strong>Supabase RLS</strong></div><div><span>Rechnungsversand</span><strong>billing@heav.ch</strong></div><div><span>Website</span><strong>heav.ch</strong></div></div></article></div></section>`;
}

const renderers = { dashboard: renderDashboard, emails: renderEmails, customers: renderCustomers, projects: renderProjects, invoices: renderInvoices, offers: renderOffers, settings: renderSettings, "portal-requests": renderPortalRequests };
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
  topbarCreate.innerHTML = `${state.view === "projects" ? "Neu" : label} <span aria-hidden="true">+</span>`;
}
function financeNavigation() {
  return `<nav class="finance-nav" aria-label="Finanzen">${[["invoices", "Rechnungen"], ["offers", "Offerten"]].map(([view, label]) => `<button type="button" data-view="${view}" ${state.view === view ? 'aria-current="page"' : ''}>${label}</button>`).join("")}<span class="finance-nav-indicator" aria-hidden="true"></span></nav>`;
}
function activateIndicator(indicator, transform, width) {
  if (!indicator) return;
  indicator.style.width = `${Math.max(1, Math.round(width))}px`;
  indicator.style.transform = transform;
  if (!indicator.classList.contains("is-ready")) requestAnimationFrame(() => indicator.classList.add("is-ready"));
}
function syncMainNavigationIndicator() {
  const nav = document.querySelector(".main-nav");
  const active = nav?.querySelector(".nav-link.is-active");
  const label = active?.querySelector(".nav-label");
  const indicator = nav?.querySelector(".nav-active-indicator");
  if (!active || !label || !indicator) return;
  const navBounds = nav.getBoundingClientRect();
  const labelBounds = label.getBoundingClientRect();
  const x = labelBounds.left - navBounds.left;
  const y = active.offsetTop + active.offsetHeight - 1;
  activateIndicator(indicator, `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)`, labelBounds.width);
}
function syncFinanceNavigation(nav) {
  if (!nav) return;
  nav.querySelectorAll("button[data-view]").forEach((button) => {
    if (button.dataset.view === state.view) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
  const active = nav.querySelector("button[aria-current]");
  activateIndicator(nav.querySelector(".finance-nav-indicator"), `translate3d(${Math.round(active?.offsetLeft || 0)}px, 0, 0)`, active?.offsetWidth || 1);
}
function applyTextEffect(element) {
  if (!element || element.dataset.mpTextEffectApplied) return;
  const text = element.innerText.trim().replace(/\s+/g, " ");
  if (!text) return;
  element.dataset.mpTextEffectApplied = "true";
  element.dataset.textEffect = "per-char";
  element.classList.add("mp-text-effect");
  element.setAttribute("aria-label", text);
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  const textNodes = [];
  let node;
  while ((node = walker.nextNode())) textNodes.push(node);
  textNodes.forEach((textNode) => {
    if (!textNode.nodeValue.trim()) return;
    const fragment = document.createDocumentFragment();
    [...textNode.nodeValue].forEach((character, index) => {
      const span = document.createElement("span");
      span.className = "mp-char";
      span.setAttribute("aria-hidden", "true");
      span.style.setProperty("--mp-char-index", index);
      span.textContent = character === " " ? String.fromCharCode(160) : character;
      fragment.append(span);
    });
    textNode.replaceWith(fragment);
  });
  requestAnimationFrame(() => element.classList.add("mp-text-visible"));
}
function applyBklitShimmer() {
  document.querySelectorAll("[data-bklit-shimmer]").forEach((element) => {
    if (element.dataset.bklitShimmerApplied) return;
    const text = element.dataset.bklitShimmer || element.textContent.trim();
    if (!text) return;
    element.dataset.bklitShimmerApplied = "true";
    element.setAttribute("aria-label", text);
    element.replaceChildren(...[...text].map((character, index) => {
      const span = document.createElement("span");
      span.className = "bklit-shimmer-char";
      span.setAttribute("aria-hidden", "true");
      span.style.setProperty("--bklit-shimmer-index", index);
      span.textContent = character === " " ? String.fromCharCode(160) : character;
      return span;
    }));
  });
}
function applyMotionPrimitives() {
  const items = [...content.querySelectorAll(":scope > .finance-nav, :scope > .view > *:not(.mobile-card-list)")];
  items.forEach((item, index) => {
    item.dataset.motion = "item";
    item.style.setProperty("--motion-delay", `${Math.min(index, 8) * 45}ms`);
  });
  content.querySelectorAll(
    ":scope > .view > .hero-row h2, :scope > .view > .dashboard-intro h2, :scope > .view > .project-canvas-head h3, :scope > .view > .dashboard-focus-head h3",
  ).forEach(applyTextEffect);
}
function render() {
  content.classList.remove("is-view-entering");
  const ownerName = state.data.settings?.owner_name?.trim() || "Studio-Konto";
  document.querySelector(".studio-owner-name").textContent = ownerName;
  document.querySelector(".studio-owner-mark").textContent = ownerName.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
  shell.classList.toggle("studio-projects-active", state.view === "projects");
  title.textContent = state.view === "projects" ? "Operate, not decorate." : viewNames[state.view];
  syncTopbarAction();
  const finance = ["invoices", "offers"].includes(state.view);
  const viewMarkup = renderers[state.view]();
  const currentFinanceNavigation = content.querySelector(":scope > .finance-nav");
  if (finance && currentFinanceNavigation) {
    const currentView = content.querySelector(":scope > .view");
    if (currentView) currentView.outerHTML = viewMarkup;
    else currentFinanceNavigation.insertAdjacentHTML("afterend", viewMarkup);
  } else {
    content.innerHTML = (finance ? financeNavigation() : "") + viewMarkup;
  }
  document.querySelectorAll(".nav-link,.bottom-link").forEach((item) => {
    const active = item.dataset.view === state.view;
    item.classList.toggle("is-active", active);
    if (active) item.setAttribute("aria-current", "page"); else item.removeAttribute("aria-current");
  });
  syncMainNavigationIndicator();
  if (finance) syncFinanceNavigation(content.querySelector(":scope > .finance-nav"));
  applyMotionPrimitives();
  content.focus({ preventScroll: true });
}
async function refresh() { state.data = await adapter.loadAll(); render(); }
function navigationFocusable() { return [...document.querySelectorAll("#sidebar a[href],#sidebar button:not([disabled])")].filter((element) => element.getClientRects().length); }
function clearNavigationCloseTimer() {
  clearTimeout(navCloseTimer);
  navCloseTimer = null;
}
function lockNavigationScroll() {
  if (navLockedScrollY !== null) {
    window.scrollTo({ top: navLockedScrollY, left: 0, behavior: "auto" });
    return;
  }
  navLockedScrollY = window.scrollY;
  document.documentElement.classList.add("nav-scroll-locked");
  document.body.classList.add("nav-scroll-locked");
}
function releaseNavigationScroll() {
  if (navLockedScrollY === null) return;
  const scrollY = navLockedScrollY;
  navLockedScrollY = null;
  document.documentElement.classList.remove("nav-scroll-locked");
  document.body.classList.remove("nav-scroll-locked");
  window.scrollTo({ top: scrollY, left: 0, behavior: "auto" });
}
function setNavigationSemantics(isOpen) {
  navMenuButton.setAttribute("aria-expanded", String(isOpen));
  workspace.inert = isOpen;
  navigationPanel.inert = !isOpen && mobileNavigationQuery.matches;
  if (isOpen) {
    navigationPanel.removeAttribute("aria-hidden");
    navigationPanel.setAttribute("role", "dialog");
    navigationPanel.setAttribute("aria-modal", "true");
  } else {
    if (mobileNavigationQuery.matches) navigationPanel.setAttribute("aria-hidden", "true");
    else navigationPanel.removeAttribute("aria-hidden");
    navigationPanel.removeAttribute("role");
    navigationPanel.removeAttribute("aria-modal");
  }
}
function finalizeNavigationClose({ restoreFocus = true } = {}) {
  clearNavigationCloseTimer();
  shell.classList.remove("nav-open", "nav-closing");
  setNavigationSemantics(false);
  releaseNavigationScroll();
  if (restoreFocus && navRestoreFocus === navMenuButton) navMenuButton.focus({ preventScroll: true });
  navRestoreFocus = null;
}
function openNavigation() {
  clearNavigationCloseTimer();
  shell.classList.remove("nav-closing");
  shell.classList.add("nav-open");
  if (mobileNavigationQuery.matches) lockNavigationScroll();
  setNavigationSemantics(true);
  navRestoreFocus = document.activeElement;
  requestAnimationFrame(() => {
    syncMainNavigationIndicator();
    navigationPanel.querySelector(".nav-link.is-active")?.focus({ preventScroll: true });
  });
}
function beginNavigationClose({ restoreFocus = true } = {}) {
  const shouldAnimate = shell.classList.contains("nav-open") && mobileNavigationQuery.matches && !reducedMotionQuery.matches;
  if (!shouldAnimate) {
    finalizeNavigationClose({ restoreFocus });
    return;
  }
  clearNavigationCloseTimer();
  shell.classList.remove("nav-open");
  shell.classList.add("nav-closing");
  setNavigationSemantics(false);
  if (restoreFocus && navRestoreFocus === navMenuButton) navMenuButton.focus({ preventScroll: true });
  navCloseTimer = setTimeout(() => finalizeNavigationClose({ restoreFocus: false }), NAV_EXIT_DURATION_MS);
}
function setNavigationOpen(open, options = {}) {
  if (open) openNavigation();
  else beginNavigationClose(options);
}

mobileNavigationQuery.addEventListener("change", (event) => {
  const hadModalState = shell.matches(".nav-open, .nav-closing");
  const focusWasInNavigation = navigationPanel.contains(document.activeElement) || navigationWasLastFocusContext;
  if (hadModalState) finalizeNavigationClose({ restoreFocus: false });
  else setNavigationSemantics(false);
  if (event.matches && focusWasInNavigation) {
    requestAnimationFrame(() => navMenuButton.focus({ preventScroll: true }));
  } else if (!event.matches && hadModalState) {
    navigationPanel.querySelector(".nav-link.is-active")?.focus({ preventScroll: true });
  }
});

if (mobileNavigationQuery.matches) setNavigationSemantics(false);

function animateViewEntrance() {
  content.classList.remove("is-view-entering");
  if (reducedMotionQuery.matches) return;
  void content.offsetWidth;
  content.classList.add("is-view-entering");
  content.querySelector(".view")?.addEventListener("animationend", () => content.classList.remove("is-view-entering"), { once: true });
}

function setView(view) { state.view = view; state.query = ""; state.filter = "all"; document.querySelectorAll(".nav-link").forEach((item) => item.classList.toggle("is-active", item.dataset.view === view)); setNavigationOpen(false, { restoreFocus: false }); render(); animateViewEntrance(); }

function customerOptions(selected = "") { return state.data.customers.map((item) => `<option value="${esc(item.id)}" ${item.id === selected ? "selected" : ""}>${esc(customerLabel(item))}</option>`).join(""); }
function departmentOptions(customerId = "", selected = "") { return (state.data.departments || []).filter((item) => item.customer_id === customerId && item.active !== false).map((item) => `<option value="${esc(item.id)}" ${item.id === selected ? "selected" : ""}>${esc(item.name)}${item.contact_name ? ` · ${esc(item.contact_name)}` : ""}</option>`).join(""); }
function projectOptions(customerId = "", selected = "") { return state.data.projects.filter((item) => item.customer_id === customerId).map((item) => `<option value="${esc(item.id)}" ${item.id === selected ? "selected" : ""}>${esc(item.title)}</option>`).join(""); }
function field(label, name, type = "text", value = "", wide = false, extra = "") { return `<label class="form-field ${wide ? "wide" : ""}"><span>${esc(label)}</span><input type="${type}" name="${name}" value="${esc(value)}" ${extra}></label>`; }
function openEditor(type, existing = null, context = {}) {
  const prefill = !existing && context.prefill && typeof context.prefill === "object" ? context.prefill : {};
  const contextProjectId = context.projectId || prefill.project_id || "";
  const contextProject = contextProjectId ? state.data.projects.find((item) => item.id === contextProjectId) : null;
  formError.textContent = "";
  dialogForm.dataset.type = type;
  dialogForm.dataset.editId = existing?.id || "";
  dialogForm.dataset.templateKey = existing?.template_key || context.templateKey || "";
  dialogKicker.textContent = existing ? "BEARBEITEN" : "NEU";
  if (type === "customer") {
    const item = existing || prefill;
    const customerDepartments = existing ? (state.data.departments || []).filter((department) => department.customer_id === existing.id && department.active !== false) : [];
    const departmentInviteList = customerDepartments.length ? `<div class="department-invite-list wide"><span>Portalzugänge</span>${customerDepartments.map((department) => `<div><strong>${esc(department.name)}</strong><button class="text-button" type="button" data-portal-invite="${esc(existing.id)}" data-department-id="${esc(department.id)}">Einladung senden</button></div>`).join("")}</div>` : "";
    dialogTitle.textContent = existing ? "Kunde bearbeiten" : "Kunde erfassen";
    dialogBody.innerHTML = `<p class="form-hint">Firma oder Kontaktperson genügt. Adresse, E-Mail und Telefon kannst du später ergänzen.</p><div class="form-grid">${field("Firma","company","text",item.company || "")}${field("Kontaktperson","contact_name","text",item.contact_name || "")}${field("E-Mail","email","email",item.email || "")}${field("Telefon","phone","tel",item.phone || "")}${field("Strasse / Nr.","address_line1","text",item.address_line1 || "",true)}${field("PLZ","postal_code","text",item.postal_code || "")}${field("Ort","city","text",item.city || "")}${field("Land","country","text",item.country || "Schweiz",true)}<details class="form-disclosure wide"><summary><span>Weitere Angaben</span><small>Abteilung nur bei Bedarf</small></summary><div class="form-grid">${field("Abteilungsname","department_name","text","",true)}${field("Abteilung · Kontaktperson","department_contact_name","text", "")}${field("Abteilung · E-Mail","department_contact_email","email", "")}${departmentInviteList}</div></details></div>`;
  } else if (type === "project") {
    if (!state.data.customers.length) { showToast("Bitte zuerst einen Kunden erfassen.", "error"); setView("customers"); return; }
    const item = existing || prefill;
    dialogTitle.textContent = existing ? "Projekt bearbeiten" : "Projekt anlegen";
    dialogBody.innerHTML = `<div class="form-grid"><label class="form-field wide"><span>Kunde *</span><select name="customer_id" required><option value="">Bitte wählen</option>${customerOptions(item.customer_id)}</select></label><details class="form-disclosure wide"><summary><span>Weitere Angaben</span><small>Abteilung: Allgemein</small></summary><label class="form-field wide"><span>Abteilung</span><select name="department_id"><option value="">Zuerst Kunde wählen</option>${departmentOptions(item.customer_id, item.department_id)}</select></label></details>${field("Projekttitel *","title","text",item.title || "",true,"required")}<label class="form-field"><span>Status</span><select name="status">${[["planning","Planung"],["active","Aktiv"],["completed","Abgeschlossen"],["on_hold","Pausiert"]].map(([v,l]) => `<option value="${v}" ${item.status === v ? "selected" : ""}>${l}</option>`).join("")}</select></label>${field("Budget CHF","budget","number",item.budget_rappen != null ? item.budget_rappen / 100 : "",false,'min="0" step="0.05"')}${field("Start","start_date","date",item.start_date || "")}${field("Deadline","due_date","date",item.due_date || "")}<label class="form-field wide"><span>Beschreibung</span><textarea name="description">${esc(item.description || "")}</textarea></label></div>`;
  } else if (type === "invoice") {
    if (!state.data.customers.length) { showToast("Bitte zuerst einen Kunden erfassen.", "error"); setView("customers"); return; }
    const item = existing || prefill;
    dialogTitle.textContent = existing ? `Rechnung bearbeiten · ${item.invoice_number}` : "Rechnung erstellen";
    const vatRegistered = validVatNumber(state.data.settings?.vat_number);
    const customerId = item.customer_id || contextProject?.customer_id || "";
    const projectId = item.project_id || contextProject?.id || "";
    dialogBody.innerHTML = `<div class="form-grid"><label class="form-field"><span>Kunde *</span><select name="customer_id" required><option value="">Bitte wählen</option>${customerOptions(customerId)}</select></label><details class="form-disclosure wide"><summary><span>Weitere Angaben</span><small>Abteilung: Allgemein</small></summary><label class="form-field wide"><span>Abteilung</span><select name="department_id"><option value="">Zuerst Kunde wählen</option>${departmentOptions(customerId, item.department_id || contextProject?.department_id)}</select></label></details><label class="form-field"><span>Projekt</span><select name="project_id"><option value="">Kein Projekt</option>${projectOptions(customerId,projectId)}</select></label>${existing ? `<label class="form-field wide"><span>Versand- und Zahlungsstatus · auch für manuell versandte PDFs</span><select name="status">${["draft","sent","paid","overdue","cancelled"].map((status) => `<option value="${status}" ${item.status === status ? "selected" : ""}>${statusLabel(status)}</option>`).join("")}</select></label>` : ""}${!existing ? `<div class="sequence-note wide"><strong>Automatische Referenz</strong><span>Die Zahlungsreferenz wird beim Speichern fortlaufend und buchhaltungssicher vergeben.</span></div>` : ""}${field(vatRegistered ? "MWST %" : "MWST % · nicht registriert","tax_rate","number",item.tax_rate ?? (vatRegistered ? (state.data.settings?.default_tax_rate ?? 0) : 0),false,vatRegistered ? 'min="0" step="0.1"' : 'readonly aria-readonly="true"')}${field("Rechnungsdatum *","issue_date","date",item.issue_date || today(),false,"required")}${field("Fällig am *","due_date","date",item.due_date || plusDays(today(),state.data.settings?.default_due_days || 30),false,"required")}<div class="invoice-items"><span class="items-label">Positionen *</span><div id="invoice-item-list"></div><div class="invoice-add-actions"><button class="secondary-button" type="button" data-add-item>Position hinzufügen</button><button class="secondary-button" type="button" data-add-discount>Rabatt hinzufügen</button></div></div><label class="form-field wide"><span>Hinweis auf Rechnung</span><textarea name="notes">${esc(item.notes || "")}</textarea></label><div class="invoice-total" id="invoice-total">TOTAL&nbsp;&nbsp; CHF 0.00</div></div>`;
    (item.items?.length ? item.items : [null]).forEach((invoiceItem) => addInvoiceItem(invoiceItem));
  } else if (type === "offer") {
    if (!state.data.customers.length) { showToast("Bitte zuerst einen Kunden erfassen.", "error"); setView("customers"); return; }
    const vatRegistered = validVatNumber(state.data.settings?.vat_number);
    dialogTitle.textContent = "Offerte erstellen";
    const customerId = contextProject?.customer_id || "";
    const projectId = contextProject?.id || "";
    const offerTitle = contextProject ? `Offerte · ${contextProject.title}` : "";
    dialogBody.innerHTML = `<div class="form-grid"><label class="form-field"><span>Kunde *</span><select name="customer_id" required><option value="">Bitte wählen</option>${customerOptions(customerId)}</select></label><details class="form-disclosure wide"><summary><span>Weitere Angaben</span><small>Abteilung: Allgemein</small></summary><label class="form-field wide"><span>Abteilung</span><select name="department_id"><option value="">Zuerst Kunde wählen</option>${departmentOptions(customerId, contextProject?.department_id)}</select></label></details><label class="form-field"><span>Projekt</span><select name="project_id"><option value="">Kein Projekt</option>${projectOptions(customerId,projectId)}</select></label>${field("Titel *","title","text",offerTitle,true,"required")}${field(vatRegistered ? "MWST %" : "MWST % · nicht registriert","tax_rate","number",vatRegistered ? (state.data.settings?.default_tax_rate ?? 0) : 0,false,vatRegistered ? 'min="0" step="0.1"' : 'readonly aria-readonly="true"')}${field("Offertdatum *","issue_date","date",today(),false,"required")}${field("Gültig bis *","valid_until","date",plusDays(today(),30),false,"required")}<div class="invoice-items"><span class="items-label">Leistungen *</span><div id="invoice-item-list"></div><div class="invoice-add-actions"><button class="secondary-button" type="button" data-add-item>Position hinzufügen</button><button class="secondary-button" type="button" data-add-discount>Rabatt hinzufügen</button></div></div><label class="form-field wide"><span>Hinweis für den Kunden</span><textarea name="notes"></textarea></label><label class="form-field wide"><span>Verbindlichkeit bei Annahme *</span><textarea name="terms" required>Mit der Annahme dieser Offerte bestätigst du verbindlich die aufgeführten Leistungen, Beträge und Bedingungen.</textarea></label><div class="invoice-total" id="invoice-total">TOTAL&nbsp;&nbsp; CHF 0.00</div></div>`;
    addInvoiceItem();
  } else if (type === "email-template") {
    const template = emailTemplateValue(existing?.template_key);
    const definition = emailTemplateDefinition(existing?.template_key);
    dialogKicker.textContent = "MAIL-TEXT";
    dialogTitle.textContent = `${definition[1]} anpassen`;
    dialogBody.innerHTML = `<p class="form-hint">Verfügbare Platzhalter: ${esc(definition[3])}</p><div class="form-grid">${field("Betreff","subject_template","text",template.subject_template || "",true,"required")}<label class="form-field wide"><span>Text</span><textarea name="text_template" rows="12" required>${esc(template.text_template || "")}</textarea></label></div>`;
  } else {
    const settings = state.data.settings || {};
    dialogKicker.textContent = "EINSTELLUNGEN"; dialogTitle.textContent = "Rechnungsabsender";
    dialogBody.innerHTML = `<div class="form-grid">${field("Firma *","company_name","text",settings.company_name || "HEAV",false,"required")}${field("Inhaber *","owner_name","text",settings.owner_name || "Michias Tegegne",false,"required")}${field("E-Mail *","email","email",settings.email || "hello@heav.ch",false,"required")}${field("Telefon","phone","tel",settings.phone || "")}${field("Website","website_url","url",settings.website_url || "https://heav.ch")}${field("Instagram URL","instagram_url","url",settings.instagram_url || "")}${field("Strasse / Nr. *","address_line1","text",settings.address_line1 || "",true,"required")}${field("PLZ *","postal_code","text",settings.postal_code || "",false,"required")}${field("Ort *","city","text",settings.city || "",false,"required")}${field("IBAN *","iban","text",settings.iban || "",true,"required")}${field("MWST-Nr. · leer lassen, wenn nicht registriert","vat_number","text",settings.vat_number || "",true)}${field("Standard-MWST %","default_tax_rate","number",settings.vat_number ? (settings.default_tax_rate ?? 0) : 0,false,'min="0" step="0.1"')}${field("Standard-Zahlungsfrist (Tage)","default_due_days","number",settings.default_due_days || 30,false,'min="1" step="1"')}${field("Zahlungserinnerung vor Fälligkeit (Tage)","invoice_reminder_days","number",settings.invoice_reminder_days || 7,false,'min="3" max="10" step="1"')}</div>`;
  }
  const customerField = dialogForm.elements.customer_id;
  const departmentField = dialogForm.elements.department_id;
  if (customerField && departmentField) {
    const syncDepartments = () => {
      const selected = departmentField.value;
      departmentField.innerHTML = departmentOptions(customerField.value, selected) || '<option value="">Keine Abteilung vorhanden</option>';
      departmentField.disabled = !customerField.value;
      if (!departmentField.value && departmentField.options.length) departmentField.selectedIndex = 0;
    };
    customerField.addEventListener("change", syncDepartments);
    syncDepartments();
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
    if (dialogForm.dataset.editId) {
      await adapter.updateCustomer(dialogForm.dataset.editId, payload);
      if (data.department_name?.trim()) await adapter.saveDepartment({ customer_id: dialogForm.dataset.editId, name: data.department_name.trim(), contact_name: data.department_contact_name.trim(), contact_email: data.department_contact_email.trim(), is_default: false });
    } else {
      const created = await adapter.saveCustomer(payload);
      if (data.department_name?.trim() && created?.id) await adapter.saveDepartment({ customer_id: created.id, name: data.department_name.trim(), contact_name: data.department_contact_name.trim(), contact_email: data.department_contact_email.trim(), is_default: false });
    }
  }
  if (type === "project") { const payload = { customer_id: data.customer_id, department_id: data.department_id, title: data.title.trim(), status: data.status, budget_rappen: Math.round(Number(data.budget || 0) * 100), start_date: data.start_date || null, due_date: data.due_date || null, description: data.description.trim() }; if (dialogForm.dataset.editId) await adapter.updateProject(dialogForm.dataset.editId, payload); else await adapter.saveProject(payload); }
  if (type === "invoice") {
    const editorItems = readInvoiceEditorItems();
    const items = editorItems.map((item) => ({ description: item.description, quantity: item.quantity, unit_price_rappen: Math.round(item.unitPrice * 100) }));
    const payload = { customerId: data.customer_id, issueDate: data.issue_date, dueDate: data.due_date, items: editorItems };
    const errors = validateInvoice(payload); if (Object.keys(errors).length) { formError.textContent = Object.values(errors)[0]; return false; }
    const invoicePayload = { customer_id: data.customer_id, department_id: data.department_id, project_id: data.project_id || null, issue_date: data.issue_date, due_date: data.due_date, status: data.status || "draft", tax_rate: Number(data.tax_rate || 0), notes: data.notes.trim(), items }; if (dialogForm.dataset.editId) await adapter.updateInvoice(dialogForm.dataset.editId, invoicePayload); else await adapter.saveInvoice(invoicePayload);
  }
  if (type === "offer") {
    const editorItems = readInvoiceEditorItems();
    const items = editorItems.map((item) => ({ description: item.description, quantity: item.quantity, unit_price_rappen: Math.round(item.unitPrice * 100) }));
    if (!data.customer_id || !data.title.trim() || !data.issue_date || !data.valid_until || data.valid_until < data.issue_date || !items.length) { formError.textContent = "Bitte Kunde, Titel, gültige Daten und mindestens eine Leistung ausfüllen."; return false; }
    await adapter.saveOffer({ customer_id: data.customer_id, department_id: data.department_id, project_id: data.project_id || null, title: data.title.trim(), issue_date: data.issue_date, valid_until: data.valid_until, tax_rate: Number(data.tax_rate || 0), notes: data.notes.trim(), terms: data.terms.trim(), items });
  }
  if (type === "email-template") {
    await adapter.saveEmailTemplate(dialogForm.dataset.templateKey, { subject_template: data.subject_template.trim(), text_template: data.text_template.trim() });
  }
  if (type === "settings") {
    const vatNumber = normalizeVatNumber(data.vat_number);
    if (vatNumber && !validVatNumber(vatNumber)) {
      formError.textContent = "MWST-Nummer im Format CHE-123.456.789 MWST eingeben oder leer lassen.";
      return false;
    }
    await adapter.saveSettings({ company_name: data.company_name.trim(), owner_name: data.owner_name.trim(), email: data.email.trim(), phone: data.phone.trim(), website_url: data.website_url.trim() || "https://heav.ch", instagram_url: data.instagram_url.trim(), address_line1: data.address_line1.trim(), postal_code: data.postal_code.trim(), city: data.city.trim(), iban: data.iban.trim(), vat_number: vatNumber, default_tax_rate: vatNumber ? Number(data.default_tax_rate || 0) : 0, default_due_days: Number(data.default_due_days || 30), invoice_reminder_days: [3, 7, 10].includes(Number(data.invoice_reminder_days)) ? Number(data.invoice_reminder_days) : 7 });
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

async function changeInvoiceStatus(id, nextStatus, button) {
  const current = state.data.invoices.find((item) => item.id === id);
  if (!current || current.status === nextStatus) return;
  if (["sent", "paid", "cancelled"].includes(nextStatus)) {
    const action = nextStatus === "sent" ? "send" : nextStatus === "paid" ? "mark_paid" : "cancel";
    await invoiceAction(id, action, button);
    return;
  }
  button.disabled = true;
  try {
    await adapter.updateInvoice(id, {
      customer_id: current.customer_id,
      project_id: current.project_id || null,
      issue_date: current.issue_date,
      due_date: current.due_date,
      status: nextStatus,
      tax_rate: current.tax_rate || 0,
      notes: current.notes || "",
      items: current.items || [],
    });
    await refresh();
    showToast(`Rechnung ist jetzt ${statusLabel(nextStatus).toLowerCase()}.`);
  } catch (error) {
    showToast(error.message || "Status konnte nicht geändert werden.", "error");
  } finally {
    button.disabled = false;
  }
}

async function deleteRecord(type, id, button) {
  const labels = { customer: "diesen Kunden und alle verknüpften Projekte, Rechnungen, Offerten und Portalzugänge", project: "dieses Projekt und die verknüpften Dokumente", invoice: "diese Rechnung endgültig", offer: "diese Offerte endgültig", "portal-request": "diese Portal-Anfrage" };
  if (!await confirmAction({ kicker: "LÖSCHEN", title: "Eintrag wirklich endgültig löschen?", copy: `Willst du ${labels[type]} wirklich löschen? Verknüpfte Daten werden ebenfalls entfernt. Diese Aktion kann nicht rückgängig gemacht werden.`, confirmLabel: "Endgültig löschen", destructive: true })) return;
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
      const result = await adapter.sendPortalInvite(request.customer_id);
      showDispatchSuccess(result?.alreadyActive ? "Portalzugang bereits aktiv" : "Einladung versendet", result?.alreadyActive ? "Diese Anfrage hat für den Kunden bereits einen aktiven Zugang." : "Der sichere Zugang wurde per E-Mail verschickt.");
    } else {
      await adapter.processPortalRequest(id, action);
      await refresh();
      showToast(action === "accept" ? "Anfrage akzeptiert. Kundenprofil wurde erstellt." : "Anfrage abgelehnt.");
    }
  } catch (error) { showToast(error.message || "Anfrage konnte nicht verarbeitet werden.", "error"); }
  finally { button.disabled = false; }
}

async function departmentInviteAction(customerId, departmentId, button) {
  const customer = state.data.customers.find((item) => item.id === customerId);
  const department = state.data.departments.find((item) => item.id === departmentId);
  if (!customer || !department) return;
  const email = department.contact_email || customer.email || "keine hinterlegte E-Mail";
  if (!await confirmAction({ kicker: "PORTAL-EINLADUNG", title: `${department.name} einladen?`, copy: `Die Einladung wird an ${email} gesendet und sieht nur diese Abteilung.`, confirmLabel: "Einladung senden" })) return;
  button.disabled = true;
  try {
    const result = await adapter.sendPortalInvite(customer.id, department.id);
    showDispatchSuccess(result?.alreadyActive ? "Portalzugang bereits aktiv" : "Einladung versendet", result?.alreadyActive ? `${department.name} hat bereits einen aktiven Portalzugang.` : `${department.name} ist jetzt für das eigene Portal freigeschaltet.`);
  } catch (error) { showToast(error.message || "Einladung konnte nicht versendet werden.", "error"); }
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
  const recipient = offer?.department?.contact_email || customer?.email || "die Abteilungs-E-Mail";
  if (!await confirmAction({ kicker: "OFFERTE VERSENDEN", title: "Offerte per E-Mail senden?", copy: `${offer?.offer_number || "Diese Offerte"} wird im Kundenportal freigegeben und an ${recipient} gesendet.`, confirmLabel: "Jetzt senden" })) return;
  button.disabled = true;
  try {
    await adapter.shareOffer(id);
    const requestKey = state.sendRequestKeys.get(id) || crypto.randomUUID();
    state.sendRequestKeys.set(id, requestKey);
    const result = await adapter.sendOffer(id, requestKey);
    state.sendRequestKeys.delete(id);
    await refresh();
    showDispatchSuccess("Offerte versendet", `Der geschützte Portal-Link wurde an ${result?.recipient || recipient} gesendet.`);
  } catch (error) { showToast(error.message || "Offerte konnte nicht per E-Mail gesendet werden.", "error"); }
  finally { button.disabled = false; }
}

function assistantText(value, maxLength = 1000) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}
function assistantCustomerId(payload = {}) {
  const direct = state.data.customers.find((customer) => customer.id === payload.customer_id);
  if (direct) return direct.id;
  const email = assistantText(payload.customer_email || payload.email, 320).toLowerCase();
  if (email) {
    const byEmail = state.data.customers.find((customer) => String(customer.email || "").trim().toLowerCase() === email);
    if (byEmail) return byEmail.id;
  }
  const label = assistantText(payload.customer_company || payload.company || payload.customer_contact_name || payload.contact_name, 160).toLowerCase();
  return state.data.customers.find((customer) => customerLabel(customer).trim().toLowerCase() === label)?.id || "";
}
function normalizeAssistantProposal(raw) {
  if (!raw || typeof raw !== "object" || !["customer", "project", "invoice", "send_invoice"].includes(raw.kind)) return null;
  const id = assistantText(raw.id, 100) || crypto.randomUUID();
  const payload = raw.payload && typeof raw.payload === "object" && !Array.isArray(raw.payload) ? raw.payload : {};
  if (raw.kind === "customer") {
    const customer = {
      company: assistantText(payload.company, 160), contact_name: assistantText(payload.contact_name, 160), email: assistantText(payload.email, 320),
      phone: assistantText(payload.phone, 80), address_line1: assistantText(payload.address_line1, 240), postal_code: assistantText(payload.postal_code, 40),
      city: assistantText(payload.city, 120), country: assistantText(payload.country, 120) || "Schweiz",
    };
    if (!customer.company && !customer.contact_name) return null;
    return { id, kind: raw.kind, label: assistantText(raw.label, 180) || "Kundenentwurf", payload: customer };
  }
  if (raw.kind === "project") {
    const project = {
      customer_id: assistantCustomerId(payload), customer_email: assistantText(payload.customer_email, 320), customer_company: assistantText(payload.customer_company, 160),
      title: assistantText(payload.title, 200), description: assistantText(payload.description, 6000), status: ["planning", "active", "completed", "on_hold"].includes(payload.status) ? payload.status : "planning",
      start_date: assistantText(payload.start_date, 10), due_date: assistantText(payload.due_date, 10),
    };
    const budget = Number(payload.budget_rappen);
    if (payload.budget_rappen != null && payload.budget_rappen !== "" && Number.isFinite(budget)) project.budget_rappen = Math.max(0, Math.round(budget));
    if (!project.title) return null;
    return { id, kind: raw.kind, label: assistantText(raw.label, 180) || "Projektentwurf", payload: project };
  }
  if (raw.kind === "invoice") {
    const items = Array.isArray(payload.items) ? payload.items.slice(0, 10).map((item) => ({
      description: assistantText(item?.description, 1000), quantity: Math.max(.01, Number(item?.quantity) || 1),
      unit_price_rappen: item?.unit_price_rappen !== null && item?.unit_price_rappen !== undefined && item?.unit_price_rappen !== ""
        ? Math.round(Number(item.unit_price_rappen))
        : null,
    })).filter((item) => item.description && item.unit_price_rappen !== null && Number.isFinite(item.unit_price_rappen) && item.unit_price_rappen >= 0) : [];
    if (!items.length) return null;
    const invoicePayload = {
      customer_id: assistantCustomerId(payload), customer_email: assistantText(payload.customer_email, 320), customer_company: assistantText(payload.customer_company, 160),
      project_id: assistantText(payload.project_id, 80), issue_date: assistantText(payload.issue_date, 10) || today(), due_date: assistantText(payload.due_date, 10) || plusDays(today(), state.data.settings?.default_due_days || 30),
      notes: assistantText(payload.notes, 6000), items,
    };
    const taxRate = Number(payload.tax_rate);
    if (payload.tax_rate != null && payload.tax_rate !== "" && Number.isFinite(taxRate)) invoicePayload.tax_rate = Math.max(0, taxRate);
    return { id, kind: raw.kind, label: assistantText(raw.label, 180) || "Rechnungsentwurf", payload: invoicePayload };
  }
  const invoice = state.data.invoices.find((item) => item.id === payload.invoice_id || item.invoice_number === payload.invoice_number);
  if (!invoice || !["draft", "sent", "overdue"].includes(invoice.status)) return null;
  return { id, kind: raw.kind, label: assistantText(raw.label, 180) || `${invoice.invoice_number} senden`, payload: { invoice_id: invoice.id } };
}
function assistantProposalButton(proposal) {
  const labels = { customer: "Kundenentwurf prüfen", project: "Projektentwurf prüfen", invoice: "Rechnungsentwurf prüfen", send_invoice: "Versand prüfen" };
  const detail = proposal.label ? `<span>${esc(proposal.label)}</span>` : "";
  return `<article class="assistant-proposal"><div><span class="kicker">VORSCHLAG</span>${detail}</div><button class="secondary-button" type="button" data-assistant-proposal="${esc(proposal.id)}">${labels[proposal.kind]}</button></article>`;
}
function appendAssistantMessage(role, copy, proposals = [], attachmentName = "") {
  const article = document.createElement("article");
  article.className = `assistant-message ${role === "assistant" ? "is-assistant" : "is-user"}`;
  const normalized = proposals.map(normalizeAssistantProposal).filter(Boolean);
  normalized.forEach((proposal) => assistantState.proposals.set(proposal.id, proposal));
  article.innerHTML = `${attachmentName ? `<small>${esc(attachmentName)}</small>` : ""}<p>${esc(copy)}</p>${normalized.length ? `<div class="assistant-proposals">${normalized.map(assistantProposalButton).join("")}</div>` : ""}`;
  assistantMessages.append(article);
  assistantMessages.scrollTop = assistantMessages.scrollHeight;
}
function updateAssistantAttachment() {
  if (!assistantState.image) {
    assistantAttachment.hidden = true;
    assistantAttachment.innerHTML = "";
    return;
  }
  assistantAttachment.hidden = false;
  assistantAttachment.innerHTML = `<span>${esc(assistantState.image.name)}</span><button type="button" data-remove-assistant-image aria-label="Screenshot entfernen">×</button>`;
}
function readAsDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Screenshot konnte nicht gelesen werden."));
    reader.readAsDataURL(blob);
  });
}
async function prepareAssistantImage(file) {
  const allowed = new Set(["image/png", "image/jpeg", "image/webp"]);
  if (!allowed.has(file.type)) throw new Error("Bitte PNG, JPEG oder WebP verwenden.");
  if (file.size > 5 * 1024 * 1024) throw new Error("Der Screenshot darf höchstens 5 MB gross sein.");
  const bitmap = await createImageBitmap(file);
  if (bitmap.width < 1 || bitmap.height < 1 || bitmap.width * bitmap.height > 24000000) { bitmap.close(); throw new Error("Der Screenshot hat ungültige Abmessungen."); }
  const scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext("2d", { alpha: false }).drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/webp", .84));
  if (!blob) throw new Error("Screenshot konnte nicht vorbereitet werden.");
  return { name: file.name.slice(0, 160), mimeType: "image/webp", dataUrl: await readAsDataUrl(blob) };
}
function openAssistant() {
  if (assistantDialog.open) return;
  assistantDialog.showModal();
  requestAnimationFrame(() => assistantInput.focus({ preventScroll: true }));
}
function closeAssistant() {
  if (assistantDialog.open) assistantDialog.close();
}
function assistantThreadStorageKey() {
  return assistantState.ownerId ? `heav-assistant-thread:${assistantState.ownerId}` : null;
}
function setAssistantThread(id) {
  assistantState.threadId = id;
  const key = assistantThreadStorageKey();
  if (key) localStorage.setItem(key, id);
  assistantDelete.hidden = false;
}
function configureAssistantOwner(ownerId) {
  assistantState.ownerId = ownerId;
  localStorage.removeItem("heav-assistant-thread");
  assistantState.threadId = localStorage.getItem(assistantThreadStorageKey());
  assistantDelete.hidden = !assistantState.threadId;
}
async function restoreAssistantThread() {
  if (!assistantState.threadId) return;
  const messages = await adapter.loadAssistantThread(assistantState.threadId);
  if (!messages) {
    resetAssistantThread();
    return;
  }
  assistantState.proposals.clear();
  assistantMessages.innerHTML = "";
  messages.filter((message) => ["user", "assistant"].includes(message.role)).forEach((message) => {
    appendAssistantMessage(message.role, message.content, Array.isArray(message.proposals) ? message.proposals : []);
  });
  if (!messages.length) resetAssistantThread();
}
function resetAssistantThread() {
  assistantState.threadId = null;
  assistantState.image = null;
  assistantState.proposals.clear();
  const key = assistantThreadStorageKey();
  if (key) localStorage.removeItem(key);
  localStorage.removeItem("heav-assistant-thread");
  assistantImage.value = "";
  assistantDelete.hidden = true;
  updateAssistantAttachment();
  assistantMessages.innerHTML = '<article class="assistant-message is-assistant"><p>Schick mir Kundendaten als Screenshot oder plane ein Projekt im Chat. Ich bereite prüfbare Entwürfe vor – gespeichert oder versendet wird erst nach deiner Bestätigung.</p></article>';
}
async function openAssistantProposal(proposal, button) {
  if (!proposal) return;
  if (proposal.kind === "send_invoice") {
    const invoice = state.data.invoices.find((item) => item.id === proposal.payload.invoice_id);
    if (!invoice) { showToast("Die vorgeschlagene Rechnung wurde nicht gefunden.", "error"); return; }
    closeAssistant();
    await invoiceAction(invoice.id, "send", button);
    return;
  }
  const payload = { ...proposal.payload };
  if (["project", "invoice"].includes(proposal.kind)) {
    payload.customer_id = assistantCustomerId(payload);
    if (!payload.customer_id) { showToast("Bitte zuerst den vorgeschlagenen Kunden speichern.", "error"); return; }
  }
  if (proposal.kind === "invoice" && payload.project_id && !state.data.projects.some((project) => project.id === payload.project_id && project.customer_id === payload.customer_id)) payload.project_id = "";
  closeAssistant();
  openEditor(proposal.kind, null, { prefill: payload });
}

function setInvoiceActionReveal(reveal, visible, persistent = false) {
  if (!reveal) return;
  reveal.classList.toggle("is-actions-visible", visible);
  reveal.classList.toggle("is-actions-open", visible && persistent);
  const trigger = reveal.querySelector("[data-invoice-actions-toggle]");
  const panel = reveal.querySelector(".invoice-actions-panel");
  trigger?.setAttribute("aria-expanded", String(visible && persistent));
  if (panel) {
    panel.inert = !visible;
    panel.setAttribute("aria-hidden", String(!visible));
  }
}
function closeInvoiceActionReveals(except = null) {
  content.querySelectorAll("[data-invoice-actions].is-actions-visible").forEach((reveal) => {
    if (reveal !== except) setInvoiceActionReveal(reveal, false);
  });
}

assistantLauncher.addEventListener("click", openAssistant);
assistantDelete.hidden = !assistantState.threadId;
assistantDelete.addEventListener("click", async () => {
  if (!assistantState.threadId) return;
  const confirmed = await confirmAction({
    kicker: "CHAT LÖSCHEN",
    title: "Chatverlauf wirklich löschen?",
    copy: "Alle Nachrichten und Entwürfe in diesem Chat werden dauerhaft entfernt.",
    confirmLabel: "Löschen",
    destructive: true,
  });
  if (!confirmed) return;
  assistantDelete.disabled = true;
  try {
    await adapter.deleteAssistantThread(assistantState.threadId);
    resetAssistantThread();
    showToast("Chat wurde gelöscht.");
  } catch (error) {
    if (/Chat nicht gefunden/i.test(error.message || "")) {
      resetAssistantThread();
      showToast("Der nicht mehr vorhandene Chat wurde lokal entfernt.");
    } else {
      showToast(error.message || "Chat konnte nicht gelöscht werden.", "error");
    }
  } finally {
    assistantDelete.disabled = false;
  }
});
assistantDialog.addEventListener("click", async (event) => {
  if (event.target.closest("[data-close-assistant]")) { closeAssistant(); return; }
  if (event.target.closest("[data-remove-assistant-image]")) {
    assistantState.image = null;
    assistantImage.value = "";
    updateAssistantAttachment();
    return;
  }
  const trigger = event.target.closest("[data-assistant-proposal]");
  if (trigger) await openAssistantProposal(assistantState.proposals.get(trigger.dataset.assistantProposal), trigger);
});
assistantImage.addEventListener("change", async () => {
  const file = assistantImage.files?.[0];
  if (!file) return;
  try {
    assistantState.image = await prepareAssistantImage(file);
    updateAssistantAttachment();
  } catch (error) {
    assistantState.image = null;
    assistantImage.value = "";
    updateAssistantAttachment();
    showToast(error.message || "Screenshot konnte nicht vorbereitet werden.", "error");
  }
});
assistantForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (assistantState.busy) return;
  const message = assistantInput.value.trim();
  if (!message && !assistantState.image) { showToast("Schreibe eine Nachricht oder füge einen Screenshot hinzu.", "error"); return; }
  const image = assistantState.image;
  appendAssistantMessage("user", message || "Bitte lies die Kundendaten aus diesem Screenshot.", [], image?.name || "");
  assistantInput.value = "";
  assistantState.busy = true;
  const submit = assistantForm.querySelector(".assistant-send");
  submit.disabled = true;
  submit.setAttribute("aria-busy", "true");
  try {
    let newThread = !assistantState.threadId;
    if (newThread) setAssistantThread(crypto.randomUUID());
    const request = () => adapter.askAssistant({ threadId: assistantState.threadId, newThread, message: message || "Bitte lies die Kundendaten aus diesem Screenshot.", image });
    let result;
    try {
      result = await request();
    } catch (error) {
      if (error.status !== 404 || newThread) throw error;
      setAssistantThread(crypto.randomUUID());
      newThread = true;
      result = await request();
    }
    if (!result || typeof result.message !== "string") throw new Error("Der Assistent hat keine gültige Antwort geliefert.");
    if (typeof result.threadId === "string") setAssistantThread(result.threadId);
    appendAssistantMessage("assistant", result.message, Array.isArray(result.proposals) ? result.proposals : []);
    assistantState.image = null;
    assistantImage.value = "";
    updateAssistantAttachment();
  } catch (error) {
    appendAssistantMessage("assistant", error.message || "Der HEAV Assistent ist gerade nicht erreichbar.");
  } finally {
    assistantState.busy = false;
    submit.disabled = false;
    submit.removeAttribute("aria-busy");
    assistantInput.focus({ preventScroll: true });
  }
});

content.addEventListener("pointerover", (event) => {
  if (!preciseHoverQuery.matches || event.pointerType === "touch") return;
  const record = event.target.closest("[data-invoice-record]");
  if (!record || !content.contains(record)) return;
  const reveal = record.querySelector("[data-invoice-actions]");
  if (reveal && !reveal.classList.contains("is-actions-open")) setInvoiceActionReveal(reveal, true);
});
content.addEventListener("pointerout", (event) => {
  const record = event.target.closest("[data-invoice-record]");
  if (!record || record.contains(event.relatedTarget)) return;
  const reveal = record.querySelector("[data-invoice-actions]");
  if (reveal && !reveal.classList.contains("is-actions-open")) setInvoiceActionReveal(reveal, false);
});

content.addEventListener("click", async (event) => {
  const statusSummary = event.target.closest(".invoice-status-menu > summary");
  if (statusSummary) {
    const currentMenu = statusSummary.parentElement;
    const shouldOpen = !currentMenu.open;
    event.preventDefault();
    document.querySelectorAll(".invoice-status-menu[open]").forEach((menu) => {
      if (menu !== currentMenu) menu.removeAttribute("open");
    });
    currentMenu.open = shouldOpen;
    return;
  }
  const actionToggle = event.target.closest("[data-invoice-actions-toggle]");
  if (actionToggle) {
    const reveal = actionToggle.closest("[data-invoice-actions]");
    const open = !reveal.classList.contains("is-actions-open");
    closeInvoiceActionReveals(reveal);
    setInvoiceActionReveal(reveal, open, open);
    return;
  }
  if (!event.target.closest("[data-invoice-actions]")) closeInvoiceActionReveals();
  const invoiceStatus = event.target.closest("[data-invoice-status]");
  if (invoiceStatus) {
    invoiceStatus.closest("details")?.removeAttribute("open");
    await changeInvoiceStatus(invoiceStatus.dataset.id, invoiceStatus.dataset.invoiceStatus, invoiceStatus);
    return;
  }
  const emailTemplate = event.target.closest("[data-edit-email-template]"); if (emailTemplate) { openEditor("email-template", emailTemplateValue(emailTemplate.dataset.editEmailTemplate), { templateKey: emailTemplate.dataset.editEmailTemplate }); return; }
  const create = event.target.closest("[data-create]"); if (create) openEditor(create.dataset.create, null, { projectId: create.dataset.projectId || "" });
  const view = event.target.closest("[data-view]"); if (view) setView(view.dataset.view);
  const filter = event.target.closest("[data-filter]"); if (filter) { state.filter = filter.dataset.filter; render(); }
  if (event.target.closest("[data-sort-project-documents]")) { state.projectDocumentSort = state.projectDocumentSort === "newest" ? "oldest" : "newest"; render(); document.querySelector("[data-sort-project-documents]")?.focus({ preventScroll: true }); }
  if (event.target.closest("[data-scroll-project-register]")) document.querySelector("#project-register")?.scrollIntoView({ behavior: "smooth" });
  const projectFocus = event.target.closest("[data-project-focus]"); if (projectFocus) { state.selectedProjectId = projectFocus.dataset.projectFocus; state.filter = "all"; state.query = ""; render(); document.querySelector(".project-strip-item.is-selected")?.focus({ preventScroll: true }); }
  const dashboardProjectFocus = event.target.closest("[data-dashboard-project-focus]"); if (dashboardProjectFocus) { state.selectedProjectId = dashboardProjectFocus.dataset.dashboardProjectFocus; setView("projects"); }
  const edit = event.target.closest("[data-edit]"); if (edit) { const collections = { customer: state.data.customers, project: state.data.projects, invoice: state.data.invoices }; openEditor(edit.dataset.edit, collections[edit.dataset.edit].find((item) => item.id === edit.dataset.id)); }
  const action = event.target.closest("[data-invoice-action]"); if (action) invoiceAction(action.dataset.id, action.dataset.invoiceAction, action);
  const requestAction = event.target.closest("[data-portal-request-action]"); if (requestAction) portalRequestAction(requestAction.dataset.id, requestAction.dataset.portalRequestAction, requestAction);
  const departmentInvite = event.target.closest("[data-portal-invite]"); if (departmentInvite) await departmentInviteAction(departmentInvite.dataset.portalInvite, departmentInvite.dataset.departmentId, departmentInvite);
  const sendOfferButton = event.target.closest("[data-send-offer]"); if (sendOfferButton) await sendOffer(sendOfferButton.dataset.sendOffer, sendOfferButton);
  const copyOffer = event.target.closest("[data-copy-offer]"); if (copyOffer) await copyOfferLink(copyOffer.dataset.copyOffer, copyOffer);
  const remove = event.target.closest("[data-delete-record]"); if (remove) deleteRecord(remove.dataset.deleteRecord, remove.dataset.id, remove);
});
document.addEventListener("click", (event) => {
  if (event.target.closest(".invoice-status-menu")) return;
  document.querySelectorAll(".invoice-status-menu[open]").forEach((menu) => menu.removeAttribute("open"));
});
content.addEventListener("change", event => {
  if (event.target.matches("[data-invoice-sort]")) {
    state.invoiceSort = event.target.value;
    render();
    document.querySelector("[data-invoice-sort]")?.focus({ preventScroll: true });
    return;
  }
  if (event.target.matches("[data-project-picker]")) {
    state.selectedProjectId = event.target.value;
    render();
    document.querySelector("[data-project-picker]")?.focus({ preventScroll: true });
  }
});
content.addEventListener("input", (event) => { if (event.target.matches("[data-search]")) { state.query = event.target.value; const position = event.target.selectionStart; render(); const next = document.querySelector("[data-search]"); next.focus(); next.setSelectionRange(position, position); } });
dialogBody.addEventListener("click", async (event) => { if (event.target.closest("[data-add-item]")) addInvoiceItem(); if (event.target.closest("[data-add-discount]")) addInvoiceItem(null, "discount"); if (event.target.closest("[data-remove-item]")) { if (document.querySelectorAll(".invoice-item").length > 1) event.target.closest(".invoice-item").remove(); updateInvoiceTotal(); } const invite = event.target.closest("[data-portal-invite]"); if (invite) await departmentInviteAction(invite.dataset.portalInvite, invite.dataset.departmentId, invite); });
dialogBody.addEventListener("input", (event) => { if (event.target.matches('[name="item_quantity"],[name="item_price"],[name="discount_value"],[name="tax_rate"]')) updateInvoiceTotal(); });
dialogBody.addEventListener("change", (event) => { if (event.target.matches('[name="customer_id"]') && ["invoice", "offer"].includes(dialogForm.dataset.type)) { const projects = dialogForm.elements.project_id; projects.innerHTML = `<option value="">Kein Projekt</option>${projectOptions(event.target.value)}`; } });
dialogForm.addEventListener("submit", async (event) => { const submitter = event.submitter; if (submitter?.value !== "save") return; event.preventDefault(); submitter.disabled = true; formError.textContent = ""; try { if (await saveEditor(dialogForm.dataset.type)) { dialog.close(); await refresh(); showToast("Gespeichert."); } } catch (error) { formError.textContent = error.message || "Speichern fehlgeschlagen."; } finally { submitter.disabled = false; } });
document.addEventListener("click", (event) => { const nav = event.target.closest(".nav-link,.bottom-link"); if (nav) setView(nav.dataset.view); if (event.target.closest("[data-open-nav]")) setNavigationOpen(true); if (event.target.closest("[data-close-nav]")) setNavigationOpen(false); const create = event.target.closest("[data-create]"); if (create && !content.contains(create)) openEditor(create.dataset.create); });
document.querySelector("[data-focus-documents]").addEventListener("click", () => { document.querySelector(".project-doc-search input")?.focus(); });
document.addEventListener("keydown", (event) => {
  const modal = document.querySelector("dialog[open]");
  if (modal && event.key === "Tab") {
    const controls = [...modal.querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href]')].filter(el => el.getClientRects().length);
    const first = controls[0], last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    return;
  }
  const openInvoiceActions = !modal && content.querySelector("[data-invoice-actions].is-actions-open");
  if (openInvoiceActions && event.key === "Escape") {
    event.preventDefault();
    const trigger = openInvoiceActions.querySelector("[data-invoice-actions-toggle]");
    setInvoiceActionReveal(openInvoiceActions, false);
    trigger?.focus({ preventScroll: true });
    return;
  }
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
    const { data: isOwner, error: ownerError } = await state.supabase.rpc("is_studio_owner");
    if (ownerError) throw ownerError;

    if (!isOwner) {
      const { data: memberships, error: membershipError } = await state.supabase
        .from("customer_portal_memberships")
        .select("id")
        .eq("user_id", userId)
        .eq("status", "active")
        .limit(1);
      if (!membershipError && memberships?.length) { window.location.replace("/client/"); return; }
      throw new Error("Für dieses Konto ist kein Studio-Zugriff freigeschaltet.");
    }

    configureAssistantOwner(userId);
    adapter = createSupabaseAdapter(state.supabase, data.session);
    void state.supabase.rpc("record_owner_login");
    state.data = await adapter.loadAll();
    await restoreAssistantThread();
    loading.remove(); shell.hidden = false; render();
  } catch (error) {
    loading.innerHTML = `<strong>HEAV</strong><span>${esc(error.message)}</span><a href="/login/" style="color:#e8e4dc">Zum Login</a>`;
  }
}
applyBklitShimmer();
boot();
