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
    toggle.textContent = open ? "Close" : "Menu";
    menu.setAttribute("aria-hidden", String(!open));
    menu.toggleAttribute("inert", !open);
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

  let headerIsScrolled;
  const updateHeader = () => {
    if (!header) return;
    const nextState = scrollY > 24;
    if (nextState === headerIsScrolled) return;
    headerIsScrolled = nextState;
    header.classList.toggle("scrolled", nextState);
  };
  addEventListener("scroll", updateHeader, { passive: true });
  addEventListener("resize", updateHeader);
  updateHeader();

  $$('[data-year]').forEach(
    (element) => (element.textContent = new Date().getFullYear()),
  );

  const formSuccess = $("[data-form-success]");
  if (
    formSuccess &&
    new URLSearchParams(location.search).get("sent") === "1"
  ) {
    formSuccess.hidden = false;
    history.replaceState(null, "", `${location.pathname}#enquiry`);
    requestAnimationFrame(() => formSuccess.focus({ preventScroll: true }));
  }


  const galleryItems = $$('[data-gallery-item]');
  if (galleryItems.length) {
    const lightbox = document.createElement("dialog");
    lightbox.className = "gallery-lightbox";
    lightbox.setAttribute("aria-label", "Image viewer");
    lightbox.innerHTML = `
      <div class="gallery-lightbox-frame">
        <button class="gallery-lightbox-close" type="button" aria-label="Close image viewer">Close</button>
        <button class="gallery-lightbox-nav gallery-lightbox-prev" type="button" aria-label="Previous image">Previous</button>
        <figure class="gallery-lightbox-figure">
          <img class="gallery-lightbox-image" alt="" />
          <figcaption class="gallery-lightbox-caption"></figcaption>
        </figure>
        <button class="gallery-lightbox-nav gallery-lightbox-next" type="button" aria-label="Next image">Next</button>
      </div>`;
    document.body.append(lightbox);

    const image = $(".gallery-lightbox-image", lightbox);
    const caption = $(".gallery-lightbox-caption", lightbox);
    const close = $(".gallery-lightbox-close", lightbox);
    const previous = $(".gallery-lightbox-prev", lightbox);
    const next = $(".gallery-lightbox-next", lightbox);
    let activeIndex = 0;

    const showImage = (index) => {
      activeIndex = (index + galleryItems.length) % galleryItems.length;
      const item = galleryItems[activeIndex];
      const source = $("img", item);
      if (!source) return;
      image.src = source.currentSrc || source.src;
      image.alt = source.alt;
      caption.textContent = `${item.dataset.galleryCaption || source.alt} · ${String(activeIndex + 1).padStart(2, "0")} / ${String(galleryItems.length).padStart(2, "0")}`;
    };
    const openLightbox = (index) => {
      showImage(index);
      lightbox.showModal();
      requestAnimationFrame(() => close.focus());
    };

    galleryItems.forEach((item, index) =>
      item.addEventListener("click", () => openLightbox(index)),
    );
    close.addEventListener("click", () => lightbox.close());
    previous.addEventListener("click", () => showImage(activeIndex - 1));
    next.addEventListener("click", () => showImage(activeIndex + 1));
    lightbox.addEventListener("click", (event) => {
      if (event.target === lightbox) lightbox.close();
    });
    lightbox.addEventListener("keydown", (event) => {
      if (event.key === "ArrowLeft") showImage(activeIndex - 1);
      if (event.key === "ArrowRight") showImage(activeIndex + 1);
    });
  }

  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const precisePointer = matchMedia(
    "(hover: hover) and (pointer: fine)",
  ).matches;
  document.documentElement.classList.add("motion-primitives-ready");

  if (!reducedMotion && precisePointer) {
    $$(".hero-art, .work-feature-art").forEach((surface) => {
      let frame = 0;
      let latestEvent;
      surface.addEventListener("pointermove", (event) => {
        latestEvent = event;
        if (frame) return;
        frame = requestAnimationFrame(() => {
          const rect = surface.getBoundingClientRect();
          const x = (42 + ((latestEvent.clientX - rect.left) / rect.width) * 28).toFixed(2);
          const y = (22 + ((latestEvent.clientY - rect.top) / rect.height) * 28).toFixed(2);
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

  const motionProgress = document.createElement("span");
  motionProgress.className = "motion-scroll-progress";
  motionProgress.setAttribute("aria-hidden", "true");
  document.body.append(motionProgress);

  const updateMotionProgress = () => {
    const maxScroll = document.documentElement.scrollHeight - innerHeight;
    const progress = maxScroll > 0 ? Math.min(100, Math.max(0, (scrollY / maxScroll) * 100)) : 0;
    document.documentElement.style.setProperty("--motion-scroll-progress", progress.toFixed(2));
  };
  let motionProgressFrame = 0;
  addEventListener("scroll", () => {
    if (motionProgressFrame) return;
    motionProgressFrame = requestAnimationFrame(() => {
      motionProgressFrame = 0;
      updateMotionProgress();
    });
  }, { passive: true });
  addEventListener("resize", updateMotionProgress);
  updateMotionProgress();

  const revealTargets = $$([
    ".temporary-home-logo",
    ".page-hero",
    ".section",
    ".cta-panel",
    ".work-feature",
    ".selected-work-feature",
    ".home-photography-promo",
    ".project-hero-image",
    ".project-video-frame",
    ".project-stills-section",
    ".client-block",
    ".owner-section",
    ".contact-form-layout",
    ".home-project-card",
    ".still-card",
    ".gallery-tile",
  ].join(","));
  const motionGroups = $$([
    ".home-project-grid",
    ".still-grid",
    ".stills-gallery-grid",
    ".selected-photography-grid",
    ".link-list",
    ".client-logos",
  ].join(","));

  motionGroups.forEach((group) => {
    group.classList.add("mp-reveal", "mp-stagger-group");
    [...group.children].forEach((item, index) => {
      item.classList.add("mp-stagger-item");
      item.style.setProperty("--mp-index", index);
    });
  });
  revealTargets.forEach((target) => target.classList.add("mp-reveal"));
  [
    ".home-project-card",
    ".selected-work-feature",
    ".work-feature",
    ".cta-panel",
  ].forEach((selector) => $$(selector).forEach((element) => element.classList.add("mp-border-trail")));
  [
    ".home-project-card-image",
    ".selected-work-image",
  ].forEach((selector) => $$(selector).forEach((element) => element.classList.add("mp-spotlight")));

  const motionTargets = [...new Set([...revealTargets, ...motionGroups])];
  const showMotionTarget = (target) => target.classList.add("mp-in-view");
  if (reducedMotion || !("IntersectionObserver" in window)) {
    motionTargets.forEach(showMotionTarget);
  } else {
    const motionObserver = new IntersectionObserver((entries, observer) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        showMotionTarget(entry.target);
        observer.unobserve(entry.target);
      });
    }, { rootMargin: "0px 0px -10% 0px", threshold: 0.08 });
    motionTargets.forEach((target) => motionObserver.observe(target));
  }

  if (!reducedMotion && precisePointer) {
    const spotlightSurfaces = $$(".home-project-card-image, .selected-work-image");
    spotlightSurfaces.forEach((surface) => {
      let frame = 0;
      let latestEvent;
      surface.addEventListener("pointermove", (event) => {
        latestEvent = event;
        if (frame) return;
        frame = requestAnimationFrame(() => {
          const rect = surface.getBoundingClientRect();
          surface.style.setProperty("--mp-x", `${(((latestEvent.clientX - rect.left) / rect.width) * 100).toFixed(2)}%`);
          surface.style.setProperty("--mp-y", `${(((latestEvent.clientY - rect.top) / rect.height) * 100).toFixed(2)}%`);
          frame = 0;
        });
      });
      surface.addEventListener("pointerleave", () => {
        if (frame) cancelAnimationFrame(frame);
        frame = 0;
        surface.style.removeProperty("--mp-x");
        surface.style.removeProperty("--mp-y");
      });
    });
  }
  const textEffectTargets = $$(
    "[data-text-effect='per-char'], .page-hero h1, .temporary-home-logo-mark, .work-feature-copy h2, .selected-work-copy h2",
  ).filter((element) => !element.dataset.mpTextEffectApplied && element.textContent.trim().length > 0);
  textEffectTargets.forEach((element) => {
    const text = element.innerText.trim().replace(/\s+/g, " ");
    element.dataset.mpTextEffectApplied = "true";
    element.dataset.textEffect = "per-char";
    element.classList.add("mp-text-effect");
    element.setAttribute("aria-label", text);
    const textNodes = [];
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (node.parentElement?.closest("script, style")) continue;
      if (node.textContent.trim()) textNodes.push(node);
    }
    textNodes.forEach((textNode) => {
      const fragment = document.createDocumentFragment();
      [...textNode.textContent].forEach((character, index) => {
        const span = document.createElement("span");
        span.className = "mp-char";
        span.setAttribute("aria-hidden", "true");
        span.style.setProperty("--mp-char-index", index);
        span.textContent = character === " " ? String.fromCharCode(160) : character;
        fragment.append(span);
      });
      textNode.replaceWith(fragment);
    });
    requestAnimationFrame(() => element.classList.add("mp-text-visible"));
  });
})();
