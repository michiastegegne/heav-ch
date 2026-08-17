(() => {
  const MEASUREMENT_ID = "G-8WXQG8M7CS";
  const CONSENT_KEY = "heav-analytics-consent";
  const bannerId = "heav-analytics-consent";
  let googleTagLoaded = false;

  window.dataLayer = window.dataLayer || [];
  function gtag() {
    window.dataLayer.push(arguments);
  }
  window.gtag = window.gtag || gtag;

  const applyConsent = (value) => {
    if (value === "granted") {
      window.gtag("consent", "update", { analytics_storage: "granted" });
      localStorage.setItem(CONSENT_KEY, "granted");
      loadGoogleTag();
      return;
    }
    window.gtag("consent", "update", { analytics_storage: "denied" });
    localStorage.setItem(CONSENT_KEY, "denied");
  };

  const loadGoogleTag = () => {
    if (googleTagLoaded || document.querySelector("script[data-heav-google-tag]")) return;
    googleTagLoaded = true;
    const tag = document.createElement("script");
    tag.async = true;
    tag.src = `https://www.googletagmanager.com/gtag/js?id=${MEASUREMENT_ID}`;
    tag.dataset.heavGoogleTag = "true";
    tag.addEventListener("load", () => {
      window.gtag("js", new Date());
      window.gtag("config", MEASUREMENT_ID, { anonymize_ip: true });
    });
    document.head.append(tag);
  };

  const closeBanner = () => document.getElementById(bannerId)?.remove();

  const renderBanner = (preferences = false) => {
    closeBanner();
    const dialog = document.createElement("section");
    dialog.id = bannerId;
    dialog.className = "analytics-consent";
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-live", "polite");
    dialog.setAttribute("aria-label", "Analytics preferences");
    dialog.innerHTML = `
      <div class="analytics-consent__content">
        <p class="analytics-consent__eyebrow">Privacy</p>
        <h2>${preferences ? "Analytics preferences" : "Help us understand how HEAV is used."}</h2>
        <p>With your permission, HEAV uses Google Analytics to measure anonymous website usage. You can accept or decline. Your choice does not affect the website.</p>
        <p><a href="/privacy/">Learn more in our privacy notice</a>.</p>
      </div>
      <div class="analytics-consent__actions">
        <button type="button" class="analytics-consent__decline">Decline</button>
        <button type="button" class="analytics-consent__accept">Accept analytics</button>
      </div>`;
    document.body.append(dialog);
    dialog.querySelector(".analytics-consent__decline").addEventListener("click", () => {
      applyConsent("denied");
      closeBanner();
    });
    dialog.querySelector(".analytics-consent__accept").addEventListener("click", () => {
      applyConsent("granted");
      closeBanner();
    });
  };

  const consent = localStorage.getItem(CONSENT_KEY);
  window.gtag("consent", "default", { analytics_storage: "denied" });
  if (consent === "granted") loadGoogleTag();
  if (!consent) renderBanner();

  document.addEventListener("click", (event) => {
    const trigger = event.target.closest("[data-analytics-preferences]");
    if (!trigger) return;
    event.preventDefault();
    renderBanner(true);
  });
})();
