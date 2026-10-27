import { test, expect } from "@playwright/test";
for (const theme of ["light", "dark"])
  for (const width of [390, 1440])
    test(`Workspace navigation and project views work at ${width}px ${theme}`, async ({
      page,
    }) => {
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.addInitScript(
        (mode) => localStorage.setItem("hive-appearance", mode),
        theme,
      );
      await page.setViewportSize({ width, height: 1000 });
      await page.goto("/login");
      await page
        .getByLabel("E-Mail", { exact: true })
        .fill("owner@example.test");
      await page.getByLabel("Passwort", { exact: true }).fill("test-password");
      await page.getByRole("button", { name: "Anmelden", exact: true }).click();
      await expect(page.locator(".crm-metrics button")).toHaveCount(4);
      const nav = page.getByRole("navigation", {
        name: width <= 760 ? "Mobile Navigation" : "Business-Module",
      });
      if (width > 760)
        await expect(nav.locator("[data-slot=sidebar]")).toBeVisible();
      else {
        await expect(nav.getByRole('button',{name:'Neu erstellen',exact:true})).toBeVisible();
      }
      await page.screenshot({
        animations: "disabled",
        path: `../../outputs/hive-apple-overview-${width}-${theme}.png`,
      });
      await nav.getByRole("button", { name: "Projekte", exact: true }).click();
      const views = page.getByRole("group", { name: "Projektansicht" });
      await expect(views.getByRole('button',{name:'Liste',exact:true})).toHaveAttribute('aria-pressed','true');
      await views.getByRole("button", { name: "Board", exact: true }).click();
      await expect(page.locator(".hive-clean-board")).toBeVisible();
      await expect(
        views.getByRole("button", { name: "Board", exact: true }),
      ).toHaveAttribute("aria-pressed", "true");
      expect(
        await page.evaluate(
          () =>
            document.documentElement.scrollWidth <=
            (visualViewport?.width || innerWidth),
        ),
      ).toBeTruthy();
      await page.screenshot({
        animations: "disabled",
        path: `../../outputs/hive-apple-board-${width}-${theme}.png`,
      });
      await expect(page.locator('.hive-document-icon')).toHaveCount(0);
      await page.getByRole('button', {name:'Erscheinungsbild einstellen'}).click();
      await page.getByRole('radio', {name:theme === 'light' ? 'Dunkel' : 'Hell', exact:true}).check();
      await expect(
        page.locator("html"),
      ).toHaveAttribute(
        "data-theme",
        theme === "light" ? "dark" : "light",
      );
      await page.getByRole('button',{name:'Erscheinungsbild schließen'}).click();
      if (width <= 760) {
        await nav.getByRole('button',{name:'Mehr'}).click();
        await page.getByRole('dialog').getByRole('button',{name:'Einstellungen',exact:true}).click();
      } else await nav.getByRole('button',{name:'Einstellungen',exact:true}).click();
      await expect(page.getByRole('radio',{name:theme === 'light' ? 'Dunkel' : 'Hell',exact:true})).toBeChecked();
      await page.screenshot({path:`../../outputs/hive-appearance-${width}-${theme}.png`,animations:'disabled'});
      expect(errors).toEqual([]);
    });

test('automatic appearance follows device changes and persists after reload', async ({page}) => {
  await page.emulateMedia({colorScheme:'light'});
  await page.goto('/login');
  await expect(page.locator('html')).toHaveAttribute('data-theme','light');
  await page.getByRole('button',{name:'Erscheinungsbild einstellen'}).click();
  await expect(page.getByRole('radio',{name:'Automatisch',exact:true})).toBeChecked();
  await page.emulateMedia({colorScheme:'dark'});
  await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
  await page.getByRole('radio',{name:'Hell',exact:true}).check();
  await page.emulateMedia({colorScheme:'light'});
  await page.emulateMedia({colorScheme:'dark'});
  await expect(page.locator('html')).toHaveAttribute('data-theme','light');
  await page.getByRole('radio',{name:'Automatisch',exact:true}).check();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
});
