(() => {
  const $ = (s, c = document) => c.querySelector(s),
    $$ = (s, c = document) => [...c.querySelectorAll(s)];
  const header = $(".site-header"),
    toggle = $(".menu-toggle"),
    menu = $(".mobile-menu");
  const setMenu = (open) => {
    if (!toggle || !menu) return;
    menu.classList.toggle("open", open);
    document.body.classList.toggle("menu-open", open);
    toggle.setAttribute("aria-expanded", String(open));
    toggle.textContent = open ? "Schliessen" : "Menü";
    menu.setAttribute("aria-hidden", String(!open));
  };
  toggle?.addEventListener("click", () =>
    setMenu(!menu.classList.contains("open")),
  );
  $$(".mobile-menu a").forEach((a) =>
    a.addEventListener("click", () => setMenu(false)),
  );
  addEventListener("keydown", (e) => {
    if (e.key === "Escape") setMenu(false);
  });
  let last = 0;
  const onScroll = () => {
    header?.classList.toggle("scrolled", scrollY > 24);
    last = scrollY;
  };
  addEventListener("scroll", onScroll, { passive: true });
  onScroll();
  const io =
    "IntersectionObserver" in window
      ? new IntersectionObserver(
          (es) =>
            es.forEach((e) => {
              if (e.isIntersecting) {
                e.target.classList.add("seen");
                io.unobserve(e.target);
              }
            }),
          { threshold: 0.12 },
        )
      : null;
  $$(".reveal").forEach((el) =>
    io ? io.observe(el) : el.classList.add("seen"),
  );
  $$("[data-year]").forEach(
    (el) => (el.textContent = new Date().getFullYear()),
  );
  const opener = $(".home-opener"),
    reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (opener && !reduced) {
    const trails = $$(".logo-trail"),
      wrap = $(".opener-logo-wrap", opener),
      meta = $(".opener-meta", opener);
    let tick = false,
      trailTick = false,
      lastY = scrollY,
      energy = 0,
      direction = 1;
    function animateTrails() {
      energy *= 0.925;
      trails.forEach((layer, index) => {
        const depth = index + 1,
          d = energy * depth;
        layer.style.transform = `translate3d(${(-direction * d * 11.5).toFixed(1)}px,${(direction * d * 8).toFixed(1)}px,0) skewX(${(-direction * energy * depth * 0.7).toFixed(2)}deg)`;
        layer.style.opacity = Math.min(
          0.72,
          energy * (0.16 + depth * 0.05),
        ).toFixed(3);
        layer.style.filter = `blur(${(1 + depth * 0.65 + energy * 3.5).toFixed(1)}px)`;
      });
      if (energy > 0.006) requestAnimationFrame(animateTrails);
      else {
        trailTick = false;
        trails.forEach((l) => (l.style.opacity = "0"));
      }
    }
    function update() {
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
      const travel = Math.max(1, opener.offsetHeight - innerHeight),
        p = Math.min(1, Math.max(0, scrollY / travel)),
        fade = p < 0.65 ? 1 : Math.max(0, 1 - (p - 0.65) / 0.35);
      opener.style.setProperty("--p", p.toFixed(4));
      opener.style.setProperty("--logo-opacity", fade.toFixed(4));
      tick = false;
    }
    addEventListener(
      "scroll",
      () => {
        if (!tick) {
          requestAnimationFrame(update);
          tick = true;
        }
      },
      { passive: true },
    );
    addEventListener("resize", update);
    update();
  }
})();
