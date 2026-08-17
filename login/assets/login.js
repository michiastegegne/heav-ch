import { HEAV_ADMIN_CONFIG, isBackendConfigured } from "/admin/config.js";

const form = document.querySelector("#login-form");
const message = document.querySelector("#login-message");
const button = form.querySelector("button");

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
  const { data } = await supabase.auth.getSession();
  if (data.session) window.location.replace("/admin/");

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    message.className = "form-message";
    message.textContent = "";
    if (!form.reportValidity()) return;
    button.disabled = true;
    const values = new FormData(form);
    const email = values.get("email").trim();
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
      return;
    }
    message.classList.add("success");
    message.textContent = "Sign-in link sent. Please check your email.";
  });
}
