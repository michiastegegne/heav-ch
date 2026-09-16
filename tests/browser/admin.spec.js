import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

import { assertStudioEditorialTheme } from './theme-assertions.js';
const base = "http://127.0.0.1:4180";

async function assertHealthy(page, errors) {
  const metrics = await page.evaluate(() => ({
    innerWidth,
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(metrics.clientWidth).toBe(metrics.innerWidth);
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth);
  expect(errors).toEqual([]);
}

async function mockStudioSupabase(page, overrides = {}) {
  await page.addInitScript(() => localStorage.setItem("__heavStudioSession", "1"));
  await page.route(`${base}/studio/`, async (route) => {
    const response = await route.fetch();
    const html = (await response.text()).replace('data-assistant-enabled="false"', 'data-assistant-enabled="true"');
    await route.fulfill({ response, body: html });
  });
  await page.route("https://bkazlpqjvbuhwmjcwexn.supabase.co/functions/v1/invoice-document", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/pdf", body: "%PDF-1.4\\n% HEAV test PDF\\n%%EOF" });
  });
  await page.route("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.4/+esm", async (route) => {
    await route.fulfill({
      contentType: "application/javascript",
      body: `const store = {
        customers: [
          { id: "c1", company: "Nordlicht AG", contact_name: "Anna Keller", email: "anna@nordlicht.example", phone: "", city: "Basel", postal_code: "4051", address_line1: "Teststrasse 1", country: "Schweiz" },
          { id: "c2", company: "Atelier Morgen", contact_name: "Noah Frei", email: "noah@morgen.example", phone: "", city: "Zürich", postal_code: "8004", address_line1: "Testweg 2", country: "Schweiz" }
        ],
        projects: [
          { id: "p1", customer_id: "c1", title: "Brand Film 2026", status: "active", budget_rappen: 1850000, start_date: "2026-07-15", due_date: "2026-09-18", description: "Brand Film" },
          { id: "p2", customer_id: "c2", title: "Campaign Content", status: "planning", budget_rappen: 920000, start_date: "2026-08-20", due_date: "2026-10-02", description: "Campaign" }
        ],
        invoices: [
          { id: "i1", customer_id: "c1", project_id: "p1", invoice_number: "HEAV-2026-001", payment_reference: "RF51HEAV2026000001", issue_date: "2026-07-28", due_date: "2026-08-27", status: "sent", subtotal_rappen: 850000, tax_rappen: 68850, total_rappen: 918850, tax_rate: 8.1, invoice_items: [] },
          { id: "i2", customer_id: "c2", project_id: "p2", invoice_number: "HEAV-2026-002", payment_reference: "RF24HEAV2026000002", issue_date: "2026-08-01", due_date: "2026-08-31", status: "sent", subtotal_rappen: 50820, tax_rappen: 0, total_rappen: 50820, tax_rate: 0, invoice_items: [
            { position: 1, description: "Foto- & Videoproduktion vor Ort", quantity: 2.75, unit_price_rappen: 15000 },
            { position: 2, description: "Persönlicher Sonderrabatt", quantity: 1, unit_price_rappen: -6190 },
            { position: 3, description: "Foto-/Equipment-Zuschlag", quantity: 1, unit_price_rappen: 10000 },
            { position: 4, description: "An- und Rückreise", quantity: 1, unit_price_rappen: 5760 }
          ] }
        ],
        offers: [
          { id: "o1", customer_id: "c1", project_id: "p1", offer_number: "HEAV-O-2026-001", title: "Brand Film Produktion", issue_date: "2026-09-01", valid_until: "2026-10-01", status: "draft", subtotal_rappen: 500000, tax_rappen: 40500, total_rappen: 540500, tax_rate: 8.1, notes: "Produktion gemäss Briefing.", terms: "Mit der Annahme ist die Offerte verbindlich.", offer_items: [{ position: 1, description: "Produktion", quantity: 1, unit_price_rappen: 500000 }] }
        ],
        company_settings: [{ company_name: "HEAV", owner_name: "Michias Tegegne", email: "hello@heav.ch", iban: "", default_tax_rate: 8.1, default_due_days: 30 }],
        customer_portal_memberships: [],
        customer_portal_requests: [{ id: "r1", company: "Studio Nord", contact_name: "Lea Meier", email: "lea@studio-nord.example", phone: "+41 79 123 45 67", message: "Zugang für die Filmabnahme 2026.", status: "pending", created_at: "2026-09-09T10:00:00Z" }]
      };
      Object.assign(store, ${JSON.stringify(overrides)});
      const result = (data) => ({ data, error: null });
      export function createClient() {
        return {
          auth: {
            getSession: async () => ({ data: { session: { access_token: "test", user: { id: "owner-test" } } }, error: null }),
            signOut: async () => ({ error: null })
          },
          from(table) {
            const builder = {
              select() { return builder; },
              eq() { return builder; },
              order: async () => result(store[table]),
              maybeSingle: async () => result(store[table][0] || null),
              limit: async () => result(store[table].slice(0, 1)),
              insert: async (payload) => { store[table].push({ id: crypto.randomUUID(), ...payload }); return result(null); },
              upsert: async (payload) => { store[table] = [{ ...store[table][0], ...payload }]; return result(null); }
            };
            return builder;
          },
          rpc: async (name, payload) => {
            if (name === "is_studio_owner") return result(true);
            if (name === "update_invoice") {
              window.__lastUpdatedInvoiceItems = payload.p_items;
            }
            if (name === "create_invoice") {
              window.__lastCreatedInvoiceItems = payload.p_items;
              const subtotal = payload.p_items.reduce((sum, item) => sum + Math.round(item.quantity * item.unit_price_rappen), 0);
              const tax = Math.round(subtotal * payload.p_tax_rate / 100);
              store.invoices.unshift({ id: crypto.randomUUID(), customer_id: payload.p_customer_id, project_id: payload.p_project_id, invoice_number: "HEAV-2026-003", payment_reference: "RF94HEAV2026000003", issue_date: payload.p_issue_date, due_date: payload.p_due_date, status: "draft", subtotal_rappen: subtotal, tax_rappen: tax, total_rappen: subtotal + tax, tax_rate: payload.p_tax_rate, invoice_items: payload.p_items });
            }
            if (name === "create_offer") {
              const subtotal = payload.p_items.reduce((sum, item) => sum + Math.round(item.quantity * item.unit_price_rappen), 0);
              const tax = Math.round(subtotal * payload.p_tax_rate / 100);
              store.offers.unshift({ id: crypto.randomUUID(), customer_id: payload.p_customer_id, project_id: payload.p_project_id, offer_number: "HEAV-O-2026-002", title: payload.p_title, issue_date: payload.p_issue_date, valid_until: payload.p_valid_until, status: "draft", subtotal_rappen: subtotal, tax_rappen: tax, total_rappen: subtotal + tax, tax_rate: payload.p_tax_rate, notes: payload.p_notes, terms: payload.p_terms, offer_items: payload.p_items });
            }
            if (name === "share_customer_offer") {
              const offer = store.offers.find((item) => item.id === payload.p_offer_id); if (offer) offer.status = "sent";
            }
            if (name === "delete_draft_invoice") {
              store.invoices = store.invoices.filter((item) => item.id !== payload.p_invoice_id);
            }
            if (name === "delete_project") {
              store.projects = store.projects.filter((item) => item.id !== payload.p_project_id);
            }
            if (name === "delete_customer") {
              store.customers = store.customers.filter((item) => item.id !== payload.p_customer_id);
            }
            if (name === "delete_assistant_thread") window.__deletedAssistantThread = payload.p_thread_id;
            return result(null);
          },
          functions: {
            invoke: async (name, { body }) => {
              if (name === "offer-send") window.__lastOfferEmail = body;
              if (name === "assistant-chat") {
                window.__lastAssistantRequest = body;
                window.__assistantRequests = [...(window.__assistantRequests || []), body];
                if (Number(store.assistantFailures || 0) > 0) {
                  store.assistantFailures -= 1;
                  const status = Number(store.assistantFailureStatus || 404);
                  return { data: null, error: { context: { status, json: async () => ({ error: status === 404 ? "Chat nicht gefunden." : "KI-Dienst ist vorübergehend nicht erreichbar." }) } } };
                }
                const sendProposal = /\\bsend(?:e|en)\\b/.test(String(body.message || "").toLowerCase());
                const unknownTaxProposal = String(body.message || "").includes("__unknown_tax__");
                const xssProposal = String(body.message || "").includes("__xss__");
                const proposals = xssProposal
                  ? [{ id: "proposal-xss", kind: "customer", label: '<img src=x onerror="window.__assistantXss=1">', payload: { company: '<script>window.__assistantXss=1</script>', contact_name: "Test" } }]
                  : sendProposal
                  ? [{ id: "proposal-send", kind: "send_invoice", label: "HEAV-2026-001 senden", payload: { invoice_id: "i1" } }]
                  : unknownTaxProposal
                    ? [{ id: "proposal-invoice", kind: "invoice", label: "Rechnung prüfen", payload: { customer_id: "c1", items: [{ description: "Produktion", quantity: 1, unit_price_rappen: 100000 }] } }]
                    : [{ id: "proposal-customer", kind: "customer", label: "Nordstern GmbH anlegen", payload: { company: "Nordstern GmbH", contact_name: "Mila Stern", email: "mila@nordstern.example", phone: "+41 79 555 44 33", address_line1: "Sternweg 8", postal_code: "8004", city: "Zürich", country: "Schweiz" } }];
                return { data: {
                  threadId: body.threadId,
                  message: xssProposal ? '<img src=x onerror="window.__assistantXss=1">' : sendProposal ? "Ich habe die Rechnung gefunden. Prüfe den Versand." : unknownTaxProposal ? "Ich habe einen Rechnungsentwurf vorbereitet." : "Ich habe die Kundendaten als Entwurf vorbereitet.",
                  proposals,
                }, error: null };
              }
              return { data: { recipient: "anna@nordlicht.example" }, error: null };
            }
          }
        };
      }`,
    });
  });
}

async function setDeterministicScrollPosition(page, preferredY = 320) {
  await expect(page.locator('#admin-shell')).toBeVisible();
  await page.waitForFunction(() => document.documentElement.scrollHeight > innerHeight);
  const targetY = await page.evaluate((requestedY) => {
    document.documentElement.style.scrollBehavior = 'auto';
    document.body.style.scrollBehavior = 'auto';
    const maxY = document.documentElement.scrollHeight - innerHeight;
    const boundedY = Math.max(1, Math.min(requestedY, maxY));
    window.scrollTo(0, boundedY);
    return boundedY;
  }, preferredY);
  await page.waitForFunction((expectedY) => window.scrollY === expectedY, targetY);
  return targetY;
}

test("Workspace: Privatkunden bleiben in Projekten und Rechnungen erkennbar", async ({ page }) => {
  const customer = { id: 'c-private', company: '', contact_name: 'Noah Frei' };
  await mockStudioSupabase(page, {
    customers: [customer],
    projects: [{ id: 'p-private', customer_id: customer.id, customer, title: 'Privates Shooting', status: 'active' }],
    invoices: [{ id: 'i-private', customer_id: customer.id, customer, invoice_number: 'PRIVATE-001', status: 'draft', total_rappen: 10000, invoice_items: [] }],
    offers: []
  });
  await page.goto(`${base}/studio/`);
  for (const view of ['projects', 'invoices']) {
    await page.locator(`.nav-link[data-view="${view}"]`).click();
    await expect(page.locator('.data-table tbody tr')).toContainText('Noah Frei');
    await expect(page.locator('.mobile-card-list')).toContainText('Noah Frei');
    await expect(page.locator('#app-content')).not.toContainText('Ohne Kunde');
  }
});

test("Workspace: mobile HEAV menu replaces duplicate bottom navigation and traps focus", async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 360, height: 800 }, isMobile: true, hasTouch: true });
  await mockStudioSupabase(page);
  await page.goto(`${base}/studio/`);
  await expect(page.locator('#admin-shell')).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Hauptnavigation' })).toBeHidden();
  const trigger = page.getByRole('button', { name: 'Menü öffnen' });
  await expect(trigger).toBeVisible();
  await expect(trigger).toContainText('Menü');
  expect((await trigger.boundingBox()).height).toBeGreaterThanOrEqual(44);
  await trigger.click();
  const sidebar = page.locator('#sidebar');
  await expect(sidebar).toBeVisible();
  await expect(sidebar).toHaveAttribute('role', 'dialog');
  await expect(sidebar).toHaveAttribute('aria-modal', 'true');
  await expect(page.locator('.workspace')).toHaveAttribute('inert', '');
  await expect(sidebar).toHaveCSS('background-color', 'rgb(232, 228, 220)');
  await page.waitForTimeout(700);
  const menuGeometry = await sidebar.evaluate((element) => {
    const box = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return { left: box.left, top: box.top, width: box.width, height: box.height, background: style.backgroundColor };
  });
  expect(menuGeometry).toEqual({ left: 0, top: 0, width: 360, height: 800, background: 'rgb(232, 228, 220)' });
  const nav = page.getByRole('navigation', { name: 'Studio Navigation' });
  const active = nav.getByRole('button', { name: 'Übersicht', exact: true });
  await expect(active).toBeFocused();
  const activeStyle = await active.evaluate((element) => ({
    color: getComputedStyle(element).color,
    radius: getComputedStyle(element).borderRadius,
    fontSize: parseFloat(getComputedStyle(element).fontSize),
    labelFontSize: parseFloat(getComputedStyle(element.querySelector('.nav-label')).fontSize),
  }));
  expect(activeStyle.color).toBe('rgb(9, 10, 8)');
  expect(activeStyle.radius).toBe('0px');
  expect(activeStyle.fontSize).toBeGreaterThanOrEqual(32);
  expect(activeStyle.labelFontSize).toBeGreaterThanOrEqual(32);
  const indicatorAlignment = await nav.evaluate((element) => {
    const indicator = element.querySelector('.nav-active-indicator');
    const label = element.querySelector('.nav-link.is-active .nav-label');
    return { indicatorWidth: indicator.getBoundingClientRect().width, labelWidth: label.getBoundingClientRect().width };
  });
  expect(Math.abs(indicatorAlignment.indicatorWidth - indicatorAlignment.labelWidth)).toBeLessThanOrEqual(1);
  await page.keyboard.press('Escape');
  await expect(sidebar).toHaveCSS('visibility', 'hidden');
  await expect(trigger).toBeFocused();
  await assertHealthy(page, []);
  await page.close();
});

