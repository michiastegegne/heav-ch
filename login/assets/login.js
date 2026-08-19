import { HEAV_ADMIN_CONFIG, isBackendConfigured } from "/admin/config.js";

const forms = {
  login: document.querySelector("#login-form"),
  signup: document.querySelector("#signup-form"),
  "signup-code": document.querySelector("#verify-form"),
  recovery: document.querySelector("#recovery-form"),
  "recovery-code": document.querySelector("#recovery-verify-form"),
};
const messages = {
  login: document.querySelector("#login-message"),
  signup: document.querySelector("#signup-message"),
  "signup-code": document.querySelector("#verify-message"),
  recovery: document.querySelector("#recovery-message"),
  "recovery-code": document.querySelector("#recovery-verify-message"),
};
const authPanel = document.querySelector(".auth-panel");
const showLogin = document.querySelector("#show-login");
const showSignup = document.querySelector("#show-signup");
const showRecovery = document.querySelector("#show-recovery");
const backToSignup = document.querySelector("#back-to-signup");
const verifyEmail = document.querySelector("#verify-email");
const recoveryEmail = document.querySelector("#recovery-email");
const passwordPattern = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{12,}$/;
let pendingSignupEmail = "";
let pendingRecoveryEmail = "";

function setMessage(element, text, success = false) {
  element.className = "form-message";
  if (success) element.classList.add("success");
  element.textContent = text;
}

function clearMessages() {
  Object.values(messages).forEach((message) => setMessage(message, ""));
}

function setMode(mode, clear = false) {
  Object.entries(forms).forEach(([name, form]) => {
    form.hidden = name !== mode;
  });
  const loginActive = mode === "login";
  const signupActive = mode === "signup" || mode === "signup-code";
  showLogin.classList.toggle("active", loginActive);
  showSignup.classList.toggle("active", signupActive);
  showLogin.setAttribute("aria-pressed", String(loginActive));
  showSignup.setAttribute("aria-pressed", String(signupActive));
  if (clear) clearMessages();
}

function setAuthBusy(form, busy) {
  form.setAttribute("aria-busy", String(busy));
  form.querySelectorAll("input, button").forEach((element) => {
    element.disabled = busy;
  });
  showLogin.disabled = busy;
  showSignup.disabled = busy;
  showRecovery.disabled = busy;
  authPanel.setAttribute("aria-busy", String(busy));
}

function validNewPassword(password, confirmation, message) {
  if (password !== confirmation) {
    setMessage(message, "Die beiden Passwörter stimmen nicht überein.");
    return false;
  }
  if (!passwordPattern.test(password)) {
    setMessage(message, "Das Passwort braucht mindestens 12 Zeichen, Gross- und Kleinbuchstaben, eine Zahl und ein Sonderzeichen.");
    return false;
  }
  return true;
}

showLogin.addEventListener("click", () => setMode("login", true));
showSignup.addEventListener("click", () => setMode("signup", true));
showRecovery.addEventListener("click", () => setMode("recovery", true));
backToSignup.addEventListener("click", () => setMode("signup", true));
document.querySelectorAll(".back-to-login").forEach((button) => {
  button.addEventListener("click", () => setMode("login", true));
});

