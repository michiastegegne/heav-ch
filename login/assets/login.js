import { HEAV_ADMIN_CONFIG, isBackendConfigured } from "/admin/config.js";

const form = document.querySelector("#login-form");
const message = document.querySelector("#login-message");
const button = form.querySelector("button");
const successMarkup = (title, copy) => `<span class="send-plane" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><path d="M21 3 10 14"/><path d="m21 3-7 18-4-7-7-4Z"/></svg></span><span class="send-success-copy"><strong>${title}</strong><small>${copy}</small></span><span class="send-check" aria-hidden="true">✓</span>`;

if (!isBackendConfigured()) {
  message.textContent = "Secure backend access is currently being configured.";
  form.querySelectorAll('input, button[type="submit"]').forEach((element) => {
    element.disabled = true;
  });
} else {
  const { createClient } = await import(
    "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.4/+esm"
  );
  const supabase = createClient(
    HEAV_ADMIN_CONFIG.supabaseUrl,
    HEAV_ADMIN_CONFIG.supabaseAnonKey,
  );
  async function workspaceDestination(session) {
    const user = session.user;
    const { data: settings, error: settingsError } = await supabase
      .from("company_settings")
      .select("owner_id")
      .maybeSingle();
    if (!settingsError && settings?.owner_id === user.id) return "/studio/";

    const { data: memberships, error } = await supabase
      .from("customer_portal_memberships")
      .select("id")
      .eq("user_id", user.id)
      .eq("status", "active")
      .limit(1);
    if (!error && memberships?.length) return "/client/";
    return "/studio/";
  }
  const { data } = await supabase.auth.getSession();
  if (data.session) window.location.replace(await workspaceDestination(data.session));

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    message.className = "form-message";
    message.textContent = "";
    if (!form.reportValidity()) return;
    button.disabled = true;
    button.classList.add("is-loading");
    button.setAttribute("aria-busy", "true");
    const email = new FormData(form).get("email").trim().toLowerCase();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/login/`,
        shouldCreateUser: false,
      },
    });
    if (error) {
      message.textContent = "Sign-in could not be started. Please try again later.";
      button.disabled = false;
      button.classList.remove("is-loading");
      button.removeAttribute("aria-busy");
      return;
    }
    message.className = "form-message success is-dispatch-success";
    message.innerHTML = successMarkup("Sign-in link sent", "A secure link is on its way to your inbox.");
    button.disabled = false;
    button.classList.remove("is-loading");
    button.removeAttribute("aria-busy");
  });
}