test("Workspace: mobile HEAV menu locks background scroll and restores the exact position", async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 390, height: 640 }, isMobile: true, hasTouch: true });
  await mockStudioSupabase(page);
  await page.goto(`${base}/studio/`);
  const targetY = await setDeterministicScrollPosition(page);
  const initialScrollY = await page.evaluate(() => window.scrollY);
  expect(initialScrollY).toBe(targetY);

  await page.getByRole('button', { name: 'Menü öffnen' }).click();
  const locked = await page.evaluate(() => ({
    htmlOverflow: getComputedStyle(document.documentElement).overflow,
    bodyOverflow: getComputedStyle(document.body).overflow,
    sidebarOverscroll: getComputedStyle(document.querySelector('#sidebar')).overscrollBehaviorY,
    scrollY: window.scrollY,
  }));
  expect(locked).toEqual({
    htmlOverflow: 'hidden',
    bodyOverflow: 'hidden',
    sidebarOverscroll: 'contain',
    scrollY: initialScrollY,
  });

  await page.mouse.wheel(0, 900);
  await page.waitForTimeout(100);
  expect(await page.evaluate(() => window.scrollY)).toBe(initialScrollY);

  await page.getByRole('button', { name: 'Menü schliessen' }).click();
  await expect(page.locator('#sidebar')).toHaveCSS('visibility', 'hidden');
  expect(await page.evaluate(() => window.scrollY)).toBe(initialScrollY);
  await page.close();
});

test("Workspace: mobile menu keeps its original scroll lock through closing, reopen, and completed exit", async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 390, height: 640 }, isMobile: true, hasTouch: true });
  await mockStudioSupabase(page);
  await page.goto(`${base}/studio/`);
  const originalScrollY = await setDeterministicScrollPosition(page, 280);
  const shell = page.locator('#admin-shell');
  const sidebar = page.locator('#sidebar');
  const trigger = page.getByRole('button', { name: 'Menü öffnen' });

  await trigger.click();
  await page.getByRole('button', { name: 'Menü schliessen' }).click();
  await expect(shell).toHaveClass(/nav-closing/);
  await expect(page.locator('html')).toHaveClass(/nav-scroll-locked/);
  await expect(page.locator('body')).toHaveClass(/nav-scroll-locked/);
  await page.mouse.wheel(0, 900);
  await page.waitForTimeout(100);
  expect(await page.evaluate(() => window.scrollY)).toBe(originalScrollY);

  await trigger.click();
  await expect(shell).toHaveClass(/nav-open/);
  await expect(shell).not.toHaveClass(/nav-closing/);
  await expect(page.locator('html')).toHaveClass(/nav-scroll-locked/);
  expect(await page.evaluate(() => window.scrollY)).toBe(originalScrollY);

  await page.getByRole('button', { name: 'Menü schliessen' }).click();
  await expect(shell).toHaveClass(/nav-closing/);
  await page.mouse.wheel(0, 900);
  await page.waitForTimeout(100);
  expect(await page.evaluate(() => window.scrollY)).toBe(originalScrollY);
  await expect(sidebar).toHaveCSS('visibility', 'hidden', { timeout: 1500 });
  await expect(shell).not.toHaveClass(/nav-closing/);
  await expect(page.locator('html')).not.toHaveClass(/nav-scroll-locked/);
  await expect(page.locator('body')).not.toHaveClass(/nav-scroll-locked/);
  expect(await page.evaluate(() => window.scrollY)).toBe(originalScrollY);
  await page.close();
});

test("Workspace: crossing to desktop normalizes an open mobile menu", async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await mockStudioSupabase(page);
  await page.goto(`${base}/studio/`);
  await page.getByRole('button', { name: 'Menü öffnen' }).click();
  const sidebar = page.locator('#sidebar');
  const close = page.getByRole('button', { name: 'Menü schliessen' });
  await expect(sidebar.locator('.nav-link.is-active')).toBeFocused();
  await close.focus();
  await expect(close).toBeFocused();

  await page.setViewportSize({ width: 900, height: 844 });
  await expect(page.locator('#admin-shell')).not.toHaveClass(/nav-open|nav-closing/);
  await expect(page.locator('.workspace')).not.toHaveAttribute('inert', '');
  await expect(sidebar).not.toHaveAttribute('role', 'dialog');
  await expect(sidebar).not.toHaveAttribute('aria-modal', 'true');
  const desktopTrigger = page.locator('[data-open-nav]');
  await expect(desktopTrigger).toHaveAttribute('aria-expanded', 'false');
  await expect(desktopTrigger).toBeHidden();
  await expect(close).toBeHidden();
  await expect(sidebar.locator('.nav-link.is-active')).toBeFocused();
  await page.close();
});

test("Workspace: crossing to desktop during mobile menu closing cancels finalization and restores the exact scroll position", async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 390, height: 640 }, isMobile: true, hasTouch: true });
  await mockStudioSupabase(page);
  await page.goto(`${base}/studio/`);
  const originalScrollY = await setDeterministicScrollPosition(page, 240);
  const shell = page.locator('#admin-shell');
  const sidebar = page.locator('#sidebar');

  await page.getByRole('button', { name: 'Menü öffnen' }).click();
  await page.getByRole('button', { name: 'Menü schliessen' }).click();
  await expect(shell).toHaveClass(/nav-closing/);
  await expect(sidebar).toHaveAttribute('inert', '');
  await expect(page.locator('html')).toHaveClass(/nav-scroll-locked/);

  await page.setViewportSize({ width: 900, height: 640 });
  await expect(shell).not.toHaveClass(/nav-open|nav-closing/);
  await expect(page.locator('.workspace')).not.toHaveAttribute('inert', '');
  await expect(sidebar).not.toHaveAttribute('inert', '');
  await expect(sidebar).not.toHaveAttribute('aria-hidden', 'true');
  await expect(sidebar).not.toHaveAttribute('role', 'dialog');
  await expect(page.locator('html')).not.toHaveClass(/nav-scroll-locked/);
  await expect(page.locator('body')).not.toHaveClass(/nav-scroll-locked/);
  expect(await page.evaluate(() => window.scrollY)).toBe(originalScrollY);
  await page.waitForTimeout(700);
  await expect(shell).not.toHaveClass(/nav-open|nav-closing/);
  expect(await page.evaluate(() => window.scrollY)).toBe(originalScrollY);
  await expect(sidebar.locator('.nav-link.is-active')).toBeFocused();
  await page.close();
});

test("Workspace: mobile menu exit keeps the departing sidebar out of keyboard and accessibility navigation", async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await mockStudioSupabase(page);
  await page.goto(`${base}/studio/`);
  const shell = page.locator('#admin-shell');
  const sidebar = page.locator('#sidebar');
  const trigger = page.getByRole('button', { name: 'Menü öffnen' });

  await trigger.click();
  await expect(sidebar.locator('.nav-link.is-active')).toBeFocused();
  await page.getByRole('button', { name: 'Menü schliessen' }).click();
  await expect(shell).toHaveClass(/nav-closing/);
  await expect(shell).not.toHaveClass(/nav-open/);
  await expect(sidebar).toHaveCSS('visibility', 'visible');
  await expect(sidebar).toHaveCSS('pointer-events', 'none');
  await expect(sidebar).toHaveAttribute('inert', '');
  await expect(sidebar).toHaveAttribute('aria-hidden', 'true');
  await expect(sidebar).not.toHaveAttribute('aria-modal', 'true');
  await expect(page.locator('.workspace')).not.toHaveAttribute('inert', '');
  await expect(trigger).toBeFocused();

  await page.keyboard.press('Shift+Tab');
  expect(await sidebar.evaluate((element) => element.contains(document.activeElement))).toBe(false);
  await trigger.focus();
  await page.keyboard.press('Tab');
  expect(await sidebar.evaluate((element) => element.contains(document.activeElement))).toBe(false);

  await trigger.click();
  await expect(shell).toHaveClass(/nav-open/);
  await expect(shell).not.toHaveClass(/nav-closing/);
  await expect(sidebar).toHaveCSS('pointer-events', 'auto');
  await expect(sidebar).toHaveAttribute('aria-modal', 'true');

  await page.getByRole('button', { name: 'Menü schliessen' }).click();
  await expect(shell).toHaveClass(/nav-closing/);
  await page.waitForTimeout(700);
  await expect(shell).not.toHaveClass(/nav-closing/);
  await expect(sidebar).toHaveCSS('visibility', 'hidden');
  await trigger.click();
  await expect(shell).toHaveClass(/nav-open/);
  await page.close();
});

test("Workspace: entering mobile hides and deactivates the desktop sidebar atomically", async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
  await mockStudioSupabase(page);
  await page.goto(`${base}/studio/`);
  const sidebar = page.locator('#sidebar');
  await expect(page.locator('#admin-shell')).toBeVisible();
  await sidebar.locator('.nav-link.is-active').focus();

  await page.setViewportSize({ width: 390, height: 700 });
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
  const state = await page.evaluate(() => {
    const panel = document.querySelector('#sidebar');
    const bounds = panel.getBoundingClientRect();
    return {
      visibility: getComputedStyle(panel).visibility,
      bottom: Math.round(bounds.bottom),
      inert: panel.inert,
      ariaHidden: panel.getAttribute('aria-hidden'),
      activeInside: panel.contains(document.activeElement),
    };
  });
  expect(state).toEqual({
    visibility: 'hidden',
    bottom: -14,
    inert: true,
    ariaHidden: 'true',
    activeInside: false,
  });
  await expect(page.getByRole('button', { name: 'Menü öffnen' })).toBeFocused();
  await page.close();
});

