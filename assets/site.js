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

  const updateHeader = () => {
    if (!header) return;
    header.classList.toggle("scrolled", scrollY > 24);
    const scrollRange = Math.max(
      1,
      document.documentElement.scrollHeight - innerHeight,
    );
    header.style.setProperty(
      "--scroll-progress",
      Math.min(1, Math.max(0, scrollY / scrollRange)).toFixed(4),
    );
  };
  addEventListener("scroll", updateHeader, { passive: true });
  addEventListener("resize", updateHeader);
  updateHeader();

  $$("[data-year]").forEach(
    (element) => (element.textContent = new Date().getFullYear()),
  );

  const enableGrain = () => document.body.classList.add("grain-ready");
  const scheduleGrain = () => {
    if ("requestIdleCallback" in window) {
      requestIdleCallback(enableGrain, { timeout: 1400 });
    } else {
      setTimeout(enableGrain, 700);
    }
  };
  if (document.readyState === "complete") {
    scheduleGrain();
  } else {
    addEventListener("load", scheduleGrain, { once: true });
  }

  const opener = $(".home-opener");
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const precisePointer = matchMedia(
    "(hover: hover) and (pointer: fine)",
  ).matches;

  if (!reducedMotion && precisePointer) {
    const cursorRing = document.createElement("span");
    cursorRing.className = "cursor-ring";
    cursorRing.setAttribute("aria-hidden", "true");
    document.body.append(cursorRing);

    let cursorFrame = 0;
    let cursorEvent;
    const updateCursor = () => {
      const { clientX: x, clientY: y, target } = cursorEvent;
      cursorRing.style.transform = `translate3d(${x}px,${y}px,0)`;
      cursorRing.classList.toggle(
        "is-interactive",
        Boolean(
          target.closest("a, button, [role='button'], input, textarea, select"),
        ),
      );
      cursorFrame = 0;
    };
    addEventListener("pointermove", (event) => {
      cursorEvent = event;
      cursorRing.classList.add("is-visible");
      if (!cursorFrame) cursorFrame = requestAnimationFrame(updateCursor);
    });
    document.documentElement.addEventListener("pointerleave", () =>
      cursorRing.classList.remove("is-visible", "is-interactive", "is-pressed"),
    );
    addEventListener("pointerdown", () =>
      cursorRing.classList.add("is-pressed"),
    );
    addEventListener("pointerup", () =>
      cursorRing.classList.remove("is-pressed"),
    );
    addEventListener(
      "scroll",
      () => cursorRing.classList.remove("is-interactive", "is-pressed"),
      { passive: true },
    );
  }

  if (!reducedMotion && precisePointer && "IntersectionObserver" in window) {
    const motionTargets = $$(
      "main .section-head, main .section-copy, main .link-row, main .split > *, main .work-feature > *, main .portfolio-panel, main .meta-item, main .step, main .prose > h2, main .prose > p, main .cta-panel > *",
    );
    const motionObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const element = entry.target;
          const siblings = motionTargets.filter(
            (candidate) => candidate.parentElement === element.parentElement,
          );
          const delay = Math.min(
            Math.max(0, siblings.indexOf(element)) * 45,
            135,
          );
          const animation = element.animate(
            [
              { opacity: 0.72, transform: "translate3d(0, 1rem, 0)" },
              { opacity: 1, transform: "translate3d(0, 0, 0)" },
            ],
            {
              duration: 620,
              delay,
              easing: "cubic-bezier(0.22, 1, 0.36, 1)",
            },
          );
          animation.addEventListener("finish", () => animation.cancel(), {
            once: true,
          });
          element.classList.add("motion-entered");
          motionObserver.unobserve(element);
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -7% 0px" },
    );
    motionTargets.forEach((element) => motionObserver.observe(element));
  }

  if (!reducedMotion && precisePointer) {
    $$(".hero-art, .work-feature-art").forEach((surface) => {
      let frame = 0;
      let latestEvent;
      surface.addEventListener("pointermove", (event) => {
        latestEvent = event;
        if (frame) return;
        frame = requestAnimationFrame(() => {
          const rect = surface.getBoundingClientRect();
          const x = (
            42 +
            ((latestEvent.clientX - rect.left) / rect.width) * 28
          ).toFixed(2);
          const y = (
            22 +
            ((latestEvent.clientY - rect.top) / rect.height) * 28
          ).toFixed(2);
          surface.style.setProperty("--mx", `${x}%`);
          surface.style.setProperty("--my", `${y}%`);
          frame = 0;
        });
      });
      surface.addEventListener("pointerleave", () => {
        if (frame) cancelAnimationFrame(frame);
        frame = 0;
        surface.style.removeProperty("--mx");
        surface.style.removeProperty("--my");
      });
    });
  }

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
