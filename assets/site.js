(() => {
  const $ = (selector, context = document) => context.querySelector(selector);
  const $$ = (selector, context = document) => [
    ...context.querySelectorAll(selector),
  ];

  const header = $(".site-header");
  const toggle = $(".menu-toggle");
  const menu = $(".mobile-menu");
  const backgroundRegions = [
    $(".skip-link"),
    $(".home-opener"),
    $("main"),
    $(".site-footer"),
  ].filter(Boolean);

  const menuFocusables = () =>
    $$(
      'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      menu,
    );

  const setMenu = (open, returnFocus = true) => {
    if (!toggle || !menu) return;
    const wasOpen = menu.classList.contains("open");
    menu.classList.toggle("open", open);
    document.body.classList.toggle("menu-open", open);
    toggle.setAttribute("aria-expanded", String(open));
    toggle.textContent = open ? "Schliessen" : "Menü";
    menu.setAttribute("aria-hidden", String(!open));
    backgroundRegions.forEach((region) =>
      region.toggleAttribute("inert", open),
    );

    if (open) {
      requestAnimationFrame(() => menuFocusables()[0]?.focus());
    } else if (wasOpen && returnFocus) {
      requestAnimationFrame(() => toggle.focus());
    }
  };

  toggle?.addEventListener("click", () =>
    setMenu(!menu.classList.contains("open")),
  );
  $$(".mobile-menu a").forEach((link) =>
    link.addEventListener("click", () => setMenu(false, false)),
  );
  addEventListener("keydown", (event) => {
    if (!menu?.classList.contains("open")) return;
    if (event.key === "Escape") {
      event.preventDefault();
      setMenu(false);
      return;
    }
    if (event.key !== "Tab") return;
    const focusables = menuFocusables();
    if (!focusables.length) return;
    const first = focusables[0];
    const last = focusables.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });

  const onScroll = () => header?.classList.toggle("scrolled", scrollY > 24);
  addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  const revealObserver =
    "IntersectionObserver" in window
      ? new IntersectionObserver(
          (entries) =>
            entries.forEach((entry) => {
              if (entry.isIntersecting) {
                entry.target.classList.add("seen");
                revealObserver.unobserve(entry.target);
              }
            }),
          { threshold: 0.12 },
        )
      : null;
  $$(".reveal").forEach((element) =>
    revealObserver
      ? revealObserver.observe(element)
      : element.classList.add("seen"),
  );
  $$("[data-year]").forEach(
    (element) => (element.textContent = new Date().getFullYear()),
  );

  const opener = $(".home-opener");
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let openerSeen = false;
  try {
    openerSeen = sessionStorage.getItem("heav-opener-seen") === "1";
  } catch {}

  const markOpenerSeen = () => {
    if (openerSeen) return;
    openerSeen = true;
    try {
      sessionStorage.setItem("heav-opener-seen", "1");
    } catch {}
  };

  if (opener && (openerSeen || reducedMotion)) {
    document.body.classList.add("opener-seen");
  } else if (opener) {
    $(".opener-enter")?.addEventListener("click", markOpenerSeen);
    const allTrails = $$(".logo-trail", opener);
    const mobileMotion = innerWidth <= 800;
    const trails = mobileMotion ? allTrails.slice(-4) : allTrails;
    if (mobileMotion) {
      allTrails.slice(0, -4).forEach((layer) => (layer.style.display = "none"));
    }

    let tick = false;
    let trailTick = false;
    let lastY = scrollY;
    let energy = 0;
    let direction = 1;
    let openerActive = true;

    if ("IntersectionObserver" in window) {
      new IntersectionObserver(([entry]) => {
        openerActive = entry.isIntersecting;
        if (!openerActive) energy = 0;
      }).observe(opener);
    }

    function animateTrails() {
      energy *= 0.925;
      trails.forEach((layer, index) => {
        const depth = index + 1;
        const distance = energy * depth;
        layer.style.transform = `translate3d(${(-direction * distance * 11.5).toFixed(1)}px,${(direction * distance * 8).toFixed(1)}px,0) skewX(${(-direction * energy * depth * 0.7).toFixed(2)}deg)`;
        layer.style.opacity = Math.min(
          0.72,
          energy * (0.16 + depth * 0.05),
        ).toFixed(3);
        if (!mobileMotion) {
          layer.style.filter = `blur(${(1 + depth * 0.65 + energy * 3.5).toFixed(1)}px)`;
        }
      });
      if (energy > 0.006 && openerActive) {
        requestAnimationFrame(animateTrails);
      } else {
        trailTick = false;
        trails.forEach((layer) => (layer.style.opacity = "0"));
      }
    }

    function updateOpener() {
      if (!openerActive) {
        tick = false;
        return;
      }
      const delta = scrollY - lastY;
      lastY = scrollY;
      if (Math.abs(delta) > 0.2) {
        direction = Math.sign(delta);
        energy = Math.min(1, energy + Math.abs(delta) / 36);
        if (!trailTick) {
          trailTick = true;
          requestAnimationFrame(animateTrails);
        }
      }
      const travel = Math.max(1, opener.offsetHeight - innerHeight);
      const progress = Math.min(1, Math.max(0, scrollY / travel));
      const fade =
        progress < 0.65 ? 1 : Math.max(0, 1 - (progress - 0.65) / 0.35);
      opener.style.setProperty("--p", progress.toFixed(4));
      opener.style.setProperty("--logo-opacity", fade.toFixed(4));
      if (progress > 0.9) markOpenerSeen();
      tick = false;
    }

    addEventListener(
      "scroll",
      () => {
        if (!tick && openerActive) {
          requestAnimationFrame(updateOpener);
          tick = true;
        }
      },
      { passive: true },
    );
    addEventListener("resize", updateOpener);
    updateOpener();
  }
})();
