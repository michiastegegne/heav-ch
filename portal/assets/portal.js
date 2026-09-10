import { HEAV_ADMIN_CONFIG, isBackendConfigured } from "/admin/config.js";

const loading = document.querySelector("#loading-screen");
const portal = document.querySelector("#portal");
const projectsEl = document.querySelector("#portal-projects");
const offersEl = document.querySelector("#portal-offers");
const invoicesEl = document.querySelector("#portal-invoices");
const filesEl = document.querySelector("#portal-files");
const projectCount = document.querySelector("#project-count");
const reviewForm = document.querySelector("#review-form");
const reviewCustomerField = document.querySelector("#review-customer-field");
const reviewCustomer = document.querySelector("#review-customer");
const reviewMessage = document.querySelector("#review-message");
const offerAcceptDialog = document.querySelector("#offer-accept-dialog");
const offerAcceptConfirm = document.querySelector("#offer-accept-confirm");
const invoicePreviewDialog = document.querySelector("#invoice-preview-dialog");
const invoicePreviewTitle = document.querySelector("#invoice-preview-title");
const invoicePreviewFrame = document.querySelector("#invoice-preview-frame");
const invoicePreviewLoading = document.querySelector("#invoice-preview-loading");
const invoicePreviewDownload = document.querySelector("#invoice-preview-download");
let supabase;
let previewBlob = null;
let previewFilename = "Rechnung.pdf";
let previewUrl = null;
let memberships = [];
let activeOfferId = null;

