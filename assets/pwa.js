if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/service-worker.js", { scope: "/" }).catch(() => {
      // The app remains usable online if service-worker registration is unavailable.
    });
  });
}

const installButton = document.querySelector("#pwa-install-button");
const installDialog = document.querySelector("#pwa-install-dialog");
const closeButton = installDialog?.querySelector(".install-close");
const nativeInstallButton = document.querySelector("#pwa-native-install");
let installPrompt = null;

const isStandalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
if (isStandalone && installButton) installButton.hidden = true;

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  installPrompt = event;
  if (nativeInstallButton) nativeInstallButton.hidden = false;
});

installButton?.addEventListener("click", () => {
  if (typeof installDialog?.showModal === "function") installDialog.showModal();
});

closeButton?.addEventListener("click", () => installDialog.close());
installDialog?.addEventListener("click", (event) => {
  if (event.target === installDialog) installDialog.close();
});

nativeInstallButton?.addEventListener("click", async () => {
  if (!installPrompt) return;
  await installPrompt.prompt();
  const { outcome } = await installPrompt.userChoice;
  installPrompt = null;
  nativeInstallButton.hidden = true;
  if (outcome === "accepted") installDialog.close();
});

window.addEventListener("appinstalled", () => {
  installPrompt = null;
  if (installButton) installButton.hidden = true;
  if (installDialog?.open) installDialog.close();
});