test("Workspace: mobile HEAV menu opens without motion when reduced motion is requested", async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await mockStudioSupabase(page);
  await page.goto(`${base}/studio/`);
  const trigger = page.getByRole('button', { name: 'Menü öffnen' });
  await trigger.click();
  const sidebar = page.locator('#sidebar');
  await expect(sidebar).toBeVisible();
  await expect(sidebar).toHaveCSS('transition-duration', '0s');
  await expect(sidebar.getByRole('button', { name: 'Übersicht', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(sidebar).toHaveCSS('visibility', 'hidden');
  await expect(trigger).toBeFocused();
  await page.close();
});

test("Workspace: finance navigation uses one stable HEAV line state instead of a focus pill", async ({ page }) => {
  await mockStudioSupabase(page);
  await page.goto(`${base}/studio/`);
  await page.locator('.nav-link[data-view="invoices"]').click();
  const active = page.getByRole('navigation', { name: 'Finanzen' }).getByRole('button', { name: 'Rechnungen', exact: true });
  await expect(active).toHaveAttribute('aria-current', 'page');
  const state = await active.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      background: style.backgroundColor,
      color: style.color,
      radius: style.borderRadius,
      borderBottomWidth: style.borderBottomWidth,
      outline: style.outlineStyle,
    };
  });
  expect(state).toEqual({
    background: 'rgba(0, 0, 0, 0)',
    color: 'rgb(240, 240, 240)',
    radius: '0px',
    borderBottomWidth: '0px',
    outline: 'none',
  });
  const surface = await page.evaluate(() => {
    const toolbar = getComputedStyle(document.querySelector('.toolbar'));
    const table = getComputedStyle(document.querySelector('.data-table'));
    const selectedNav = document.querySelector('.nav-link.is-active');
    const nav = getComputedStyle(selectedNav);
    const marker = getComputedStyle(document.querySelector('.nav-active-indicator'));
    const financeMarker = getComputedStyle(document.querySelector('.finance-nav-indicator'));
    return {
      toolbarRadius: toolbar.borderRadius,
      toolbarSides: [toolbar.borderLeftWidth, toolbar.borderRightWidth],
      tableRadius: table.borderRadius,
      navBackground: nav.backgroundColor,
      navRadius: nav.borderRadius,
      navMarker: [marker.height, marker.backgroundColor, marker.transitionDuration],
      financeMarker: [financeMarker.height, financeMarker.backgroundColor, financeMarker.transitionDuration],
    };
  });
  expect(surface).toEqual({
    toolbarRadius: '0px',
    toolbarSides: ['0px', '0px'],
    tableRadius: '0px',
    navBackground: 'rgba(0, 0, 0, 0)',
    navRadius: '0px',
    navMarker: ['1px', 'rgb(232, 228, 220)', '0.36s, 0.36s'],
    financeMarker: ['1px', 'rgb(232, 228, 220)', '0.36s, 0.36s'],
  });
});

test("Workspace: invoices default to newest creation and support sent and due sorting", async ({ page }) => {
  const customer = { id: 'c1', company: 'Nordlicht AG', contact_name: 'Anna Keller' };
  const invoice = (id, invoice_number, status, created_at, sent_at, due_date) => ({
    id, invoice_number, status, created_at, sent_at, due_date,
    customer_id: customer.id,
    customer,
    issue_date: created_at.slice(0, 10),
    total_rappen: 10000,
    payment_reference: `RF-${id}`,
    invoice_items: [],
  });
  await mockStudioSupabase(page, {
    customers: [customer],
    projects: [],
    invoices: [
      invoice('a', 'INV-OLDEST', 'sent', '2026-09-01T08:00:00Z', '2026-09-12T08:00:00Z', '2026-09-20'),
      invoice('b', 'INV-NEWEST', 'draft', '2026-09-10T08:00:00Z', null, '2026-09-30'),
      invoice('c', 'INV-URGENT', 'overdue', '2026-09-05T08:00:00Z', '2026-09-10T08:00:00Z', '2026-09-16'),
      invoice('d', 'INV-PAID', 'paid', '2026-09-06T08:00:00Z', '2026-09-11T08:00:00Z', '2026-09-14'),
      invoice('e', 'INV-NO-DUE', 'sent', '2026-08-01T08:00:00Z', '2026-08-02T08:00:00Z', null),
    ],
    offers: [],
  });
  await page.goto(`${base}/studio/`);
  await page.locator('.nav-link[data-view="invoices"]').click();
  const numbers = page.locator('.data-table tbody tr > td:first-child > strong');
  const sort = page.getByRole('combobox', { name: 'Rechnungen sortieren' });
  await expect(sort).toHaveValue('created_desc');
  await expect(numbers).toHaveText(['INV-NEWEST', 'INV-PAID', 'INV-URGENT', 'INV-OLDEST', 'INV-NO-DUE']);

  await sort.selectOption('sent_desc');
  await expect(numbers).toHaveText(['INV-OLDEST', 'INV-PAID', 'INV-URGENT', 'INV-NO-DUE', 'INV-NEWEST']);

  await sort.selectOption('due_asc');
  await expect(numbers).toHaveText(['INV-URGENT', 'INV-OLDEST', 'INV-NO-DUE', 'INV-PAID', 'INV-NEWEST']);
});

test("Workspace: invoice row actions reveal on hover or click and close accessibly", async ({ page }) => {
  await mockStudioSupabase(page);
  await page.goto(`${base}/studio/`);
  await page.locator('.nav-link[data-view="invoices"]').click();
  const row = page.locator('.data-table tbody [data-invoice-record]').filter({ hasText: 'HEAV-2026-002' });
  const reveal = row.locator('[data-invoice-actions]');
  const trigger = reveal.getByRole('button', { name: /Aktionen für HEAV-2026-002/ });
  const panel = reveal.locator('.invoice-actions-panel');
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await expect(panel).toHaveAttribute('aria-hidden', 'true');
  await expect(panel).toHaveAttribute('inert', '');

  await row.hover();
  await expect(panel).toHaveAttribute('aria-hidden', 'false');
  await expect(panel).not.toHaveAttribute('inert', '');
  await expect(panel).toHaveCSS('opacity', '1');
  const actionClearance = await row.evaluate((element) => {
    const total = element.querySelector('td:nth-child(4)').getBoundingClientRect();
    const actions = element.querySelector('.invoice-actions-panel').getBoundingClientRect();
    return actions.left - total.right;
  });
  expect(actionClearance).toBeGreaterThanOrEqual(0);

  await page.mouse.move(1, 1);
  await expect(panel).toHaveAttribute('aria-hidden', 'true');
  await trigger.click();
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await expect(panel).toHaveAttribute('aria-hidden', 'false');
  await page.keyboard.press('Escape');
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await expect(trigger).toBeFocused();
});

test("Workspace: mobile invoice actions stay collapsed until a deliberate tap", async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await mockStudioSupabase(page);
  await page.goto(`${base}/studio/`);
  await page.getByRole('button', { name: 'Menü öffnen' }).click();
  await page.locator('.nav-link[data-view="invoices"]').click();
  await expect(page.locator('#sidebar')).toHaveCSS('visibility', 'hidden');

  const card = page.locator('.invoice-card').first();
  const trigger = card.getByRole('button', { name: /Aktionen für/ });
  const panel = card.locator('.invoice-actions-panel');
  const actionPanelIds = await page.locator('[id^="invoice-actions-"]').evaluateAll((panels) => panels.map((item) => item.id));
  expect(new Set(actionPanelIds).size).toBe(actionPanelIds.length);
  const controlledPanelId = await trigger.getAttribute('aria-controls');
  await expect(panel).toHaveAttribute('id', controlledPanelId);
  await expect(page.locator(`#${controlledPanelId}`)).toHaveCount(1);
  await expect(panel).toHaveAttribute('aria-hidden', 'true');
  expect((await trigger.boundingBox()).height).toBeGreaterThanOrEqual(44);
  await trigger.click();
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await expect(panel).toHaveAttribute('aria-hidden', 'false');
  const targets = await panel.locator('button').evaluateAll((buttons) => buttons.map((button) => {
    const box = button.getBoundingClientRect();
    return { width: box.width, height: box.height };
  }));
  expect(targets.every(({ width, height }) => width >= 44 && height >= 44)).toBe(true);
  await assertHealthy(page, []);
  await page.close();
});

test("Workspace: menu and finance indicators slide without replacing their track", async ({ page }) => {
  await mockStudioSupabase(page);
  await page.goto(`${base}/studio/`);
  const menuIndicator = page.locator('.nav-active-indicator');
  const menuBefore = await menuIndicator.evaluate((element) => element.style.transform);
  await page.locator('.nav-link[data-view="customers"]').click();
  const menuAfter = await menuIndicator.evaluate((element) => element.style.transform);
  expect(menuAfter).not.toBe(menuBefore);
  const menuTransitionDurations = await menuIndicator.evaluate((element) => getComputedStyle(element).transitionDuration.split(',').map((value) => value.trim()));
  expect(menuTransitionDurations).toEqual(['0.36s', '0.36s']);

  await page.locator('.nav-link[data-view="invoices"]').click();
  const finance = page.getByRole('navigation', { name: 'Finanzen' });
  await finance.evaluate((element) => { element.dataset.trackInstance = 'preserved'; });
  const indicator = finance.locator('.finance-nav-indicator');
  const financeBefore = await indicator.evaluate((element) => element.style.transform);
  await finance.getByRole('button', { name: 'Offerten', exact: true }).click();
  await expect(finance).toHaveAttribute('data-track-instance', 'preserved');
  const financeAfter = await indicator.evaluate((element) => element.style.transform);
  expect(financeAfter).not.toBe(financeBefore);
  const financeTransitionDurations = await indicator.evaluate((element) => getComputedStyle(element).transitionDuration.split(',').map((value) => value.trim()));
  expect(financeTransitionDurations).toEqual(['0.36s', '0.36s']);
});

test("Workspace: invoice editor uses one harmonious rounded geometry", async ({ page }) => {
  await mockStudioSupabase(page);
  await page.goto(`${base}/studio/`);
  await page.getByRole('button', { name: 'Neue Rechnung' }).click();
  const dialog = page.locator('#editor-dialog');
  await expect(dialog).toBeVisible();
  const corners = await dialog.evaluate((element) => {
    const style = getComputedStyle(element);
    return [style.borderTopLeftRadius, style.borderTopRightRadius, style.borderBottomRightRadius, style.borderBottomLeftRadius];
  });
  expect(corners).toEqual(['18px', '18px', '18px', '18px']);
  await expect(dialog.locator('.invoice-item').first()).toHaveCSS('border-radius', '12px');
  await expect(dialog.locator('.form-field input').first()).toHaveCSS('border-radius', '12px');
});

test("Workspace: invoice search and sorting controls share one utility radius", async ({ page }) => {
  await mockStudioSupabase(page);
  await page.goto(`${base}/admin/`);
  await page.locator('.nav-link[data-view="invoices"]').click();
  const radii = await page.locator('.invoice-toolbar').evaluate((toolbar) => ({
    search: getComputedStyle(toolbar.querySelector('.search-field input')).borderRadius,
    sort: getComputedStyle(toolbar.querySelector('[data-invoice-sort]')).borderRadius,
  }));
  expect(radii).toEqual({ search: '12px', sort: '12px' });
});