const esc = (value = "") => String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
const date = (value) => value ? new Intl.DateTimeFormat("de-CH", { dateStyle: "medium" }).format(new Date(`${value}T12:00:00`)) : "–";
const dateTime = (value) => value ? new Intl.DateTimeFormat("de-CH", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "–";
const chf = (rappen = 0) => new Intl.NumberFormat("de-CH", { style: "currency", currency: "CHF" }).format((Number(rappen) || 0) / 100);
const status = (value) => ({ sent: "Offen", paid: "Bezahlt", overdue: "Überfällig", planning: "Planung", active: "Aktiv", completed: "Abgeschlossen", on_hold: "Pausiert", draft: "Entwurf", accepted: "Angenommen", expired: "Abgelaufen", withdrawn: "Zurückgezogen" })[value] || value;
const kind = (value) => ({ image: "BILD", video: "VIDEO", gallery: "GALERIE", offer: "OFFERTE", document: "DOKUMENT" })[value] || "DATEI";

function empty(message) { return `<p class="empty">${esc(message)}</p>`; }
function renderProjects(projects) {
  projectCount.textContent = `${projects.length} ${projects.length === 1 ? "Projekt" : "Projekte"}`;
  projectsEl.innerHTML = projects.length ? projects.map((project) => `<article class="project-card"><div><span>${esc(status(project.status))}</span><h3>${esc(project.title)}</h3><p>${esc(project.description || "Details und Delivery-Dateien werden hier bereitgestellt.")}</p></div><div class="project-meta"><span>${date(project.start_date)}</span><span>${project.due_date ? `bis ${date(project.due_date)}` : ""}</span></div></article>`).join("") : empty("Aktuell ist noch kein Projekt zugewiesen. Sobald HEAV ein Projekt freigibt, erscheint es hier.");
}
function renderInvoices(invoices) {
  invoicesEl.innerHTML = invoices.length ? invoices.map((invoice) => `<article class="record"><div><strong>${esc(invoice.invoice_number)}</strong><small>Fällig ${date(invoice.due_date)} · ${chf(invoice.total_rappen)}</small><div class="portal-document-actions"><button class="text-button" type="button" data-invoice-preview="${esc(invoice.id)}">Vorschau</button><button class="text-button" type="button" data-invoice-download="${esc(invoice.id)}">PDF herunterladen</button></div></div><span class="status ${esc(invoice.status)}">${esc(status(invoice.status))}</span></article>`).join("") : empty("Für dieses Kundenkonto sind aktuell keine Rechnungen freigegeben.");
}
function renderOffers(offers) {
  offersEl.innerHTML = offers.length ? offers.map((offer) => {
    const items = (offer.offer_items || []).sort((a, b) => a.position - b.position);
    const selected = offer.id === new URLSearchParams(window.location.search).get("offer");
    const isAvailable = offer.status === "sent" && offer.valid_until >= new Date().toISOString().slice(0, 10);
    return `<article class="offer-card ${selected ? "is-selected" : ""}" id="offer-${esc(offer.id)}"><div class="offer-card-head"><div><span class="eyebrow">OFF ${esc(offer.offer_number)}</span><h3>${esc(offer.title)}</h3><span class="offer-reference">Gültig bis ${date(offer.valid_until)}</span></div><span class="status ${esc(offer.status)}">${esc(status(offer.status))}</span></div>${offer.notes ? `<p>${esc(offer.notes)}</p>` : ""}<div class="offer-items">${items.map((item) => `<div class="offer-item"><span>${esc(item.description)}<small>${esc(item.quantity)} × ${chf(item.unit_price_rappen)}</small></span><strong>${chf(Math.round(Number(item.quantity) * Number(item.unit_price_rappen)))}</strong></div>`).join("")}</div><div class="offer-total"><span>Total inkl. MWST</span><strong>${chf(offer.total_rappen)}</strong></div><p class="offer-legal-copy">${esc(offer.terms)}</p><div class="offer-actions">${isAvailable ? `<button class="primary-button" type="button" data-accept-offer="${esc(offer.id)}">Offerte annehmen <span aria-hidden="true">↗</span></button>` : offer.status === "accepted" ? `<span class="offer-accepted">Verbindlich angenommen am ${dateTime(offer.accepted_at)}</span>` : ""}</div></article>`;
  }).join("") : empty("Aktuell liegt keine Offerte für dieses Kundenkonto vor.");
}
function renderFiles(files) {
  filesEl.innerHTML = files.length ? files.map((file) => `<article class="file-row"><div><span class="file-kind">${esc(kind(file.kind))}</span><strong>${esc(file.title)}</strong><small>${esc(file.original_filename)}</small></div>${file.download_enabled ? `<button class="download-button" type="button" data-file-id="${esc(file.id)}">Download</button>` : ""}</article>`).join("") : empty("Noch keine Dateien freigegeben. Sobald eine Galerie, Offerte oder Delivery bereitsteht, erscheint sie hier.");
}

async function downloadFile(file) {
  const { data, error } = await supabase.storage.from(file.storage_bucket).createSignedUrl(file.storage_path, 60, { download: file.original_filename });
  if (error) throw new Error("Datei ist derzeit nicht verfügbar.");
  window.location.assign(data.signedUrl);
}
async function invoicePdf(invoiceId) {
  const { data } = await supabase.auth.getSession();
  const response = await fetch(`${HEAV_ADMIN_CONFIG.supabaseUrl}/functions/v1/invoice-document`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session.access_token}`, apikey: HEAV_ADMIN_CONFIG.supabaseAnonKey },
    body: JSON.stringify({ invoiceId, action: "download" }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || "Rechnung konnte nicht geladen werden.");
  }
  return response.blob();
}
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function clearInvoicePreview() {
  invoicePreviewFrame.removeAttribute("src");
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = null;
  previewBlob = null;
  previewFilename = "Rechnung.pdf";
  invoicePreviewDownload.disabled = true;
  invoicePreviewLoading.hidden = false;
}
function startInvoicePreview(invoice) {
  clearInvoicePreview();
  invoicePreviewTitle.textContent = invoice.invoice_number;
  invoicePreviewLoading.textContent = "PDF wird geladen …";
  invoicePreviewDialog.showModal();
}
function showInvoicePreview(blob, invoice) {
  previewBlob = blob;
  previewFilename = `${invoice.invoice_number}.pdf`;
  previewUrl = URL.createObjectURL(blob);
  invoicePreviewFrame.src = previewUrl;
  invoicePreviewLoading.hidden = true;
  invoicePreviewDownload.disabled = false;
}
invoicePreviewDialog.addEventListener("close", clearInvoicePreview);
invoicePreviewDownload.addEventListener("click", () => {
  if (previewBlob) downloadBlob(previewBlob, previewFilename);
});

async function loadPortal() {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !sessionData.session) { window.location.replace(`/login/?next=${encodeURIComponent(`${window.location.pathname}${window.location.search}`)}`); return; }
  const userId = sessionData.session.user.id;
  const { data: access, error: accessError } = await supabase.from("customer_portal_memberships").select("customer_id, role").eq("user_id", userId).eq("status", "active");
  if (accessError) throw accessError;
  memberships = access || [];
  if (!memberships.length) throw new Error("Für dieses Konto ist noch kein Kundenportal freigeschaltet.");
  const customerId = memberships[0].customer_id;
  const [projects, invoices, files, offers] = await Promise.all([
    supabase.from("projects").select("id,title,description,status,start_date,due_date").eq("customer_id", customerId).order("created_at", { ascending: false }),
    supabase.from("invoices").select("id,invoice_number,due_date,total_rappen,status").eq("customer_id", customerId).order("issue_date", { ascending: false }),
    supabase.from("customer_files").select("id,title,original_filename,storage_bucket,storage_path,kind,download_enabled").eq("customer_id", customerId).order("published_at", { ascending: false }),
    supabase.from("offers").select("id,offer_number,title,valid_until,status,notes,terms,total_rappen,accepted_at,offer_items(id,position,description,quantity,unit_price_rappen)").eq("customer_id", customerId).order("issue_date", { ascending: false }),
  ]);
  [projects, invoices, files, offers].forEach((result) => { if (result.error) throw result.error; });
  renderProjects(projects.data || []);
  renderInvoices(invoices.data || []);
  renderOffers(offers.data || []);
  renderFiles(files.data || []);
  const suppliedName = sessionData.session.user.user_metadata?.full_name;
  if (suppliedName) reviewForm.elements.reviewer_name.value = suppliedName;
  if (memberships.length === 1) reviewCustomer.innerHTML = `<option value="${esc(memberships[0].customer_id)}">Mein Kundenkonto</option>`;
  else { reviewCustomerField.hidden = false; reviewCustomer.innerHTML = memberships.map((membership, index) => `<option value="${esc(membership.customer_id)}">Kundenkonto ${index + 1}</option>`).join(""); }
  loading.remove(); portal.hidden = false;
  const targetOffer = new URLSearchParams(window.location.search).get("offer");
  if (targetOffer) document.querySelector(`#offer-${CSS.escape(targetOffer)}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  invoicesEl.addEventListener("click", async (event) => {
    const preview = event.target.closest("[data-invoice-preview]");
    const download = event.target.closest("[data-invoice-download]");
    if (!preview && !download) return;
    const button = preview || download;
    button.disabled = true;
    const invoice = (invoices.data || []).find((item) => item.id === button.dataset.invoicePreview || item.id === button.dataset.invoiceDownload);
    if (!invoice) { button.disabled = false; return; }
    if (preview) startInvoicePreview(invoice);
    try {
      const blob = await invoicePdf(invoice.id);
      if (preview) showInvoicePreview(blob, invoice);
      else downloadBlob(blob, `${invoice.invoice_number}.pdf`);
    } catch (error) {
      if (preview && invoicePreviewDialog.open) invoicePreviewDialog.close();
      alert(error.message || "Rechnung konnte nicht geladen werden.");
    } finally { button.disabled = false; }
  });
  filesEl.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-file-id]");
    if (!button) return;
    const file = (files.data || []).find((item) => item.id === button.dataset.fileId);
    if (!file) return;
    button.disabled = true;
    try { await downloadFile(file); } catch (error) { alert(error.message || "Download fehlgeschlagen."); } finally { button.disabled = false; }
  });
  offersEl.addEventListener("click", (event) => {
    const button = event.target.closest("[data-accept-offer]");
    if (!button) return;
    activeOfferId = button.dataset.acceptOffer;
    offerAcceptDialog.showModal();
    offerAcceptConfirm.focus({ preventScroll: true });
  });
}

