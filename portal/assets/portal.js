import { HEAV_ADMIN_CONFIG, isBackendConfigured } from "/admin/config.js";

const loading = document.querySelector("#loading-screen");
const portal = document.querySelector("#portal");
const projectsEl = document.querySelector("#portal-projects");
const invoicesEl = document.querySelector("#portal-invoices");
const filesEl = document.querySelector("#portal-files");
const projectCount = document.querySelector("#project-count");
const reviewForm = document.querySelector("#review-form");
const reviewCustomerField = document.querySelector("#review-customer-field");
const reviewCustomer = document.querySelector("#review-customer");
const reviewMessage = document.querySelector("#review-message");
let supabase;
let memberships = [];

const esc = (value = "") => String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
const date = (value) => value ? new Intl.DateTimeFormat("de-CH", { dateStyle: "medium" }).format(new Date(`${value}T12:00:00`)) : "–";
const chf = (rappen = 0) => new Intl.NumberFormat("de-CH", { style: "currency", currency: "CHF" }).format((Number(rappen) || 0) / 100);
const status = (value) => ({ sent: "Offen", paid: "Bezahlt", overdue: "Überfällig", planning: "Planung", active: "Aktiv", completed: "Abgeschlossen", on_hold: "Pausiert" })[value] || value;
const kind = (value) => ({ image: "BILD", video: "VIDEO", gallery: "GALERIE", offer: "OFFERTE", document: "DOKUMENT" })[value] || "DATEI";

function empty(message) { return `<p class="empty">${esc(message)}</p>`; }
function renderProjects(projects) {
  projectCount.textContent = `${projects.length} ${projects.length === 1 ? "Projekt" : "Projekte"}`;
  projectsEl.innerHTML = projects.length ? projects.map((project) => `<article class="project-card"><div><span>${esc(status(project.status))}</span><h3>${esc(project.title)}</h3><p>${esc(project.description || "Details und Delivery-Dateien werden hier bereitgestellt.")}</p></div><div class="project-meta"><span>${date(project.start_date)}</span><span>${project.due_date ? `bis ${date(project.due_date)}` : ""}</span></div></article>`).join("") : empty("Aktuell ist noch kein Projekt zugewiesen. Sobald HEAV ein Projekt freigibt, erscheint es hier.");
}
function renderInvoices(invoices) {
  invoicesEl.innerHTML = invoices.length ? invoices.map((invoice) => `<article class="record"><div><strong>${esc(invoice.invoice_number)}</strong><small>Fällig ${date(invoice.due_date)} · ${chf(invoice.total_rappen)}</small></div><span class="status ${esc(invoice.status)}">${esc(status(invoice.status))}</span></article>`).join("") : empty("Für dieses Kundenkonto sind aktuell keine Rechnungen freigegeben.");
}
function renderFiles(files) {
  filesEl.innerHTML = files.length ? files.map((file) => `<article class="file-row"><div><span class="file-kind">${esc(kind(file.kind))}</span><strong>${esc(file.title)}</strong><small>${esc(file.original_filename)}</small></div>${file.download_enabled ? `<button class="download-button" type="button" data-file-id="${esc(file.id)}">Download</button>` : ""}</article>`).join("") : empty("Noch keine Dateien freigegeben. Sobald eine Galerie, Offerte oder Delivery bereitsteht, erscheint sie hier.");
}

async function downloadFile(file) {
  const { data, error } = await supabase.storage.from(file.storage_bucket).createSignedUrl(file.storage_path, 60, { download: file.original_filename });
  if (error) throw new Error("Datei ist derzeit nicht verfügbar.");
  window.location.assign(data.signedUrl);
}

async function loadPortal() {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !sessionData.session) { window.location.replace("/login/"); return; }
  const { data: access, error: accessError } = await supabase.from("customer_portal_memberships").select("customer_id, role").eq("status", "active");
  if (accessError) throw accessError;
  memberships = access || [];
  if (!memberships.length) throw new Error("Für dieses Konto ist noch kein Kundenportal freigeschaltet.");
  const [projects, invoices, files] = await Promise.all([
    supabase.from("projects").select("id,title,description,status,start_date,due_date").order("created_at", { ascending: false }),
    supabase.from("invoices").select("id,invoice_number,due_date,total_rappen,status").order("issue_date", { ascending: false }),
    supabase.from("customer_files").select("id,title,original_filename,storage_bucket,storage_path,kind,download_enabled").order("published_at", { ascending: false }),
  ]);
  [projects, invoices, files].forEach((result) => { if (result.error) throw result.error; });
  renderProjects(projects.data || []);
  renderInvoices(invoices.data || []);
  renderFiles(files.data || []);
  const suppliedName = sessionData.session.user.user_metadata?.full_name;
  if (suppliedName) reviewForm.elements.reviewer_name.value = suppliedName;
  if (memberships.length === 1) reviewCustomer.innerHTML = `<option value="${esc(memberships[0].customer_id)}">Mein Kundenkonto</option>`;
  else {
    reviewCustomerField.hidden = false;
    reviewCustomer.innerHTML = memberships.map((membership, index) => `<option value="${esc(membership.customer_id)}">Kundenkonto ${index + 1}</option>`).join("");
  }
  loading.remove(); portal.hidden = false;
  filesEl.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-file-id]");
    if (!button) return;
    const file = (files.data || []).find((item) => item.id === button.dataset.fileId);
    if (!file) return;
    button.disabled = true;
    try { await downloadFile(file); } catch (error) { alert(error.message || "Download fehlgeschlagen."); } finally { button.disabled = false; }
  });
}

reviewForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  reviewMessage.textContent = "";
  if (!reviewForm.reportValidity()) return;
  const values = new FormData(reviewForm);
  const customerId = values.get("customer_id") || memberships[0]?.customer_id;
  const button = reviewForm.querySelector("button[type=submit]");
  button.disabled = true;
  const { error } = await supabase.from("customer_reviews").insert({ customer_id: customerId, reviewer_name: values.get("reviewer_name").trim(), body: values.get("body").trim() });
  button.disabled = false;
  if (error) { reviewMessage.textContent = "Die Rezension konnte nicht gesendet werden. Bitte versuche es später erneut."; return; }
  reviewForm.elements.body.value = "";
  reviewMessage.classList.add("success");
  reviewMessage.textContent = "Danke. Deine Rezension wurde zur Prüfung übermittelt.";
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
