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

const showInstallHelp = () => {
  if (typeof installDialog?.showModal === "function") installDialog.showModal();
};

const requestNativeInstall = async () => {
  if (!installPrompt) return false;
  const promptEvent = installPrompt;
  installPrompt = null;
  if (nativeInstallButton) nativeInstallButton.hidden = true;
  try {
    await promptEvent.prompt();
    const { outcome } = await promptEvent.userChoice;
    if (outcome === "accepted" && installDialog?.open) installDialog.close();
    return true;
  } catch {
    return false;
  }
};

installButton?.addEventListener("click", async () => {
  if (await requestNativeInstall()) return;
  showInstallHelp();
});

closeButton?.addEventListener("click", () => installDialog.close());
installDialog?.addEventListener("click", (event) => {
  if (event.target === installDialog) installDialog.close();
});

nativeInstallButton?.addEventListener("click", requestNativeInstall);

window.addEventListener("appinstalled", () => {
  installPrompt = null;
  if (installButton) installButton.hidden = true;
  if (installDialog?.open) installDialog.close();
});
