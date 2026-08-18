import { HEAV_ADMIN_CONFIG } from "/admin/config.js";

const contactForm = document.querySelector("[data-contact-form]");

if (contactForm instanceof HTMLFormElement) {
  const submitButton = contactForm.querySelector("[data-form-submit]");
  const status = contactForm.querySelector("[data-form-status]");
  const startedAt = contactForm.querySelector("[name='submittedAt']");
  const endpoint = `${HEAV_ADMIN_CONFIG.supabaseUrl}/functions/v1/contact-enquiry`;

  const setStatus = (message, state) => {
    if (!(status instanceof HTMLElement)) return;
    status.hidden = false;
    status.dataset.state = state;
    status.textContent = message;
  };

  const setSending = (sending) => {
    contactForm.setAttribute("aria-busy", String(sending));
    if (submitButton instanceof HTMLButtonElement) {
      submitButton.disabled = sending;
      submitButton.innerHTML = sending
        ? "Sending…"
        : 'Send enquiry<span class="icon icon-up-right" aria-hidden="true"></span>';
    }
  };

  const setSubmittedAt = () => {
    if (startedAt instanceof HTMLInputElement) startedAt.value = String(Date.now());
  };

  setSubmittedAt();

  contactForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!contactForm.reportValidity()) return;

    const data = new FormData(contactForm);
    const payload = {
      name: data.get("name"),
      company: data.get("company"),
      email: data.get("email"),
      phone: data.get("phone"),
      projectType: data.get("projectType"),
      timeframe: data.get("timeframe"),
      message: data.get("message"),
      website: data.get("website"),
      submittedAt: Number(data.get("submittedAt")),
    };

    setSending(true);
    if (status instanceof HTMLElement) status.hidden = true;

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          apikey: HEAV_ADMIN_CONFIG.supabaseAnonKey,
          Authorization: `Bearer ${HEAV_ADMIN_CONFIG.supabaseAnonKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok) throw new Error(result.error || "Unable to send your enquiry.");

      contactForm.reset();
      setSubmittedAt();
      setStatus("Thank you — your enquiry is with HEAV. HEAV will get back to you shortly.", "success");
      status?.focus({ preventScroll: true });
    } catch (error) {
      const message = error instanceof Error && error.message
        ? error.message
        : "Unable to send your enquiry. Please try again or email hello@heav.ch.";
      setStatus(message, "error");
      status?.focus({ preventScroll: true });
    } finally {
      setSending(false);
    }
  });
}