test("Workspace: desktop topbar, finance nav and content share one left gutter", async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await mockStudioSupabase(page);
  await page.goto(`${base}/studio/`);
  await page.locator('.nav-link[data-view="invoices"]').click();
  const gutters = await page.evaluate(() => {
    const left = (selector) => document.querySelector(selector).getBoundingClientRect().left;
    const padding = (selector) => parseFloat(getComputedStyle(document.querySelector(selector)).paddingLeft);
    return {
      topbarContentLeft: left('.topbar > div'),
      financeContentLeft: left('.finance-nav button'),
      viewContentLeft: left('.view') + padding('.view'),
      topbarPadding: padding('.topbar'),
      financePadding: padding('.finance-nav'),
      viewPadding: padding('.view'),
    };
  });
  expect(gutters).toEqual({
    topbarContentLeft: 278,
    financeContentLeft: 278,
    viewContentLeft: 278,
    topbarPadding: 48,
    financePadding: 48,
    viewPadding: 48,
  });
  await page.close();
});

test("Workspace: route changes use the restrained HEAV entrance motion", async ({ page }) => {
  await mockStudioSupabase(page);
  await page.goto(`${base}/studio/`);
  await page.locator('.nav-link[data-view="customers"]').click();
  const motion = await page.locator('.view').evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      name: style.animationName,
      duration: style.animationDuration,
      timing: style.animationTimingFunction,
      opacity: Number(style.opacity),
    };
  });
  expect(motion.name).toBe('studio-view-enter');
  expect(motion.duration).toBe('0.38s');
  expect(motion.timing).toBe('cubic-bezier(0.22, 1, 0.36, 1)');
  expect(motion.opacity).toBeGreaterThanOrEqual(0.8);
});

test("Workspace: reduced motion clears route entrance state without animationend", async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await mockStudioSupabase(page);
  await page.goto(`${base}/studio/`);
  await page.locator('.nav-link[data-view="customers"]').click();
  const content = page.locator('#app-content');
  await expect(content).not.toHaveClass(/is-view-entering/);
  await expect(page.locator('.view')).toHaveCSS('animation-name', 'none');
  expect(await page.evaluate(() => document.getAnimations().filter(animation => animation.effect?.target?.closest?.('#app-content')).length)).toBe(0);
  await page.close();
});

test("Workspace: rerendering during route motion clears the entrance state", async ({ page }) => {
  await mockStudioSupabase(page);
  await page.goto(`${base}/studio/`);
  await page.locator('.nav-link[data-view="customers"]').click();
  const content = page.locator('#app-content');
  await expect(content).toHaveClass(/is-view-entering/);
  await page.locator('[data-search]').fill('Nord');
  await expect(content).not.toHaveClass(/is-view-entering/);
  await expect(page.locator('.view')).toHaveCSS('animation-name', 'none');
});

test("HEAV Assistent: Screenshot und Chat erzeugen nur prüfbare Entwürfe", async ({ page }) => {
  await mockStudioSupabase(page);
  const invoiceRequests = [];
  page.on("request", (request) => {
    if (request.url().includes("/functions/v1/invoice-document") && request.method() === "POST") invoiceRequests.push(request.postDataJSON());
  });
  await page.goto(`${base}/studio/`);

  await page.getByRole("button", { name: "HEAV Assistent öffnen" }).click();
  const assistant = page.locator("#assistant-dialog");
  await expect(assistant).toBeVisible();
  await expect(assistant.getByRole("heading", { name: "HEAV Assistent" })).toBeVisible();
  await assistant.locator('input[type="file"]').setInputFiles({
    name: "kundendaten.png",
    mimeType: "image/png",
    buffer: await readFile(new URL("../../qa/workspace-dashboard-390.png", import.meta.url)),
  });
  await expect(assistant).toContainText("kundendaten.png");
  await assistant.getByLabel("Nachricht an HEAV Assistent").fill("Erstelle aus diesem Screenshot einen Kundenentwurf.");
  await assistant.getByRole("button", { name: "Senden", exact: true }).click();
  await expect(assistant).toContainText("Kundendaten als Entwurf vorbereitet");
  await page.screenshot({ path: "qa/admin-assistant-desktop.png" });
  const request = await page.evaluate(() => window.__lastAssistantRequest);
  expect(request.message).toContain("Kundenentwurf");
  expect(request.image.dataUrl).toMatch(/^data:image\/webp;base64,/);
  expect(request.image.mimeType).toBe("image/webp");

  await assistant.getByRole("button", { name: "Kundenentwurf prüfen" }).click();
  await expect(assistant).toBeHidden();
  const editor = page.locator("#editor-dialog");
  await expect(editor).toBeVisible();
  await expect(editor.locator('[name="company"]')).toHaveValue("Nordstern GmbH");
  await expect(editor.locator('[name="contact_name"]')).toHaveValue("Mila Stern");
  await expect(editor.locator('[name="email"]')).toHaveValue("mila@nordstern.example");
  await editor.getByRole("button", { name: "Abbrechen" }).click();

  await page.getByRole("button", { name: "HEAV Assistent öffnen" }).click();
  await assistant.getByLabel("Nachricht an HEAV Assistent").fill("Sende die Rechnung HEAV-2026-001.");
  await assistant.getByRole("button", { name: "Senden", exact: true }).click();
  await assistant.getByRole("button", { name: "Versand prüfen" }).click();
  await expect(page.locator("#action-confirm-dialog")).toContainText("HEAV-2026-001");
  await expect(page.locator("#action-confirm-dialog")).toContainText("anna@nordlicht.example");
  await page.locator("#action-confirm-dialog").getByRole("button", { name: "Abbrechen" }).click();
  expect(invoiceRequests).toEqual([]);
});

test("HEAV Assistent: unbekannte MWST übernimmt den geprüften Studio-Standard statt null als null Prozent", async ({ page }) => {
  await mockStudioSupabase(page, {
    company_settings: [{ company_name: "HEAV", owner_name: "Michias Tegegne", email: "hello@heav.ch", iban: "", vat_number: "CHE-123.456.789 MWST", default_tax_rate: 8.1, default_due_days: 30 }],
  });
  await page.goto(`${base}/studio/`);
  await page.getByRole("button", { name: "HEAV Assistent öffnen" }).click();
  const assistant = page.locator("#assistant-dialog");
  await assistant.getByLabel("Nachricht an HEAV Assistent").fill("__unknown_tax__");
  await assistant.getByRole("button", { name: "Senden", exact: true }).click();
  await assistant.getByRole("button", { name: "Rechnungsentwurf prüfen" }).click();
  await expect(page.locator("#editor-dialog")).toBeVisible();
  await expect(page.locator('#editor-dialog [name="tax_rate"]')).toHaveValue("8.1");
});

test("HEAV Assistent: Modelltexte, Vorschläge und Dateinamen bleiben als Text XSS-sicher", async ({ page }) => {
  await mockStudioSupabase(page);
  await page.goto(`${base}/studio/`);
  await page.getByRole("button", { name: "HEAV Assistent öffnen" }).click();
  const assistant = page.locator("#assistant-dialog");
  await assistant.locator('input[type="file"]').setInputFiles({
    name: '<img src=x onerror="window.__assistantXss=1">.png',
    mimeType: "image/png",
    buffer: await readFile(new URL("../../qa/workspace-dashboard-390.png", import.meta.url)),
  });
  await assistant.getByLabel("Nachricht an HEAV Assistent").fill("__xss__");
  await assistant.getByRole("button", { name: "Senden", exact: true }).click();
  await expect(assistant).toContainText('<img src=x onerror="window.__assistantXss=1">');
  await expect(assistant.locator('img[src="x"], script')).toHaveCount(0);
  expect(await page.evaluate(() => window.__assistantXss)).toBeUndefined();
  await assistant.getByRole("button", { name: "Kundenentwurf prüfen" }).click();
  await expect(page.locator('#editor-dialog [name="company"]')).toHaveValue("<script>window.__assistantXss=1</script>");
  await expect(page.locator("#editor-dialog script")).toHaveCount(0);
  expect(await page.evaluate(() => window.__assistantXss)).toBeUndefined();
});

test("HEAV Assistent: bleibt ohne aktivierte API aus der Studio-Oberfläche verborgen", async ({ page }) => {
  await mockStudioSupabase(page);
  await page.goto(`${base}/studio/`);
  await page.evaluate(() => document.documentElement.setAttribute("data-assistant-enabled", "false"));
  await expect(page.getByRole("button", { name: "HEAV Assistent öffnen" })).toBeHidden();
  await expect(page.locator("#assistant-dialog")).toBeHidden();
});

test("HEAV Assistent: bleibt bei 390px vollständig bedienbar", async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await mockStudioSupabase(page);
  await page.goto(`${base}/studio/`);
  await page.getByRole("button", { name: "HEAV Assistent öffnen" }).click();
  const assistant = page.locator("#assistant-dialog");
  const bounds = await assistant.boundingBox();
  expect(bounds.x).toBe(0);
  expect(bounds.y).toBe(0);
  expect(bounds.width).toBe(390);
  expect(bounds.height).toBe(844);
  const controls = await assistant.locator("button,input,textarea").evaluateAll((elements) => elements.filter((element) => element.getClientRects().length).map((element) => ({ width: element.getBoundingClientRect().width, height: element.getBoundingClientRect().height })));
  expect(controls.every((control) => control.width >= 44 && control.height >= 44)).toBe(true);
  const visual = await assistant.evaluate((dialog) => {
    const textarea = getComputedStyle(dialog.querySelector("textarea"));
    const privacy = getComputedStyle(dialog.querySelector(".assistant-privacy"));
    return { boxShadow: textarea.boxShadow, outlineWidth: parseFloat(textarea.outlineWidth), privacySize: parseFloat(privacy.fontSize) };
  });
  expect(visual.boxShadow).toBe("none");
  expect(visual.outlineWidth).toBeLessThanOrEqual(2);
  expect(visual.privacySize).toBeGreaterThanOrEqual(10);
  await page.screenshot({ path: "qa/admin-assistant-mobile.png" });
  await assertHealthy(page, []);
  await page.close();
});

test("HEAV Assistent: ein Chat wird auf Mobile nur nach Bestätigung vollständig gelöscht", async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await mockStudioSupabase(page);
  await page.goto(`${base}/studio/`);
  await page.getByRole("button", { name: "HEAV Assistent öffnen" }).click();
  const assistant = page.locator("#assistant-dialog");
  await assistant.getByLabel("Nachricht an HEAV Assistent").fill("Plane ein Kundenprofil.");
  await assistant.getByRole("button", { name: "Senden", exact: true }).click();
  await expect(assistant.getByRole("button", { name: "Chat löschen" })).toBeVisible();

  await assistant.getByRole("button", { name: "Chat löschen" }).click();
  const confirm = page.locator("#action-confirm-dialog");
  await expect(confirm).toContainText("Chatverlauf wirklich löschen?");
  await confirm.getByRole("button", { name: "Abbrechen" }).click();
  expect(await page.evaluate(() => window.__deletedAssistantThread || null)).toBeNull();

  await assistant.getByRole("button", { name: "Chat löschen" }).click();
  await confirm.getByRole("button", { name: "Löschen", exact: true }).click();
  const activeThread = await page.evaluate(() => window.__assistantRequests[0].threadId);
  await expect.poll(() => page.evaluate(() => window.__deletedAssistantThread)).toBe(activeThread);
  await expect(assistant.locator(".assistant-message")).toHaveCount(1);
  await expect(assistant).toContainText("Schick mir Kundendaten als Screenshot");
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  await page.close();
});

test("HEAV Assistent: ersetzt einen fremden oder gelöschten Chat automatisch und kontogebunden", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("heav-assistant-thread:owner-test", "90000000-0000-4000-8000-000000000099"));
  await mockStudioSupabase(page, { assistantFailures: 1, assistantFailureStatus: 404 });
  await page.goto(`${base}/studio/`);
  await page.getByRole("button", { name: "HEAV Assistent öffnen" }).click();
  const assistant = page.locator("#assistant-dialog");
  await assistant.getByLabel("Nachricht an HEAV Assistent").fill("Plane ein neues Projekt.");
  await assistant.getByRole("button", { name: "Senden", exact: true }).click();
  await expect(assistant).toContainText("Kundendaten als Entwurf vorbereitet");

  const recovery = await page.evaluate(() => ({
    requests: window.__assistantRequests,
    scoped: localStorage.getItem("heav-assistant-thread:owner-test"),
    legacy: localStorage.getItem("heav-assistant-thread"),
  }));
  expect(recovery.requests).toHaveLength(2);
  expect(recovery.requests[0]).toMatchObject({ threadId: "90000000-0000-4000-8000-000000000099", newThread: false });
  expect(recovery.requests[1].newThread).toBe(true);
  expect(recovery.requests[1].threadId).not.toBe(recovery.requests[0].threadId);
  expect(recovery.scoped).toBe(recovery.requests[1].threadId);
  expect(recovery.legacy).toBeNull();
});