offerAcceptConfirm.addEventListener("click", async () => {
  if (!activeOfferId) return;
  offerAcceptConfirm.disabled = true;
  const { error } = await supabase.rpc("accept_customer_offer", { p_offer_id: activeOfferId });
  offerAcceptConfirm.disabled = false;
  if (error) { alert(error.message || "Die Offerte konnte nicht angenommen werden."); return; }
  offerAcceptDialog.close();
  activeOfferId = null;
  await loadPortal();
});

reviewForm.addEventListener("submit", async (event) => {
  event.preventDefault(); reviewMessage.textContent = "";
  if (!reviewForm.reportValidity()) return;
  const values = new FormData(reviewForm); const customerId = values.get("customer_id") || memberships[0]?.customer_id;
  const button = reviewForm.querySelector("button[type=submit]"); button.disabled = true;
  const { error } = await supabase.from("customer_reviews").insert({ customer_id: customerId, reviewer_name: values.get("reviewer_name").trim(), body: values.get("body").trim() });
  button.disabled = false;
  if (error) { reviewMessage.textContent = "Die Rezension konnte nicht gesendet werden. Bitte versuche es später erneut."; return; }
  reviewForm.elements.body.value = ""; reviewMessage.classList.add("success"); reviewMessage.textContent = "Danke. Deine Rezension wurde zur Prüfung übermittelt.";
});

document.querySelector("#logout-button").addEventListener("click", async () => { await supabase?.auth.signOut(); window.location.replace("/login/"); });

(async () => {
  try {
    if (!isBackendConfigured()) throw new Error("Das Kundenportal wird gerade eingerichtet.");
    const { createClient } = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.4/+esm");
    supabase = createClient(HEAV_ADMIN_CONFIG.supabaseUrl, HEAV_ADMIN_CONFIG.supabaseAnonKey);
    await loadPortal();
  } catch (error) {
    loading.innerHTML = `<strong>HEAV</strong><span>${esc(error.message || "Portal konnte nicht geladen werden.")}</span><a href="/login/" style="color:#d7ff38">Zum Login</a>`;
  }
})();
