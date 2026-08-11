(() => {
  const $ = (selector, context = document) => context.querySelector(selector);
  const $$ = (selector, context = document) => [
    ...context.querySelectorAll(selector),
  ];

  const translations = new Map([
    ["Leistungen", "Services"], ["Arbeiten", "Work"], ["Über uns", "About"], ["Kontakt", "Contact"], ["Menü", "Menu"], ["Schliessen", "Close"], ["Schweiz", "Switzerland"], ["Zum Inhalt springen", "Skip to content"], ["Projekt besprechen", "Discuss a project"], ["Projekt starten", "Start a project"], ["Leistungen ansehen", "View services"], ["Bereit für neue Projekte", "Open for new projects"], ["Alle Arbeiten", "All work"], ["Ausgewählte Projekte", "Selected projects"], ["Der Inhaber", "The founder"], ["Zusammenarbeit", "Collaboration"], ["Inhaber: Michias Tegegne", "Founder: Michias Tegegne"], ["Inhaber und Gründer", "Founder and director"], ["Nächstes Projekt", "Next project"], ["Mit HEAV arbeiten", "Work with HEAV"], ["Das Projekt", "The project"], ["Kunde", "Client"], ["Produktion", "Production"], ["Filmproduktion", "Film production"], ["Aus der Arbeit.", "From the work."], ["Bilder aus der Produktion.", "Production stills."], ["Portfolio auf Anfrage", "Portfolio on request"], ["Portfolio anfragen", "Request portfolio"], ["Leistungen entdecken", "Explore services"], ["Direkter Kontakt", "Direct contact"], ["Projektanfrage", "Project enquiry"], ["Projektart", "Project type"], ["Projektbeschreibung", "Project description"], ["Bitte auswählen", "Please select"], ["Andere Anfrage", "Other enquiry"], ["Gewünschter Zeitraum", "Preferred timeframe"], ["Anfrage senden", "Send enquiry"],
    ["Filme, die bleiben.", "Films that stay."], ["Film, der nicht nur läuft. Sondern bleibt.", "Film that does more than play. It stays."], ["HEAV ist eine Schweizer Filmproduktionsfirma von", "HEAV is a Swiss film production company founded by"], ["Identität verdichtet zu einer Geschichte mit Haltung.", "Identity distilled into a story with intent."], ["Eine Leitidee für Kampagne, Social und Digital.", "One core idea for campaign, social and digital."], ["Kontinuierlicher Content mit visueller Handschrift.", "Ongoing content with a distinctive visual voice."], ["Michias kennenlernen", "Meet Michias"], ["Vertrauen entsteht im gemeinsamen Machen.", "Trust grows through making together."], ["Bereit für den nächsten Film?", "Ready for the next film?"],
    ["Arbeiten mit Kontext.", "Work with context."], ["Ausgewählte Kundenarbeiten zeigen wir im persönlichen Austausch. So bleiben Veröffentlichungsrechte, Ziele und Projektkontext dort, wo sie hingehören.", "We share selected client work in a personal conversation, keeping publication rights, objectives and project context where they belong."], ["Was passt, zeigen wir gezielt.", "We show what fits, intentionally."], ["Erzähl uns kurz von Marke, Ziel und Format. Danach stellen wir die Arbeiten zusammen, die für das Gespräch wirklich relevant sind.", "Tell us briefly about the brand, objective and format. We will then assemble the work that is truly relevant to the conversation."],
    ["HEAV ist eine inhabergeführte Schweizer Filmproduktion.", "HEAV is an owner-led Swiss film production company."], ["Relevanz vor Lautstärke.", "Relevance over noise."], ["Mehr über Michias", "More about Michias"], ["Inhabergeführt", "Owner-led"], ["Standort", "Location"], ["Persönlich sprechen", "Talk personally"],
    ["Projekt starten", "Start a project"], ["Erzähl uns kurz, worum es geht, wen der Film erreichen soll und wo er eingesetzt wird.", "Tell us what it is about, who the film should reach and where it will be used."], ["Michias Tegegne meldet sich persönlich zurück.", "Michias Tegegne will get back to you personally."], ["Erzähl uns, was entstehen soll.", "Tell us what you want to create."], ["Ein paar Eckpunkte reichen.", "A few key points are enough."], ["Danke für deine Anfrage.", "Thank you for your enquiry."], ["Diese Seite existiert nicht oder wurde verschoben.", "This page does not exist or has moved."], ["Zur Startseite", "Back to home"],
    ["Rainshield in Bewegung.", "Rainshield in motion."], ["Eine Campaign-Produktion für LAWEL, entwickelt als präziser, bewegter Moment für die RAINSHIELD-Kampagne.", "A campaign production for LAWEL, developed as a precise moving moment for the RAINSHIELD campaign."], ["Das Video ist auf YouTube veröffentlicht.", "The video is published on YouTube."], ["Auf YouTube ansehen", "Watch on YouTube"], ["Frames der Kampagne.", "Frames from the campaign."], ["Echte Stimmen. Echte Wirkung.", "Real voices. Real impact."], ["Testimonials für Heilsarmee Liestal – entwickelt, um persönliche Erfahrungen in bewegten Bildern sichtbar zu machen.", "Testimonials for Heilsarmee Liestal, designed to make personal experiences visible through moving images."], ["Neue Kollektion. In Bewegung.", "New collection. In motion."], ["Ein Campaign Film für LAWEL – entwickelt für die neue Kollektion und ihre filmische Bildwelt.", "A campaign film for LAWEL, developed for the new collection and its cinematic visual world."],
 ["Als Inhaber und Gründer von HEAV verbindet Michias Tegegne strategisches Denken mit einer klaren filmischen Perspektive. Er begleitet Projekte persönlich – vom ersten Gespräch bis zur Auslieferung.", "As HEAV's founder and director, Michias Tegegne combines strategic thinking with a clear cinematic perspective. He personally leads projects from the first conversation to delivery."], ["Eine Auswahl belegter Zusammenarbeiten von HEAV.", "A selection of HEAV's documented collaborations."], ["Michias begleitet jedes Projekt persönlich.", "Michias personally leads every project."],
 ["Ein Brand Film oder Imagefilm übersetzt Haltung, Kultur und Angebot in eine klare filmische Erzählung. Nicht als lange Liste von Botschaften, sondern als fokussierte Geschichte mit Wiedererkennung.", "A brand or image film turns identity, culture and offering into a clear cinematic narrative—not a long list of messages, but a focused and recognisable story."], ["Eine Leitidee.", "One core idea."], ["Kampagnen brauchen heute mehr als einen Hero-Film. Wir denken die zentrale Idee modular: Hauptfilm, Cutdowns, Social Assets, Hochformat und kanalspezifische Versionen entstehen aus einem Produktionssystem.", "Campaigns need more than a hero film today. We develop the core idea modularly: a main film, cutdowns, social assets, vertical formats and channel-specific versions grow from one production system."], ["Eine fokussierte Crew, klare Kommunikation und Entscheidungen am richtigen Ort.", "A focused crew, clear communication and decisions made in the right place."],
 ["Ein Film ist der Anfang. Nicht das Ende.", "A film is the beginning, not the end."], ["Wir denken bereits in der Konzeption darüber nach, wie eine Geschichte als Hero-Film, Social Cut, Vertical Asset oder kampagnenbegleitender Content funktioniert.", "From concept onward, we consider how a story works as a hero film, social cut, vertical asset or campaign content."],
 ["Gegründet und geführt von Michias Tegegne, entsteht für jedes Projekt das passende Team – fokussiert, direkt und ohne unnötige Ebenen.", "Founded and led by Michias Tegegne, HEAV assembles the right team for every project—focused, direct and without unnecessary layers."], ["Wir glauben nicht an Bilder um der Bilder willen. Gute Filme beginnen mit einer präzisen Frage: Was soll ein Mensch nach dem letzten Frame verstehen, fühlen oder tun?", "We do not believe in images for their own sake. Good films begin with a precise question: what should someone understand, feel or do after the final frame?"], ["Michias Tegegne ist Inhaber und Gründer von HEAV. Er ist der persönliche Ansprechpartner für neue Projekte und verantwortet die strategische sowie kreative Ausrichtung der Filmproduktion.", "Michias Tegegne is HEAV's founder and director. He is the personal point of contact for new projects and leads the company's strategic and creative direction."],
 ["Bei HEAV verbindet Michias Tegegne strategische Klarheit mit einer filmischen Perspektive. Er begleitet Projekte vom ersten Gespräch über Idee und Produktion bis zur finalen Auslieferung.", "At HEAV, Michias Tegegne combines strategic clarity with a cinematic perspective. He guides projects from the first conversation through concept and production to final delivery."], ["Als Inhaber bleibt die Verantwortung persönlich: kurze Wege, direkte Entscheidungen und ein Team, das passend zur Aufgabe zusammengestellt wird.", "Ownership keeps responsibility personal: short paths, direct decisions and a team assembled for the task."], ["HEAV entwickelt und produziert Bewegtbild für Marken, Agenturen und Organisationen. Der Schwerpunkt liegt auf Brand Films, Imagefilmen, Campaign Content und kontinuierlicher Content Creation.", "HEAV develops and produces moving image for brands, agencies and organisations, with a focus on brand films, image films, campaign content and ongoing content creation."],
 ["Ich bin einverstanden, dass HEAV meine Angaben zur Bearbeitung der Anfrage verwendet. Der Versand erfolgt über FormSubmit.", "I agree that HEAV may use my details to process this enquiry. Submission is handled through FormSubmit."], ["Ein grober Zeithorizont hilft beim ersten Produktionsvorschlag.", "A rough timeframe helps shape the first production proposal."], ["Ein Film", "A film"],
 ["HEAV – Filmproduktion von Michias Tegegne", "HEAV – Film Production by Michias Tegegne"], ["Filmproduktion & Content – Leistungen | HEAV", "Film Production & Content – Services | HEAV"], ["Arbeiten & Einblicke | HEAV Filmproduktion", "Work & Insights | HEAV Film Production"], ["Über HEAV – Filmproduktion von Michias Tegegne", "About HEAV – Film Production by Michias Tegegne"], ["Michias Tegegne – Inhaber & Gründer von HEAV", "Michias Tegegne – Founder & Director of HEAV"], ["Kontakt – HEAV Filmproduktion", "Contact – HEAV Film Production"], ["Seite nicht gefunden | HEAV", "Page not found | HEAV"],
  ]);
  const translate = (value) => {
    if (!value) return value;
    let result = value.replace(/\s+/g, " ");
    [...translations.entries()].sort((a, b) => b[0].length - a[0].length).forEach(([from, to]) => { result = result.split(from).join(to); });
    return result;
  };
  document.documentElement.lang = "en-CH";
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const textNodes = []; while (walker.nextNode()) textNodes.push(walker.currentNode);
  textNodes.forEach((node) => { node.nodeValue = translate(node.nodeValue); });
  $$("[title], [aria-label], [placeholder], meta[content], input[value]").forEach((element) => {
    for (const attribute of ["title", "aria-label", "placeholder", "content", "value"]) {
      if (element.hasAttribute(attribute)) element.setAttribute(attribute, translate(element.getAttribute(attribute)));
    }
  });
  document.title = translate(document.title);

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

  const formSuccess = $("[data-form-success]");
  if (
    formSuccess &&
    new URLSearchParams(location.search).get("gesendet") === "1"
  ) {
    formSuccess.hidden = false;
    history.replaceState(null, "", `${location.pathname}#anfrage`);
    requestAnimationFrame(() => formSuccess.focus({ preventScroll: true }));
  }

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

  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const precisePointer = matchMedia(
    "(hover: hover) and (pointer: fine)",
  ).matches;

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
})();