test("HEAV Assistent: ein Providerfehler lässt den neuen Chat löschbar statt verwaist zurück", async ({ page }) => {
  await mockStudioSupabase(page, { assistantFailures: 1, assistantFailureStatus: 502 });
  await page.goto(`${base}/studio/`);
  await page.getByRole("button", { name: "HEAV Assistent öffnen" }).click();
  const assistant = page.locator("#assistant-dialog");
  await assistant.getByLabel("Nachricht an HEAV Assistent").fill("Plane ein neues Projekt.");
  await assistant.getByRole("button", { name: "Senden", exact: true }).click();
  await expect(assistant.getByRole("button", { name: "Chat löschen" })).toBeVisible();
  const retained = await page.evaluate(() => ({ request: window.__assistantRequests[0], scoped: localStorage.getItem("heav-assistant-thread:owner-test") }));
  expect(retained.request.newThread).toBe(true);
  expect(retained.scoped).toBe(retained.request.threadId);
});

test("Workspace: mobile toast uses a compact safe-area bottom offset", async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await mockStudioSupabase(page);
  await page.goto(`${base}/studio/`);
  const bottom = await page.locator('#toast').evaluate(element => getComputedStyle(element).bottom);
  expect(bottom).toBe('16px');
  await page.close();
});

for (const width of [360, 390, 768, 1440]) {
  test(`Workspace: populated routes fit ${width}px without clipped content`, async ({ browser }) => {
    const page = await browser.newPage({ viewport: { width, height: 900 }, isMobile: width < 821, hasTouch: width < 821 });
    await mockStudioSupabase(page);
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(`${base}/studio/`);
    await expect(page.getByRole('heading', { name: 'Dein Arbeitsbereich', exact: true })).toBeVisible();
    expect((await page.locator('.dashboard-intro').boundingBox()).height).toBeLessThan(100);
    await expect(page.locator('.dashboard-metrics')).toHaveCount(0);
    const navigate = async (view) => {
      if (width < 821) await page.getByRole('button', { name: 'Menü öffnen' }).click();
      await page.locator(`.nav-link[data-view="${view}"]`).click();
      if (width < 821) await expect(page.locator('.sidebar')).toHaveCSS('visibility', 'hidden');
    };
    for (const view of ['dashboard', 'projects', 'customers', 'invoices', 'offers', 'portal-requests', 'settings']) {
      if (view === 'offers') await page.getByRole('navigation', { name: 'Finanzen' }).getByRole('button', { name: 'Offerten' }).click();
      else await navigate(view);
      if (width < 821 && ['projects', 'customers', 'invoices', 'offers', 'portal-requests'].includes(view)) {
        await expect(page.locator('.mobile-card-list').first()).toBeVisible();
        expect(await page.locator('.mobile-card-list button:visible').count()).toBeGreaterThan(0);
      }
      const clipping = await page.locator('#app-content').evaluate(root => [...root.querySelectorAll('*')].filter(e => {
        if (!e.getClientRects().length || e.closest('.sr-only') || e.matches('.project-canvas,.project-canvas-track')) return false;
        const b = e.getBoundingClientRect();
        const actionScroller = e.closest('.table-actions');
        if (actionScroller) {
          const scrollerStyle = getComputedStyle(actionScroller);
          const intentionallyScrollable = ['auto', 'scroll'].includes(scrollerStyle.overflowX);
          const ownOverflow = e.clientWidth > 0 && e.scrollWidth > e.clientWidth + 2;
          if (e === actionScroller) return ownOverflow && !intentionallyScrollable;
          const scrollerBounds = actionScroller.getBoundingClientRect();
          return !intentionallyScrollable && b.width > 0 && (b.left < scrollerBounds.left - 1 || b.right > scrollerBounds.right + 1 || ownOverflow);
        }
        const panel = e.closest('.project-canvas-head,.project-module,.project-finances,.project-documents');
        if (panel) {
          const panelBounds = panel.getBoundingClientRect();
          const style = getComputedStyle(e);
          const intentionalEllipsis = style.textOverflow === 'ellipsis' || (style.overflowX === 'hidden' && style.whiteSpace === 'nowrap');
          return b.width > 0 && (b.left < panelBounds.left - 1 || b.right > panelBounds.right + 1 || (!intentionalEllipsis && e.clientWidth > 0 && e.scrollWidth > e.clientWidth + 2));
        }
        return b.width > 0 && (b.left < -1 || b.right > innerWidth + 1 || (e.clientWidth > 0 && e.scrollWidth > e.clientWidth + 2));
      }).map(e => ({ tag: e.tagName, class: e.className, text: e.textContent.slice(0, 60), width: e.clientWidth, scroll: e.scrollWidth })));
      expect(clipping, `${view} at ${width}`).toEqual([]);
      await assertStudioEditorialTheme(page);
      await assertHealthy(page, errors);
      await page.waitForFunction(() => !document.querySelector('#app-content')?.classList.contains('is-view-entering'));
      await page.screenshot({ path: `qa/workspace-${view}-${width}.png`, fullPage: true });
    }
    await page.close();
  });
}

test("Dashboard: zeigt zwölf Monate bezahlten Nettoumsatz mit echten Zahlungsdaten", async ({ page }) => {
  const now = new Date();
  const paidAt = (monthsBack, day = 12) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - monthsBack, day, 12)).toISOString();
  await mockStudioSupabase(page, { invoices: [
    { id: "paid-current", customer_id: "c1", project_id: "p1", invoice_number: "PAID-CURRENT", status: "paid", paid_at: paidAt(0), subtotal_rappen: 100000, tax_rappen: 8100, total_rappen: 108100, invoice_items: [] },
    { id: "paid-previous", customer_id: "c2", project_id: "p2", invoice_number: "PAID-PREVIOUS", status: "paid", paid_at: paidAt(1), subtotal_rappen: 25000, tax_rappen: 0, total_rappen: 25000, invoice_items: [] },
    { id: "paid-undated", customer_id: "c1", project_id: "p1", invoice_number: "PAID-UNDATED", status: "paid", paid_at: null, subtotal_rappen: 5000, tax_rappen: 0, total_rappen: 5000, invoice_items: [] },
    { id: "open", customer_id: "c1", project_id: "p1", invoice_number: "OPEN", status: "sent", due_date: "2099-12-01", subtotal_rappen: 80000, tax_rappen: 6480, total_rappen: 86480, invoice_items: [] },
  ] });

  await page.goto(`${base}/studio/`);
  const revenue = page.locator(".dashboard-revenue");
  await expect(revenue.getByRole("heading", { name: "Bezahlter Rechnungsumsatz" })).toBeVisible();
  await expect(revenue.locator("[data-revenue-month]" )).toHaveCount(12);
  await expect(revenue.locator("[data-revenue-net]")).toContainText("CHF 1’250.00");
  await expect(revenue.locator("[data-revenue-tax]")).toContainText("CHF 81.00");
  await expect(revenue.locator("[data-revenue-gross]")).toContainText("CHF 1’331.00");
  await expect(revenue.locator("[data-revenue-missing-date]")).toContainText("1 bezahlte Rechnung ohne Zahlungsdatum");
  const labels = await revenue.locator("[data-revenue-month]").evaluateAll((bars) => bars.map((bar) => bar.getAttribute("aria-label")));
  expect(labels.every(Boolean)).toBe(true);
  expect(labels.some((label) => label.includes("CHF 1’000.00"))).toBe(true);
  await expect(revenue.locator(".dashboard-revenue-empty")).toHaveCount(0);
  await assertHealthy(page, []);
});

test("Dashboard: erklärt einen echten Nullzeitraum statt eine leere Chartfläche zu zeigen", async ({ page }) => {
  await mockStudioSupabase(page);
  await page.goto(`${base}/studio/`);
  const empty = page.locator(".dashboard-revenue-empty");
  await expect(empty).toBeVisible();
  await expect(empty).toHaveText("Noch keine Zahlungen in diesem Zeitraum.");
});

test("Workspace: project documents distinguish drafts from payment and retain create context", async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true });
  await mockStudioSupabase(page, { invoices: [
    { id:'draft', customer_id:'c1', project_id:'p1', invoice_number:'DRAFT-001', status:'draft', total_rappen:10000, invoice_items:[] },
    { id:'paid', customer_id:'c1', project_id:'p1', invoice_number:'PAID-001', status:'paid', total_rappen:20000, invoice_items:[] },
    { id:'open', customer_id:'c1', project_id:'p1', invoice_number:'OPEN-001', status:'sent', total_rappen:30000, invoice_items:[] }
  ] });
  await page.goto(`${base}/studio/`);
  await expect(page.locator('.dashboard-money')).toContainText('CHF 300.00');
  await page.getByRole('button', { name: 'Projekt-Canvas öffnen' }).click();
  const canvas = page.locator('.project-canvas');
  await expect(canvas.locator('[data-project-money="paid"]')).toContainText('CHF 200.00');
  await expect(canvas.locator('[data-project-money="open"]')).toContainText('CHF 300.00');
  await expect(canvas.locator('[data-project-money="draft"]')).toContainText('CHF 100.00');
  await expect(canvas).toContainText('Vereinbarung');
  await expect(canvas).toContainText('HEAV-O-2026-001');
  await expect(canvas).toContainText('DRAFT-001');
  await canvas.getByRole('button', { name: 'Offerte per E-Mail senden' }).click();
  await expect(page.locator('#action-confirm-dialog')).toContainText('anna@nordlicht.example');
  await page.keyboard.press('Escape');
  await expect(canvas.getByRole('button', { name: 'Offerte per E-Mail senden' })).toBeFocused();
  await page.getByLabel('Projekt auswählen').selectOption('p2');
  await expect(canvas).toContainText('Campaign Content');
  for (const type of ['offer', 'invoice']) {
    const trigger = canvas.locator(`[data-create="${type}"]`);
    await trigger.click();
    await expect(page.locator('select[name="customer_id"]')).toHaveValue('c2');
    await expect(page.locator('select[name="project_id"]')).toHaveValue('p2');
    await page.keyboard.press('Escape');
    await expect(trigger).toBeFocused();
  }
  await assertHealthy(page, []);
  await page.close();
});

