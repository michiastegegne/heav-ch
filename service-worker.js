const CACHE_PREFIX = "heav-studio-";
const CACHE_NAME = `${CACHE_PREFIX}v2`;
const APP_SHELL = [
  "/manifest.webmanifest",
  "/favicon.svg",
  "/login/",
  "/login/assets/login.css",
  "/login/assets/login.js",
  "/admin/?preview=1",
  "/admin/index.html",
  "/admin/config.js",
  "/admin/assets/admin.css",
  "/admin/assets/app.js",
  "/admin/assets/domain.js",
  "/admin/assets/HEAV-Musterrechnung.pdf",
  "/assets/pwa.js",
  "/assets/fonts/dm-sans.woff2",
  "/assets/fonts/instrument-serif.woff2",
  "/assets/fonts/instrument-serif-italic.woff2",
  "/assets/fonts/syne.woff2",
  "/assets/app-icons/icon-180.png",
  "/assets/app-icons/icon-192.png",
  "/assets/app-icons/icon-512.png",
  "/assets/app-icons/icon-maskable-512.png"
];
const APP_SHELL_URLS = new Set(APP_SHELL.map((path) => new URL(path, self.location.origin).href));

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(
      APP_SHELL.map((path) => new Request(path, { cache: "reload", credentials: "omit" }))
    ))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys
        .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
        .map((key) => caches.delete(key))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => {
        const isExactPreview = url.pathname === "/admin/"
          && url.searchParams.size === 1
          && url.searchParams.get("preview") === "1";
        if (isExactPreview) {
          return (await caches.match("/admin/?preview=1")) || Response.error();
        }
        return (await caches.match("/login/")) || Response.error();
      })
    );
    return;
  }

  if (!APP_SHELL_URLS.has(url.href)) return;
  event.respondWith(
    fetch(request).catch(async () => (await caches.match(url.href)) || Response.error())
  );
});
