import { HEAV_ADMIN_CONFIG, isBackendConfigured } from "/admin/config.js";

const loginForm = document.querySelector("#login-form");
const signupForm = document.querySelector("#signup-form");
const verifyForm = document.querySelector("#verify-form");
const loginMessage = document.querySelector("#login-message");
const signupMessage = document.querySelector("#signup-message");
const verifyMessage = document.querySelector("#verify-message");
const showLogin = document.querySelector("#show-login");
const showSignup = document.querySelector("#show-signup");
const backToSignup = document.querySelector("#back-to-signup");
const verifyEmail = document.querySelector("#verify-email");
const passwordPattern = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{12,}$/;
let pendingSignupEmail = "";

function setMessage(element, text, success = false) {
  element.className = "form-message";
  if (success) element.classList.add("success");
  element.textContent = text;
}

function setMode(mode) {
  const signup = mode === "signup";
  loginForm.hidden = signup;
  signupForm.hidden = !signup;
  verifyForm.hidden = true;
  showLogin.classList.toggle("active", !signup);
  showSignup.classList.toggle("active", signup);
  showLogin.setAttribute("aria-pressed", String(!signup));
  showSignup.setAttribute("aria-pressed", String(signup));
  setMessage(loginMessage, "");
  setMessage(signupMessage, "");
  setMessage(verifyMessage, "");
}

function setBusy(form, busy) {
  form.querySelectorAll("input, button").forEach((element) => {
    element.disabled = busy;
  });
}

showLogin.addEventListener("click", () => setMode("login"));
showSignup.addEventListener("click", () => setMode("signup"));
backToSignup.addEventListener("click", () => {
  signupForm.hidden = false;
  verifyForm.hidden = true;
});

if (!isBackendConfigured()) {
  setMessage(loginMessage, "Der sichere Backend-Zugang wird gerade eingerichtet.");
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
  const { data } = await supabase.auth.getSession();
  if (data.session) window.location.replace("/admin/");

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    setMessage(loginMessage, "");
    if (!loginForm.reportValidity()) return;
    const values = new FormData(loginForm);
    const email = values.get("email").trim().toLowerCase();
    const password = values.get("password");
    setBusy(loginForm, true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setMessage(loginMessage, "E-Mail oder Passwort ist nicht korrekt.");
      setBusy(loginForm, false);
      return;
    }
    window.location.assign("/admin/");
  });

  signupForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    setMessage(signupMessage, "");
    if (!signupForm.reportValidity()) return;
    const values = new FormData(signupForm);
    const email = values.get("email").trim().toLowerCase();
    const password = values.get("password");
    const confirmation = values.get("password_confirmation");
    if (!email.endsWith("@heav.ch")) {
      setMessage(signupMessage, "Kontoerstellung ist nur mit einer @heav.ch E-Mail-Adresse möglich.");
      return;
    }
    if (password !== confirmation) {
      setMessage(signupMessage, "Die beiden Passwörter stimmen nicht überein.");
      return;
    }
    if (!passwordPattern.test(password)) {
      setMessage(signupMessage, "Das Passwort braucht mindestens 12 Zeichen, Gross- und Kleinbuchstaben, eine Zahl und ein Sonderzeichen.");
      return;
    }
    setBusy(signupForm, true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${window.location.origin}/login/` },
    });
    if (error) {
      setMessage(signupMessage, "Konto konnte nicht erstellt werden. Verwende eine freigegebene HEAV E-Mail-Adresse oder versuche es später erneut.");
      setBusy(signupForm, false);
      return;
    }
    pendingSignupEmail = email;
    verifyEmail.textContent = email;
    signupForm.hidden = true;
    verifyForm.hidden = false;
    setBusy(signupForm, false);
    verifyForm.querySelector('input[name="token"]').focus();
  });

  verifyForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    setMessage(verifyMessage, "");
    if (!verifyForm.reportValidity() || !pendingSignupEmail) return;
    const token = new FormData(verifyForm).get("token").trim();
    setBusy(verifyForm, true);
    const { data: verified, error } = await supabase.auth.verifyOtp({
      email: pendingSignupEmail,
      token,
      type: "signup",
    });
    if (error || !verified.session) {
      setMessage(verifyMessage, "Der Code ist falsch oder abgelaufen. Bitte prüfe die E-Mail.");
      setBusy(verifyForm, false);
      return;
    }
    setMessage(verifyMessage, "Konto bestätigt. HEAV Studio wird geöffnet.", true);
    window.location.assign("/admin/");
  });
}