for (const width of [360, 390, 768, 1440]) {
  test(`Workspace: editors fit ${width}px with accessible focus and safe dismissal`, async ({ browser }) => {
    const page = await browser.newPage({ viewport: { width, height: 844 }, isMobile: width < 821, hasTouch: width < 821 });
    await mockStudioSupabase(page);
    await page.goto(`${base}/studio/`);
    const navigate = async view => {
      if (width < 821) await page.getByRole('button', { name:'Menü öffnen' }).click();
      await page.locator(`.nav-link[data-view="${view}"]`).click();
    };
    for (const [view, type] of [['customers','customer'], ['projects','project'], ['invoices','invoice'], ['offers','offer'], ['settings','settings']]) {
      if (view === 'offers') await page.getByRole('navigation', { name:'Finanzen' }).getByRole('button', { name:'Offerten' }).click();
      else await navigate(view);
      const trigger = page.locator(`[data-create="${type}"]:visible`).first();
      await trigger.click();
      const modal = page.locator('#editor-dialog');
      await expect(modal).toBeVisible();
      await assertStudioEditorialTheme(page);
      const bounds = await modal.boundingBox();
      if (width < 821) { expect(bounds.x).toBe(0); expect(bounds.y).toBe(0); expect(bounds.width).toBe(width); expect(bounds.height).toBe(844); }
      const metrics = await modal.evaluate(el => ({ inside:el.contains(document.activeElement), clipped:[...el.querySelectorAll('*')].filter(e => e.clientWidth && e.scrollWidth > e.clientWidth + 2).map(e => e.className) }));
      expect(metrics.inside).toBe(true); expect(metrics.clipped).toEqual([]);
      await modal.getByRole('button', { name:'Speichern', exact:true }).focus();
      await page.keyboard.press('Tab');
      await expect(modal.getByRole('button', { name:'Dialog schliessen' })).toBeFocused();
      await page.keyboard.press('Shift+Tab');
      await expect(modal.getByRole('button', { name:'Speichern', exact:true })).toBeFocused();
      const controls = await modal.locator('button,input,select,textarea').evaluateAll(elements => elements.filter(e => e.getClientRects().length).map(e => ({w:e.getBoundingClientRect().width,h:e.getBoundingClientRect().height})));
      const minimumTarget = width < 821 ? 44 : 38;
      for (const b of controls) { expect(b.w).toBeGreaterThanOrEqual(minimumTarget); expect(b.h).toBeGreaterThanOrEqual(minimumTarget); }
      const controlContrast = await modal.locator('input,select,textarea').evaluateAll(elements => elements.filter(element => element.getClientRects().length).map(element => {
        const parse = color => (color.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
        const luminance = color => color.map(value => value / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4).reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index], 0);
        const style = getComputedStyle(element), values = [luminance(parse(style.backgroundColor)), luminance(parse(style.borderTopColor))];
        return (Math.max(...values) + .05) / (Math.min(...values) + .05);
      }));
      expect(controlContrast.length).toBeGreaterThan(0);
      expect(controlContrast.every(ratio => ratio >= 3)).toBe(true);
      await page.screenshot({path:`qa/workspace-editor-${type}-${width}.png`});
      await page.keyboard.press('Escape');
      await expect(modal).toBeHidden();
      await expect(trigger).toBeFocused();
    }
    await page.close();
  });
}

async function mockClientSupabase(page) {
  await page.route("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.4/+esm", async (route) => {
    await route.fulfill({
      contentType: "application/javascript",
      body: `const result = (data) => ({ data, error: null });
      export function createClient() {
        return {
          auth: { getSession: async () => ({ data: { session: { access_token: "client-test", user: { id: "client-test" } } }, error: null }) },
          rpc: async (name) => result(name === "is_studio_owner" ? false : null),
          from(table) {
            const builder = {
              select() { return builder; }, eq() { return builder; }, order: async () => result([]), maybeSingle: async () => result(null), limit: async () => result(table === "customer_portal_memberships" ? [{ id: "membership-test" }] : [])
            };
            return builder;
          }
        };
      }`,
    });
  });
}

test("Client-Konto wird aus dem Studio ins private Kundenportal umgeleitet", async ({ page }) => {
  await mockClientSupabase(page);
  await page.goto(`${base}/studio/`);
  await page.waitForURL(/\/client\/$/);
});

test("Desktop: Dashboard und vollständiger Erfassungsfluss", async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await mockStudioSupabase(page);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await page.goto(`${base}/admin/`);
  await expect(page.getByRole("heading", { name: "Übersicht" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Dein Arbeitsbereich" })).toBeVisible();
  await expect(page.getByText("AUSSTEHENDE ZAHLUNGEN", { exact: true })).toBeVisible();
  await expect(page.locator(".dashboard-focus").getByRole("heading", { name: "Brand Film 2026" })).toBeVisible();
  await page.getByRole("button", { name: "Projekt-Canvas öffnen" }).click();
  await expect(page.getByRole("heading", { name: "Brand Film 2026" })).toBeVisible();

  await page.locator('.nav-link[data-view="customers"]').click();
  await expect(page.locator(".topbar .primary-action")).toHaveText(/Kunde erfassen/);
  await page.locator('[data-create="customer"]').first().click();
  await page.getByRole("button", { name: "Abbrechen" }).click();
  await expect(page.locator("#editor-dialog")).not.toBeVisible();

  await page.locator('[data-create="customer"]').first().click();
  await page.locator('[name="company"]').fill("Testkunde AG");
  await page.locator('[name="contact_name"]').fill("Mira Muster");
  await page.locator('[name="email"]').fill("mira@example.com");
  await page.locator('[name="address_line1"]').fill("Testweg 1");
  await page.locator('[name="postal_code"]').fill("4000");
  await page.locator('[name="city"]').fill("Basel");
  await page.getByRole("button", { name: "Speichern" }).click();
  await expect(page.locator(".data-table").getByText("Testkunde AG", { exact: true })).toBeVisible();

  await page.locator('.nav-link[data-view="invoices"]').click();
  await page.locator('[data-create="invoice"]').first().click();
  await page.locator('[name="customer_id"]').selectOption({ label: "Testkunde AG" });
  await expect(page.locator('[name="project_id"] option')).toHaveCount(1);
  await page.locator('[name="item_description"]').fill("Brand Film Konzeption");
  await page.locator('[name="item_price"]').fill("1200");
  await expect(page.locator("#invoice-total")).toContainText("CHF 1’200.00");
  await page.getByRole("button", { name: "Speichern" }).click();
  await expect(page.locator(".data-table").getByText("HEAV-2026-003", { exact: true })).toBeVisible();
  const newInvoiceRow = page.locator(".data-table tbody tr").filter({ hasText: "HEAV-2026-003" });
  await newInvoiceRow.getByRole("button", { name: "Aktionen für HEAV-2026-003" }).click();
  const downloadPromise = page.waitForEvent("download");
  await newInvoiceRow.getByRole("button", { name: "PDF herunterladen", exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("HEAV-2026-003.pdf");
  await expect(newInvoiceRow).toContainText("RF94 HEAV 2026 0000 03");
  await newInvoiceRow.getByRole("button", { name: "Rechnung senden" }).click();
  await expect(page.locator("#action-confirm-dialog")).toBeVisible();
  await expect(page.locator("#action-confirm-dialog")).toContainText("Rechnung jetzt senden?");
  await expect(page.locator("#action-confirm-dialog")).toContainText("mira@example.com");
  await page.screenshot({ path: "qa/admin-send-confirm-dialog.png", fullPage: true });
  await page.locator("#action-confirm-dialog").getByRole("button", { name: "Abbrechen" }).click();
  await expect(page.locator("#action-confirm-dialog")).toBeHidden();

  await newInvoiceRow.getByRole("button", { name: /Rechnung löschen/ }).click();
  await expect(page.locator("#action-confirm-dialog")).toBeVisible();
  await expect(page.locator("#action-confirm-dialog").getByRole("button", { name: "Löschen" })).toHaveCSS("background-color", "rgb(112, 60, 64)");
  await expect(page.locator("#action-confirm-dialog").getByRole("button", { name: "Löschen" })).toHaveCSS("color", "rgb(255, 240, 237)");
  await page.locator("#action-confirm-dialog").getByRole("button", { name: "Löschen" }).click();
  await expect(newInvoiceRow).toHaveCount(0);

  await page.locator('.nav-link[data-view="projects"]').click();
  const projectRow = page.locator(".data-table tbody tr").filter({ hasText: "Campaign Content" });
  await projectRow.getByRole("button", { name: /Projekt löschen/ }).click();
  await page.locator("#action-confirm-dialog").getByRole("button", { name: "Löschen" }).click();
  await expect(projectRow).toHaveCount(0);

  await page.locator('.nav-link[data-view="customers"]').click();
  const customerRow = page.locator(".data-table tbody tr").filter({ hasText: "Testkunde AG" });
  await customerRow.getByRole("button", { name: /Kunde löschen/ }).click();
  await page.locator("#action-confirm-dialog").getByRole("button", { name: "Löschen" }).click();
  await expect(customerRow).toHaveCount(0);

  await assertHealthy(page, errors);
  await page.screenshot({ path: "qa/admin-desktop.png", fullPage: true });
  await page.close();
});

test("Dashboard: Fokus, Geldfluss und Produktionen bleiben auf Desktop und Mobile klar", async ({ browser }) => {
  const desktop = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await mockStudioSupabase(desktop);
  const desktopErrors = [];
  desktop.on("pageerror", (error) => desktopErrors.push(error.message));
  desktop.on("console", (message) => { if (message.type() === "error") desktopErrors.push(message.text()); });
  await desktop.goto(`${base}/admin/`);
  await expect(desktop.locator(".dashboard-stage")).toBeVisible();
  await expect(desktop.locator(".dashboard-focus-modules > div")).toHaveCount(3);
  await expect(desktop.locator(".dashboard-production-row")).toHaveCount(2);
  await desktop.waitForTimeout(700);
  await desktop.screenshot({ path: "qa/admin-dashboard-desktop.png", fullPage: true });
  await assertHealthy(desktop, desktopErrors);
  await desktop.close();

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await mockStudioSupabase(mobile);
  const mobileErrors = [];
  mobile.on("pageerror", (error) => mobileErrors.push(error.message));
  mobile.on("console", (message) => { if (message.type() === "error") mobileErrors.push(message.text()); });
  await mobile.goto(`${base}/admin/`);
  await expect(mobile.locator(".dashboard-focus")).toBeVisible();
  await expect(mobile.locator(".dashboard-focus-footer .primary-action")).toHaveCSS("min-height", "44px");
  await mobile.waitForTimeout(700);
  await mobile.screenshot({ path: "qa/admin-dashboard-mobile.png", fullPage: true });
  await assertHealthy(mobile, mobileErrors);
  await mobile.close();
});

test("Kunde: Privatkunde ohne Firma und Kontaktdaten speichern", async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await mockStudioSupabase(page);
  await page.goto(`${base}/admin/`);
  await page.locator('.nav-link[data-view="customers"]').click();
  await page.locator('[data-create="customer"]').first().click();
  await page.locator('[name="contact_name"]').fill("Noah Frei");
  await page.getByRole("button", { name: "Speichern" }).click();
  const privateCustomerRow = page.locator(".data-table tbody tr").filter({ hasText: "Noah Frei" }).filter({ hasText: "Privatkunde" });
  await expect(privateCustomerRow).toBeVisible();
  await expect(privateCustomerRow.locator("strong")).toHaveText("Noah Frei");
  await page.close();
});

test("Bestehende negative Rabattposition lässt sich ohne native Zahlenfeld-Sperre bearbeiten", async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await mockStudioSupabase(page);
  await page.goto(`${base}/admin/`);
  await page.locator('.nav-link[data-view="invoices"]').click();
  const invoiceRow = page.locator(".data-table tbody tr").filter({ hasText: "HEAV-2026-002" });
  await invoiceRow.getByRole("button", { name: "Aktionen für HEAV-2026-002" }).click();
  await invoiceRow.getByRole("button", { name: "Bearbeiten" }).click();

  const discountRow = page.locator(".invoice-item").nth(1);
  await expect(discountRow.locator('[name="discount_value"]')).toHaveValue("61.9");
  await expect(discountRow.locator('[name="discount_value"]')).toHaveAttribute("min", "0.01");
  await expect(discountRow.locator('[name="item_price"]')).toHaveCount(0);
  const servicePriceBox = await page.locator('.invoice-item').first().locator('[name="item_price"]').boundingBox();
  const discountValueBox = await discountRow.locator('[name="discount_value"]').boundingBox();
  expect(discountValueBox.x).toBeCloseTo(servicePriceBox.x, 0);
  await expect(page.locator("#invoice-total")).toContainText("CHF 508.20");

  await page.getByRole("button", { name: "Speichern" }).click();
  await expect(page.locator("#editor-dialog")).not.toBeVisible();
  expect(await page.evaluate(() => window.__lastUpdatedInvoiceItems)).toEqual([
    { description: "Foto- & Videoproduktion vor Ort", quantity: 2.75, unit_price_rappen: 15000 },
    { description: "Persönlicher Sonderrabatt", quantity: 1, unit_price_rappen: -6190 },
    { description: "Foto-/Equipment-Zuschlag", quantity: 1, unit_price_rappen: 10000 },
    { description: "An- und Rückreise", quantity: 1, unit_price_rappen: 5760 },
  ]);
  await page.close();
});

test("Neue Rechnung erhält einen klaren Rabatt-Workflow statt negativer Preiseingabe", async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await mockStudioSupabase(page);
  await page.goto(`${base}/admin/`);
  await page.getByRole("button", { name: /Neue Rechnung/ }).click();
  await page.locator('select[name="customer_id"]').selectOption("c2");
  const serviceRow = page.locator(".invoice-item").first();
  await serviceRow.locator('[name="item_description"]').fill("Produktion");
  await serviceRow.locator('[name="item_quantity"]').fill("2");
  await serviceRow.locator('[name="item_price"]').fill("100");

  await page.getByRole("button", { name: "Rabatt hinzufügen" }).click();
  const discountRow = page.locator(".invoice-item.is-discount");
  await discountRow.locator('[name="item_description"]').fill("Persönlicher Sonderrabatt");
  await discountRow.locator('[name="discount_value"]').fill("25");
  await expect(page.locator("#invoice-total")).toContainText("CHF 175.00");
  await page.getByRole("button", { name: "Speichern", exact: true }).click();

  expect(await page.evaluate(() => window.__lastCreatedInvoiceItems)).toEqual([
    { description: "Produktion", quantity: 2, unit_price_rappen: 10000 },
    { description: "Persönlicher Sonderrabatt", quantity: 1, unit_price_rappen: -2500 },
  ]);
  await page.close();
});

test("Mobile: echte 390px-Ansicht, Navigation und Rechnungsdialog", async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await mockStudioSupabase(page);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await page.goto(`${base}/admin/`);
  await expect(page.getByRole("heading", { name: "Übersicht" })).toBeVisible();
  const menuButton = page.getByRole("button", { name: "Menü öffnen" });
  await menuButton.click();
  await expect(page.locator("#admin-shell")).toHaveClass(/nav-open/);
  await expect(menuButton).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator("#sidebar")).toBeVisible();
  await expect(page.locator('.nav-link[data-view="dashboard"]')).toBeFocused();
  await page.locator("#logout-button").focus();
  await page.keyboard.press("Tab");
  await expect(page.locator("#sidebar .brand")).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(page.locator("#logout-button")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(menuButton).toHaveAttribute("aria-expanded", "false");
  await expect(menuButton).toBeFocused();
  await menuButton.click();
  await page.locator('.nav-link[data-view="invoices"]').click();
  await expect(page.locator("#view-title")).toHaveText("Rechnungen");
  await expect(page.locator('.sidebar')).toHaveCSS('visibility', 'hidden');
  const financeLayout = await page.evaluate(() => {
    const nav = document.querySelector('.finance-nav');
    const toolbar = document.querySelector('.view .toolbar');
    const buttons = [...nav.querySelectorAll('button')].map(button => button.getBoundingClientRect());
    return {
      gap: toolbar.getBoundingClientRect().top - nav.getBoundingClientRect().bottom,
      buttonHeights: buttons.map(button => button.height),
    };
  });
  expect(financeLayout.gap).toBeLessThanOrEqual(12);
  expect(financeLayout.buttonHeights.every(height => height >= 44 && height <= 46)).toBe(true);
  await page.screenshot({ path: "qa/admin-finance-mobile-compact.png", fullPage: true });
  const filterMetrics = await page.locator(".filter-tabs").evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }));
  expect(filterMetrics.scrollWidth).toBeLessThanOrEqual(filterMetrics.clientWidth);
  await page.locator("[data-create=invoice]").first().click();
  await expect(page.getByRole("heading", { name: "Rechnung erstellen" })).toBeVisible();
  await assertHealthy(page, errors);
  await page.screenshot({ path: "qa/admin-mobile-invoice.png", fullPage: true });
  const close = page.getByRole("button", { name: "Dialog schliessen" });
  const box = await close.boundingBox();
  expect(box.width).toBeGreaterThanOrEqual(44);
  expect(box.height).toBeGreaterThanOrEqual(44);
  await page.close();
});

