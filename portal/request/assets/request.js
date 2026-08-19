import { HEAV_ADMIN_CONFIG, isBackendConfigured } from "/admin/config.js";

const form = document.querySelector("#portal-request-form");
const message = document.querySelector("#request-message");
const startedAt = Date.now();

function setMessage(text, success = false) {
  message.classList.toggle("success", success);
  message.textContent = text;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  setMessage("");
  if (!form.reportValidity()) return;
  if (!isBackendConfigured()) { setMessage("Portal registration is currently being configured."); return; }
  const values = new FormData(form);
  const button = form.querySelector("button[type=submit]");
  button.disabled = true;
  try {
    const response = await fetch(`${HEAV_ADMIN_CONFIG.supabaseUrl}/functions/v1/portal-access-request`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: HEAV_ADMIN_CONFIG.supabaseAnonKey },
      body: JSON.stringify({
        contactName: values.get("contact_name").trim(),
        company: values.get("company").trim(),
        email: values.get("email").trim().toLowerCase(),
        phone: values.get("phone").trim(),
        message: values.get("message").trim(),
        website: values.get("website").trim(),
        startedAt,
      }),
    });
    if (!response.ok) throw new Error("Request could not be accepted.");
    form.reset();
    setMessage("Thank you. HEAV will review your request and contact you by email.", true);
  } catch {
    setMessage("Your request could not be sent right now. Please try again later.");
  } finally { button.disabled = false; }
});