if (!isBackendConfigured()) {
  setMessage(messages.login, "Der sichere Backend-Zugang wird gerade eingerichtet.");
  document.querySelectorAll('.auth-panel input, .auth-panel button[type="submit"]').forEach((element) => {
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
  async function workspaceDestination() {
    const { data: memberships, error } = await supabase
      .from("customer_portal_memberships")
      .select("id")
      .eq("status", "active")
      .limit(1);
    if (!error && memberships?.length) return "/portal/";
    return "/admin/";
  }
  const { data } = await supabase.auth.getSession();
  if (data.session) window.location.replace(await workspaceDestination());

  forms.login.addEventListener("submit", async (event) => {
    event.preventDefault();
    setMessage(messages.login, "");
    if (!forms.login.reportValidity()) return;
    const values = new FormData(forms.login);
    const email = values.get("email").trim().toLowerCase();
    const password = values.get("password");
    setAuthBusy(forms.login, true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setMessage(messages.login, "E-Mail oder Passwort ist nicht korrekt.");
      setAuthBusy(forms.login, false);
      return;
    }
    window.location.assign(await workspaceDestination());
  });

  forms.signup.addEventListener("submit", async (event) => {
    event.preventDefault();
    setMessage(messages.signup, "");
    if (!forms.signup.reportValidity()) return;
    const values = new FormData(forms.signup);
    const email = values.get("email").trim().toLowerCase();
    const password = values.get("password");
    const confirmation = values.get("password_confirmation");
    if (!email.endsWith("@heav.ch")) {
      setMessage(messages.signup, "Kontoerstellung ist nur mit einer @heav.ch E-Mail-Adresse möglich.");
      return;
    }
    if (!validNewPassword(password, confirmation, messages.signup)) return;
    setAuthBusy(forms.signup, true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${window.location.origin}/login/` },
    });
    if (error) {
      setMessage(messages.signup, "Konto konnte nicht erstellt werden. Verwende eine freigegebene HEAV E-Mail-Adresse oder versuche es später erneut.");
      setAuthBusy(forms.signup, false);
      return;
    }
    pendingSignupEmail = email;
    verifyEmail.textContent = email;
    setAuthBusy(forms.signup, false);
    setMode("signup-code");
    forms["signup-code"].querySelector('input[name="token"]').focus();
  });

  forms["signup-code"].addEventListener("submit", async (event) => {
    event.preventDefault();
    setMessage(messages["signup-code"], "");
    if (!forms["signup-code"].reportValidity() || !pendingSignupEmail) return;
    const token = new FormData(forms["signup-code"]).get("token").trim();
    setAuthBusy(forms["signup-code"], true);
    const { data: verified, error } = await supabase.auth.verifyOtp({
      email: pendingSignupEmail,
      token,
      type: "signup",
    });
    if (error || !verified.session) {
      setMessage(messages["signup-code"], "Der Code ist falsch oder abgelaufen. Bitte prüfe die E-Mail.");
      setAuthBusy(forms["signup-code"], false);
      return;
    }
    setMessage(messages["signup-code"], "Konto bestätigt. HEAV Studio wird geöffnet.", true);
    window.location.assign(await workspaceDestination());
  });

  forms.recovery.addEventListener("submit", async (event) => {
    event.preventDefault();
    setMessage(messages.recovery, "");
    if (!forms.recovery.reportValidity()) return;
    const email = new FormData(forms.recovery).get("email").trim().toLowerCase();
    setAuthBusy(forms.recovery, true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/login/`,
    });
    if (error) {
      setMessage(messages.recovery, "Der Code konnte gerade nicht gesendet werden. Bitte später erneut versuchen.");
      setAuthBusy(forms.recovery, false);
      return;
    }
    pendingRecoveryEmail = email;
    recoveryEmail.textContent = email;
    setAuthBusy(forms.recovery, false);
    setMode("recovery-code");
    forms["recovery-code"].querySelector('input[name="token"]').focus();
  });

  forms["recovery-code"].addEventListener("submit", async (event) => {
    event.preventDefault();
    setMessage(messages["recovery-code"], "");
    if (!forms["recovery-code"].reportValidity() || !pendingRecoveryEmail) return;
    const values = new FormData(forms["recovery-code"]);
    const token = values.get("token").trim();
    const password = values.get("password");
    const confirmation = values.get("password_confirmation");
    if (!validNewPassword(password, confirmation, messages["recovery-code"])) return;
    setAuthBusy(forms["recovery-code"], true);
    const { data: verified, error: verifyError } = await supabase.auth.verifyOtp({
      email: pendingRecoveryEmail,
      token,
      type: "recovery",
    });
    if (verifyError || !verified.session) {
      setMessage(messages["recovery-code"], "Der Code ist falsch oder abgelaufen. Bitte prüfe die E-Mail.");
      setAuthBusy(forms["recovery-code"], false);
      return;
    }
    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) {
      setMessage(messages["recovery-code"], "Das neue Passwort konnte nicht gespeichert werden. Bitte erneut versuchen.");
      setAuthBusy(forms["recovery-code"], false);
      return;
    }
    setMessage(messages["recovery-code"], "Passwort gespeichert. HEAV Studio wird geöffnet.", true);
    window.location.assign(await workspaceDestination());
  });
}
