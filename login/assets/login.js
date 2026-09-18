import { HEAV_ADMIN_CONFIG, isBackendConfigured } from "/admin/config.js";

const form = document.querySelector("#login-form");
const message = document.querySelector("#login-message");
const button = form.querySelector("button");
const buttonLabel = button.querySelector(".login-button-label");
const buttonShimmer = button.querySelector(".login-button-shimmer");
const setLoginLoading = (isLoading) => {
  button.classList.toggle("is-loading", isLoading);
  buttonLabel.hidden = isLoading;
  buttonShimmer.hidden = !isLoading;
  button.toggleAttribute("aria-busy", isLoading);
  if (isLoading) button.setAttribute("aria-label", "Anmeldelink wird gesendet");
  else button.removeAttribute("aria-label");
};
// Only the canonical customer workspace may survive the login round-trip.
// Parse before allowing it so backslashes, traversal and external URLs fail closed.
function customerReturnPath() {
  const next = new URLSearchParams(window.location.search).get("next");
  if (!next || !next.startsWith("/") || next.startsWith("//")) return "";
  try {
    const target = new URL(next, window.location.origin);
    if (target.origin !== window.location.origin || target.pathname !== "/client/") return "";
    return `${target.pathname}${target.search}${target.hash}`;
  } catch { return ""; }
}
const returnPath = customerReturnPath();
const successMarkup = (title, copy) => `<span class="send-plane" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><path d="M21 3 10 14"/><path d="m21 3-7 18-4-7-7-4Z"/></svg></span><span class="send-success-copy"><strong>${title}</strong><small>${copy}</small></span><span class="send-check" aria-hidden="true">✓</span>`;

if (!isBackendConfigured()) {
  message.textContent = "Der sichere Zugang wird gerade eingerichtet.";
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
    const { data: isOwner, error: ownerError } = await supabase.rpc("is_studio_owner");
    if (ownerError) throw new Error("Die Berechtigung konnte nicht geprüft werden. Bitte versuche es später erneut.");
    if (isOwner) return "/studio/";

    const { data: memberships, error } = await supabase
      .from("customer_portal_memberships")
      .select("id")
      .eq("user_id", user.id)
      .eq("status", "active")
      .limit(1);
    if (error) throw new Error("Die Berechtigung konnte nicht geprüft werden. Bitte versuche es später erneut.");
    if (memberships?.length) return "/client/";
    return null;
  }
  const { data } = await supabase.auth.getSession();
  if (data.session) {
    try {
      const destination = await workspaceDestination(data.session);
      if (destination) {
        window.location.replace(destination === "/client/" && returnPath ? returnPath : destination);
      } else {
        await supabase.auth.signOut();
        message.textContent = "Für dieses Konto besteht kein freigegebener Zugang.";
      }
    } catch (error) {
      message.textContent = error.message || "Die Berechtigung konnte nicht geprüft werden. Bitte versuche es später erneut.";
    }
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    message.className = "form-message";
    message.textContent = "";
    if (!form.reportValidity()) return;
    button.disabled = true;
    setLoginLoading(true);
    const email = new FormData(form).get("email").trim().toLowerCase();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/login/${returnPath ? `?next=${encodeURIComponent(returnPath)}` : ""}`,
        shouldCreateUser: false,
      },
    });
    if (error) {
      message.textContent = "Die Anmeldung konnte nicht gestartet werden. Bitte versuche es später erneut.";
      button.disabled = false;
      setLoginLoading(false);
      return;
    }
    message.className = "form-message success is-dispatch-success";
    message.innerHTML = successMarkup("Anmeldelink gesendet", "Prüfe dein Postfach. Dein sicherer Link ist unterwegs.");
    button.disabled = false;
    setLoginLoading(false);
  });
}