test("Mobile: Portal-Anfragen bleiben als handlungsfähige Karten erreichbar", async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await mockStudioSupabase(page);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await page.goto(`${base}/admin/`);
  await page.getByRole("button", { name: "Menü öffnen" }).click();
  await page.locator('.nav-link[data-view="portal-requests"]').click();
  const card = page.locator(".portal-request-card").filter({ hasText: "Studio Nord" });
  await expect(card).toBeVisible();
  await expect(card).toContainText("Lea Meier");
  await expect(card.getByRole("button", { name: "Akzeptieren" })).toBeVisible();
  await expect(card.getByRole("button", { name: "Ablehnen" })).toBeVisible();
  await expect(page.locator(".data-table")).toBeHidden();
  const actionMetrics = await card.getByRole("button", { name: "Akzeptieren" }).evaluate((element) => ({ width: element.getBoundingClientRect().width, height: element.getBoundingClientRect().height }));
  expect(actionMetrics.height).toBeGreaterThanOrEqual(44);
  await assertHealthy(page, errors);
  await page.close();
});

test("Studio: Portal-Einladung und Status haben einen klaren Aktionsabstand", async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await mockStudioSupabase(page, { customer_portal_requests: [
    { id: "r-accepted", customer_id: "c1", company: "Studio Nord", contact_name: "Lea Meier", email: "lea@studio-nord.example", status: "accepted", created_at: "2026-09-09T10:00:00Z" },
  ] });
  await page.goto(`${base}/studio/`);
  await page.locator('.nav-link[data-view="portal-requests"]').click();
  const row = page.locator('.data-table tbody tr').filter({ hasText: 'Studio Nord' });
  const layout = await row.locator('.table-actions').evaluate(element => {
    const button = element.querySelector('[data-portal-request-action="invite"]').getBoundingClientRect();
    const status = element.querySelector('.status').getBoundingClientRect();
    return { gap: status.left - button.right, buttonHeight: button.height, statusHeight: status.height };
  });
  expect(layout.gap).toBeGreaterThanOrEqual(12);
  expect(layout.buttonHeight).toBeGreaterThanOrEqual(38);
  expect(layout.buttonHeight).toBeLessThanOrEqual(40);
  expect(layout.statusHeight).toBeLessThanOrEqual(32);
  await page.screenshot({ path: "qa/admin-portal-actions-desktop.png", fullPage: true });
  await page.close();
});

test("Studio: Navigation und Textaktionen bleiben inhaltsnah statt gestreckt", async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await mockStudioSupabase(page);
  await page.goto(`${base}/studio/`);

  await page.locator('.nav-link[data-view="customers"]').click();
  const geometry = await page.evaluate(() => {
    const bounds = selector => document.querySelector(selector).getBoundingClientRect();
    const style = selector => getComputedStyle(document.querySelector(selector));
    const name = document.querySelector('.customer-name');
    const mark = name.querySelector('.customer-contact').getBoundingClientRect();
    const textNode = [...name.childNodes].find(node => node.nodeType === Node.TEXT_NODE && node.textContent.trim());
    const range = document.createRange();
    range.selectNodeContents(textNode);
    const text = range.getBoundingClientRect();
    return {
      activeNavWidth: bounds('.nav-link.is-active').width,
      topbarActionWidth: bounds('.topbar .primary-action').width,
      topbarActionHeight: bounds('.topbar .primary-action').height,
      primaryPadding: parseFloat(style('.topbar .primary-action').paddingLeft),
      customerGap: text.left - mark.right,
      customerRowHeight: bounds('.data-table tbody tr').height,
    };
  });
  expect(geometry.activeNavWidth).toBeLessThan(135);
  expect(geometry.topbarActionWidth).toBeLessThan(150);
  expect(geometry.topbarActionHeight).toBeLessThanOrEqual(40);
  expect(geometry.primaryPadding).toBeLessThanOrEqual(13);
  expect(geometry.customerGap).toBeGreaterThanOrEqual(10);
  expect(geometry.customerGap).toBeLessThanOrEqual(14);
  expect(geometry.customerRowHeight).toBeLessThanOrEqual(66);

  await page.locator('.nav-link[data-view="dashboard"]').click();
  const quickActionWidths = await page.locator('.dashboard-quick-actions button').evaluateAll(buttons => buttons.map(button => button.getBoundingClientRect().width));
  expect(quickActionWidths.every(width => width < 150)).toBe(true);

  for (const view of ['settings', 'portal-requests']) {
    await page.locator(`.nav-link[data-view="${view}"]`).click();
    await expect(page.locator('.topbar .primary-action')).toBeHidden();
  }
  await page.close();
});

test("Studio: mobile Kundenkarten priorisieren Identität ohne losgelöste Ortszeile", async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await mockStudioSupabase(page);
  await page.goto(`${base}/studio/`);
  await page.getByRole('button', { name: 'Menü öffnen' }).click();
  await page.locator('.nav-link[data-view="customers"]').click();
  const card = page.locator('.mobile-card').first();
  await expect(card.locator(':scope > span')).toHaveCount(0);
  const geometry = await card.evaluate(element => {
    const name = element.querySelector('.customer-name');
    const mark = name.querySelector('.customer-contact').getBoundingClientRect();
    const textNode = [...name.childNodes].find(node => node.nodeType === Node.TEXT_NODE && node.textContent.trim());
    const range = document.createRange();
    range.selectNodeContents(textNode);
    const text = range.getBoundingClientRect();
    const meta = element.querySelector('small').getBoundingClientRect();
    const actions = element.querySelector('.table-actions').getBoundingClientRect();
    return {
      height: element.getBoundingClientRect().height,
      customerGap: text.left - mark.right,
      actionGap: actions.top - meta.bottom,
    };
  });
  expect(geometry.height).toBeLessThanOrEqual(145);
  expect(geometry.customerGap).toBeGreaterThanOrEqual(10);
  expect(geometry.customerGap).toBeLessThanOrEqual(14);
  expect(geometry.actionGap).toBeLessThanOrEqual(14);
  await page.close();
});

test("Studio: mobile Portal-Aktionen zeigen Status nur einmal und bleiben kompakt", async ({ browser }) => {
  const requests = [
    { id: "r-accepted", customer_id: "c1", company: "Studio Nord", contact_name: "Lea Meier", email: "lea@studio-nord.example", status: "accepted", statusLabel: "Akzeptiert", created_at: "2026-09-09T10:00:00Z" },
    { id: "r-declined", customer_id: "c2", company: "Atelier Süd", contact_name: "Mara Frei", email: "mara@atelier-sued.example", status: "declined", statusLabel: "Abgelehnt", created_at: "2026-09-10T10:00:00Z" },
  ];
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await mockStudioSupabase(page, { customer_portal_requests: requests });
  await page.goto(`${base}/studio/`);
  await page.getByRole('button', { name: 'Menü öffnen' }).click();
  await page.locator('.nav-link[data-view="portal-requests"]').click();
  for (const request of requests) {
    const card = page.locator('.portal-request-card').filter({ hasText: request.company });
    await expect(card).toBeVisible();
    await expect(card.locator('.status')).toHaveCount(1);
    await expect(card.locator('.status')).toHaveText(request.statusLabel);
  }
  const acceptedCard = page.locator('.portal-request-card').filter({ hasText: "Studio Nord" });
  const invite = await acceptedCard.getByRole('button', { name: 'Einladung senden' }).boundingBox();
  expect(invite.height).toBeGreaterThanOrEqual(44);
  expect(invite.width).toBeLessThanOrEqual(140);
  await expect(page.locator('.topbar .primary-action')).toBeHidden();
  await page.close();
});

