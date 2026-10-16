import { test, expect } from "@playwright/test";
test.use({ isMobile: true, hasTouch: true });
async function login(page) {
  await page.goto("/login");
  await fits(page);
  await expect(page.getByRole("heading", { name: "Work starts here.", exact: true })).toBeVisible();
  await page.getByLabel("E-Mail", { exact: true }).fill("owner@example.test");
  await page.getByLabel("Passwort", { exact: true }).fill("test-password");
  await page.getByRole("button", { name: "Anmelden", exact: true }).click();
  await expect(page.locator(".crm-metrics button")).toHaveCount(4);
  await expect(
    page.getByText("Dein Studio auf einen Blick.", { exact: true }),
  ).toBeVisible();
}
async function fits(page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= (visualViewport?.width || innerWidth),
    ),
  ).toBeTruthy();
  const outside = await page
    .locator(
      ".hsv-main button:visible, [role=dialog] input:visible, [role=dialog] button:visible",
    )
    .evaluateAll((nodes) =>
      nodes
        .filter((n) => {
          const r = n.getBoundingClientRect();
          return r.width && (r.left < -1 || r.right > innerWidth + 1);
        })
        .map((n) => n.outerHTML.slice(0, 160)),
    );
  expect(outside).toEqual([]);
}
async function touchTargets(page, selector) {
  const tooSmall = await page.locator(selector).evaluateAll((nodes) =>
    nodes
      .filter((node) => {
        const style = getComputedStyle(node);
        if (style.display === "none" || style.visibility === "hidden") return false;
        const r = node.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && (r.width < 43 || r.height < 43);
      })
      .map((node) => {
        const r = node.getBoundingClientRect();
        return {
          label: node.getAttribute("aria-label") || node.textContent?.trim().slice(0, 80),
          width: Math.round(r.width),
          height: Math.round(r.height),
        };
      }),
  );
  expect(tooSmall).toEqual([]);
}
for (const appearance of ["light", "dark"])
  for (const width of [320, 375, 390, 430])
    test(`mobile navigation, sheets, search and editor fit ${width}px ${appearance}`, async ({
      page,
    }) => {
      await page.addInitScript(
        (mode) => localStorage.setItem("hive-appearance", mode),
        appearance,
      );
      await page.setViewportSize({ width, height: 844 });
      await login(page);
      await fits(page);
      for (const value of await page.locator('.hive-kpi-value').all()) {
        await expect(value).toHaveCSS('white-space', 'nowrap');
        expect(await value.evaluate(node=>node.scrollWidth<=node.clientWidth)).toBeTruthy();
      }
      const nav = page.getByRole("navigation", { name: "Mobile Navigation" });
      await expect(nav).toBeVisible();
      await touchTargets(page, ".hive-mobile-nav button, .hive-mobile-create");
      const quickCreate = page.getByRole("button", { name: "Neu erstellen", exact: true });
      await expect(quickCreate).toBeVisible();
      await quickCreate.click();
      const quickDialog = page.getByRole("dialog", { name: "Neu erstellen" });
      await expect(quickDialog).toBeVisible();
      await touchTargets(page, ".hsv-dialog .hive-mobile-quick-actions button, .hsv-dialog .hsv-close");
      await expect(quickDialog.getByRole("button", { name: /^Kunde\b/ })).toBeVisible();
      await expect(quickDialog.getByRole("button", { name: /^Projekt\b/ })).toBeVisible();
      await expect(quickDialog.getByRole("button", { name: /^Rechnung\b/ })).toBeVisible();
      await expect(quickDialog.getByRole("button", { name: /^Offerte\b/ })).toBeVisible();
      await expect(quickDialog.getByRole("button", { name: /^Datei\b/ })).toBeVisible();
      expect(await page.evaluate(() => document.body.style.overflow)).toBe("hidden");
      await page.keyboard.press("Escape");
      await expect(quickDialog).toHaveCount(0);
      expect(await page.evaluate(() => document.body.style.overflow)).not.toBe("hidden");
      await page.screenshot({
        path: `../../outputs/hive-mobile-${width}-${appearance}.png`,
        fullPage: true,
      });
      for (const name of ["Kunden", "Projekte", "Rechnungen"]) {
        await nav.getByRole("button", { name, exact: true }).click();
        await expect(
          page.getByRole("heading", { name, exact: true }),
        ).toBeVisible();
        await fits(page);
      }
      await nav.getByRole("button", { name: "Weitere Module" }).click();
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "Offerten", exact: true })
        .click();
      await expect(
        page.getByRole("heading", { name: "Offerten", exact: true }),
      ).toBeVisible();
      await fits(page);
      await page
        .getByRole("button", { name: /Offerte erstellen|Neue Offerte/ })
        .click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await fits(page);
      await page.getByRole("button", { name: "Position hinzufügen" }).click();
      await expect(page.getByLabel("Position 2: Beschreibung")).toBeVisible();
      await fits(page);
      await page
        .getByLabel("Position 2: Beschreibung")
        .fill("Konzeption und Umsetzung");
      await page.getByLabel("Position 2: Menge").fill("2");
      await page.getByLabel("Position 2: Preis pro Einheit in CHF").fill("150");
      await expect(page.locator(".hive-document-grand")).toContainText("300");
      await page.screenshot({
        path: `../../outputs/hive-editor-${width}-${appearance}.png`,
      });
      await page
        .getByRole("button", { name: "Schliessen", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Workspace durchsuchen", exact: true })
        .click();
      await page
        .getByRole("textbox", { name: "Workspace durchsuchen" })
        .fill("Nord");
      await expect(
        page.getByRole("dialog").getByText("Nordkunde", { exact: true }),
      ).toBeVisible();
      await fits(page);
      await page.getByRole("button", { name: "Suche schliessen" }).click();

      await nav.getByRole("button", { name: "Weitere Module" }).click();
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "Businesses", exact: true })
        .click();
      await expect(page.getByRole("heading", { name: "Businesses", exact: true })).toBeVisible();
      await expect(page.locator(".hive-business-card")).toHaveCount(2);
      await fits(page);
      await nav.getByRole("button", { name: "Übersicht", exact: true }).click();

      await nav.getByRole("button", { name: "Weitere Module" }).click();
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "Portal", exact: true })
        .click();
      const portalTabs = page.getByRole("tablist", { name: "Portal-Bereiche" });
      await expect(portalTabs).toBeVisible();
      for (const section of ["Zugänge", "Dateien", "Anfragen", "Verlauf"]) {
        const control = portalTabs.getByRole("tab", { name: section, exact: true });
        await control.click();
        await expect(control).toHaveAttribute("aria-selected", "true");
        await fits(page);
      }

      await nav.getByRole("button", { name: "Weitere Module" }).click();
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "E-Mail", exact: true })
        .click();
      const emailTabs = page.getByRole("tablist", { name: "E-Mail-Bereiche" });
      await expect(emailTabs).toBeVisible();
      for (const section of ["Vorlagen", "Verlauf"]) {
        const control = emailTabs.getByRole("tab", { name: section, exact: true });
        await control.click();
        await expect(control).toHaveAttribute("aria-selected", "true");
        await fits(page);
      }

      await nav.getByRole("button", { name: "Weitere Module" }).click();
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "Business", exact: true })
        .click();
      const settingsTabs = page.getByRole("tablist", { name: "Business-Einstellungen" });
      await expect(settingsTabs).toBeVisible();
      for (const section of ["Brand", "Kontakt", "Abrechnung"]) {
        const control = settingsTabs.getByRole("tab", { name: section, exact: true });
        await control.click();
        await expect(control).toHaveAttribute("aria-selected", "true");
        await fits(page);
      }

      await nav.getByRole("button", { name: "Kunden", exact: true }).click();
      await page.getByRole("button", { name: /Kundenakte/ }).first().click();
      const customerWorkspace = page.getByRole("dialog", { name: "Workspace Details" });
      await expect(customerWorkspace).toBeVisible();
      await fits(page);
      await customerWorkspace.getByRole("button", { name: "Schliessen" }).click();

      await nav.getByRole("button", { name: "Projekte", exact: true }).click();
      await page.getByRole("button", { name: "Kalender", exact: true }).click();
      await expect(page.locator(".hive-project-agenda")).toBeVisible();
      await fits(page);
      await page.getByRole("button", { name: "Liste", exact: true }).click();
      await page.getByRole("button", { name: "Workspace", exact: true }).first().click();
      const projectWorkspace = page.getByRole("dialog", { name: "Workspace Details" });
      await expect(projectWorkspace).toBeVisible();
      await fits(page);
      await projectWorkspace.getByRole("button", { name: "Schliessen" }).click();

      await nav
        .getByRole("button", { name: "Rechnungen", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Rechnung erstellen", exact: true })
        .click();
      await fits(page);
      await page.keyboard.press("Escape");
      await nav.getByRole("button", { name: "Kunden", exact: true }).click();
      await page.getByRole("button", { name: "Kunde hinzufügen" }).click();
      await page.getByLabel("Firma", { exact: true }).fill("Mobile Test");
      await fits(page);
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await page.goto("/account");
      await expect(page.getByRole("heading", { name: "Dein Login.", exact: true })).toBeVisible();
      await fits(page);
      await page.goto("/studio");
      await expect(page.locator(".crm-metrics button")).toHaveCount(4);
      await fits(page);

      const studioNav = page.getByRole("navigation", { name: "Mobile Navigation" });
      await studioNav.getByRole("button", { name: "Kunden", exact: true }).click();
      await expect(page.getByText("Nordkunde", { exact: true })).toBeVisible();
      await page
        .getByLabel("Business auswählen")
        .selectOption("0540bbcf-343c-456c-8ac0-d6125fc74b84");
      await expect(page.getByText("Südkunde", { exact: true })).toBeVisible();
      await fits(page);
    });