test("Login: ein Owner mit Kundenmitgliedschaft landet im HEAV Studio", async ({ page }) => {
  await page.route("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.4/+esm", async (route) => {
    await route.fulfill({
      contentType: "application/javascript",
      body: `const result = (data) => ({ data, error: null });
      export function createClient() {
        return {
          auth: { getSession: async () => ({ data: { session: { user: { id: "owner-test" } } }, error: null }) },
          rpc: async (name) => result(name === "is_studio_owner"),
          from(table) {
            const builder = {
              select() { return builder; },
              eq() { return builder; },
              maybeSingle: async () => result(table === "company_settings" ? { owner_id: "owner-test" } : null),
              limit: async () => result(table === "customer_portal_memberships" ? [{ id: "membership-test" }] : [])
            };
            return builder;
          }
        };
      }`,
    });
  });
  await page.goto(`${base}/login/`);
  await page.waitForURL(/\/studio\/$/);
});

test("Login: ein authentifiziertes Konto ohne Rolle wird ohne Redirect-Schleife abgemeldet", async ({ page }) => {
  await page.route("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.4/+esm", async (route) => {
    await route.fulfill({
      contentType: "application/javascript",
      body: `const result = (data) => ({ data, error: null });
      export function createClient() {
        return {
          auth: {
            getSession: async () => ({ data: { session: { user: { id: "no-role" } } }, error: null }),
            signOut: async () => { window.__signedOut = true; return { error: null }; }
          },
          rpc: async () => result(false),
          from() { const builder = { select() { return builder; }, eq() { return builder; }, limit: async () => result([]) }; return builder; }
        };
      }`,
    });
  });
  await page.goto(`${base}/login/`);
  await expect(page).toHaveURL(/\/login\/$/);
  await expect(page.locator("#login-message")).toContainText("kein freigegebener Zugang");
  await expect.poll(() => page.evaluate(() => window.__signedOut)).toBe(true);
});

test("Login: ein Fehler der Owner-Prüfung darf nicht ins Kundenportal fehlleiten", async ({ page }) => {
  await page.route("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.4/+esm", async (route) => {
    await route.fulfill({
      contentType: "application/javascript",
      body: `const result = (data) => ({ data, error: null });
      export function createClient() {
        return {
          auth: { getSession: async () => ({ data: { session: { user: { id: "dual-role" } } }, error: null }) },
          rpc: async () => ({ data: null, error: { message: "owner lookup unavailable" } }),
          from() { window.__membershipQueried = true; const builder = { select() { return builder; }, eq() { return builder; }, limit: async () => result([{ id: "membership" }]) }; return builder; }
        };
      }`,
    });
  });
  await page.goto(`${base}/login/`);
  await expect(page).toHaveURL(/\/login\/$/);
  await expect(page.locator("#login-message")).toContainText("Berechtigung konnte nicht geprüft werden");
  expect(await page.evaluate(() => window.__membershipQueried || false)).toBe(false);
});

test("Login: sendet einen Magic-Link nur für bestehende Benutzer und ohne Vorschau", async ({ page }) => {
  await page.route("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.4/+esm", async (route) => {
    await route.fulfill({
      contentType: "application/javascript",
      body: `export function createClient() {
        return { auth: {
          getSession: async () => ({ data: { session: null } }),
          signInWithOtp: async (payload) => {
            window.__heavOtpPayload = payload;
            return { error: null };
          }
        } };
      }`,
    });
  });
  await page.goto(`${base}/login/`);
  await expect(page).toHaveTitle("Anmelden – HEAV Studio");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  await expect(page.locator('input[type="password"]')).toHaveCount(0);
  await page.getByLabel("E-Mail-Adresse").fill("admin@heav.ch");
  await page.getByRole("button", { name: /Anmeldelink senden/ }).click();
  await expect.poll(() => page.evaluate(() => window.__heavOtpPayload)).toEqual({
    email: "admin@heav.ch",
    options: { emailRedirectTo: `${base}/login/`, shouldCreateUser: false },
  });
  await expect(page.getByText(/Anmeldelink gesendet/)).toBeVisible();
  await expect(page.locator("#login-message")).toHaveClass(/is-dispatch-success/);
  await expect(page.locator("#login-message .send-plane")).toBeVisible();
  await expect(page.locator("#login-message .send-check")).toBeVisible();
  await expect(page.getByText(/Vorschau|Musterrechnung/i)).toHaveCount(0);
  await expect(page.getByRole("button", { name: /installieren/i })).toHaveCount(0);
});

test("Studio: Rechnungen, Kunden und Projekte verwenden klare Icon-Aktionen", async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await mockStudioSupabase(page);
  await page.goto(`${base}/studio/`);
  await page.locator('.nav-link[data-view="customers"]').click();
  const customerRow = page.locator(".data-table tbody tr").first();
  await expect(customerRow.locator(".customer-contact svg")).toBeVisible();
  const edit = customerRow.getByRole("button", { name: "Bearbeiten" });
  await expect(edit.locator("svg")).toBeVisible();
  await expect(edit).toHaveAttribute("title", "Bearbeiten");
  const editBounds = await edit.boundingBox();
  expect(editBounds.width).toBeGreaterThanOrEqual(38);
  expect(editBounds.height).toBeGreaterThanOrEqual(38);
  await page.locator('.nav-link[data-view="invoices"]').click();
  const invoiceRow = page.locator(".data-table tbody tr").filter({ hasText: "HEAV-2026-001" });
  await invoiceRow.getByRole("button", { name: "Aktionen für HEAV-2026-001" }).click();
  await expect(invoiceRow.getByRole("button", { name: "Rechnung senden" }).locator("svg")).toBeVisible();
  const actionLayout = await invoiceRow.locator(".table-actions").evaluate((toolbar) => {
    const buttons = [...toolbar.querySelectorAll("button")].map((button) => button.getBoundingClientRect());
    return {
      display: getComputedStyle(toolbar).display,
      flexWrap: getComputedStyle(toolbar).flexWrap,
      actionTopSpread: Math.max(...buttons.map(({ top }) => top)) - Math.min(...buttons.map(({ top }) => top)),
    };
  });
  expect(actionLayout.display).toBe("flex");
  expect(actionLayout.flexWrap).toBe("nowrap");
  expect(actionLayout.actionTopSpread).toBeLessThanOrEqual(1);
  await page.close();
});
test("Studio: Projekt-Canvas verbindet Produktion, Kunde und Finanzschritte", async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await mockStudioSupabase(page);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await page.goto(`${base}/studio/`);
  await page.locator('.nav-link[data-view="projects"]').click();
  const canvas = page.locator(".project-canvas");
  await expect(canvas).toBeVisible();
  await expect(canvas).toHaveAttribute('aria-describedby', 'project-canvas-guide');
  await expect(page.locator('#project-canvas-guide')).toHaveText('6 Bereiche · horizontal erkunden →');
  await expect(canvas).toContainText("Brand Film 2026");
  await expect(canvas).toContainText("CHF 9’188.50");
  await page.locator('[data-project-focus="p2"]').first().click();
  await expect(canvas).toContainText("Campaign Content");
  await expect(canvas).toContainText("Atelier Morgen");
  await canvas.locator('[data-create="invoice"]').click();
  await expect(page.getByRole("heading", { name: "Rechnung erstellen" })).toBeVisible();
  await expect(page.locator('select[name="customer_id"]')).toHaveValue("c2");
  await expect(page.locator('select[name="project_id"]')).toHaveValue("p2");
  await page.getByRole("button", { name: "Dialog schliessen" }).click();
  const desktopPanelHeights = await canvas.locator('.project-canvas-track > header,.project-canvas-track > .project-module-grid > article,.project-canvas-track > section').evaluateAll(items => items.map(item => Math.round(item.getBoundingClientRect().height)));
  expect(desktopPanelHeights.every(height => height >= 330 && height <= 355)).toBe(true);
  await assertHealthy(page, errors);
  await page.evaluate(() => scrollTo(0, 0));
  await canvas.evaluate(element => element.scrollTo({ left: 0, behavior: 'auto' }));
  await expect.poll(() => canvas.evaluate(element => Math.round(element.scrollLeft))).toBe(0);
  await page.screenshot({ path: "qa/admin-project-canvas-desktop.png", fullPage: true });
  await page.close();
});

test("Studio: Projekt-Canvas bleibt in echter 390px-Ansicht vollständig bedienbar", async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await mockStudioSupabase(page);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await page.goto(`${base}/studio/`);
  await page.getByRole("button", { name: "Menü öffnen" }).click();
  await page.locator('.nav-link[data-view="projects"]').click();
  await expect(page.locator("#admin-shell")).not.toHaveClass(/nav-open/);
  await page.waitForTimeout(350);
  const canvas = page.locator(".project-canvas");
  await expect(canvas).toBeVisible();
  const metrics = await canvas.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
    snapType: getComputedStyle(element).scrollSnapType,
    panelWidths: [...element.querySelectorAll('.project-canvas-track > header,.project-canvas-track > .project-module-grid > article,.project-canvas-track > section')].map(item => Math.round(item.getBoundingClientRect().width)),
    panelHeights: [...element.querySelectorAll('.project-canvas-track > header,.project-canvas-track > .project-module-grid > article,.project-canvas-track > section')].map(item => Math.round(item.getBoundingClientRect().height)),
  }));
  expect(metrics.scrollWidth).toBeGreaterThan(metrics.clientWidth);
  expect(metrics.snapType).toContain('x');
  expect(metrics.panelWidths).toHaveLength(6);
  expect(metrics.panelWidths.every(width => width >= 300 && width < 390)).toBe(true);
  expect(metrics.panelHeights.every(height => height >= 330 && height <= 355)).toBe(true);
  await canvas.evaluate(element => element.scrollTo({ left: element.scrollWidth, behavior: 'auto' }));
  await expect.poll(() => canvas.evaluate(element => Math.round(element.scrollLeft + element.clientWidth))).toBeGreaterThanOrEqual(metrics.scrollWidth - 2);
  const action = canvas.locator('[data-create="invoice"]');
  const box = await action.boundingBox();
  expect(box.width).toBeGreaterThanOrEqual(44);
  expect(box.height).toBeGreaterThanOrEqual(44);
  await assertHealthy(page, errors);
  await page.evaluate(() => scrollTo(0, 0));
  await canvas.evaluate(element => element.scrollTo({ left: 0, behavior: 'auto' }));
  await expect.poll(() => canvas.evaluate(element => Math.round(element.scrollLeft))).toBe(0);
  await page.screenshot({ path: "qa/admin-project-canvas-mobile.png", fullPage: true });
  await page.close();
});


test("Studio: Offerte wird erstellt und per geschütztem Portal-Link versendet", async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await mockStudioSupabase(page);
  await page.goto(`${base}/studio/`);
  await page.locator('.nav-link[data-view="invoices"]').click();
  await page.getByRole("navigation", { name: "Finanzen" }).getByRole("button", { name: "Offerten" }).click();
  await expect(page.getByRole("heading", { name: "Offerten" })).toBeVisible();
  await page.getByRole("button", { name: /Neue Offerte/ }).click();
  await page.locator('select[name="customer_id"]').selectOption("c1");
  await page.getByLabel("Titel *").fill("Social Cutdowns");
  await page.locator(".invoice-item").first().getByLabel("Leistung").fill("Schnitt");
  await page.locator(".invoice-item").first().getByLabel("Einzelpreis in CHF").fill("1200");
  await page.getByRole("button", { name: "Speichern" }).click();
  const newOfferRow = page.locator(".data-table tbody tr").filter({ hasText: "Social Cutdowns" });
  await expect(newOfferRow).toBeVisible();
  await newOfferRow.getByRole("button", { name: "Offerte per E-Mail senden" }).click();
  await page.getByRole("button", { name: "Jetzt senden" }).click();
  await expect.poll(() => page.evaluate(() => window.__lastOfferEmail)).toMatchObject({ offerId: expect.any(String) });
  await expect(page.locator(".data-table tbody tr").first()).toContainText("Versendet");
  await page.close();
});
