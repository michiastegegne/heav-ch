import { test, expect } from "@playwright/test";
for (const theme of ["light", "dark"])
  for (const width of [390, 1440])
    test(`project layout, status colours and move work at ${width}px ${theme}`, async ({
      page,
    }) => {
      await page.addInitScript(
        (theme) => localStorage.setItem("hive-appearance", theme),
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
      await nav.getByRole("button", { name: "Projekte", exact: true }).click();
      await page
        .getByRole("button", { name: "Projekt erstellen", exact: true })
        .click();
      const dialog = page.getByRole("dialog", { name: "Neues Projekt" });
      await expect(dialog).toBeVisible();
      const size = await dialog.boundingBox();
      if (width === 1440) {
        expect(size.width).toBeGreaterThan(760);
        expect(size.width).toBeGreaterThan(size.height);
      } else {
        expect(size.width).toBeLessThanOrEqual(width);
      }
      await page.screenshot({
        path: `../../outputs/hive-project-form-${width}-${theme}.png`,
      });
      await page.keyboard.press("Escape");
      await page.getByRole("button", { name: "Board", exact: true }).click();
      const status = page.getByLabel("Status für Portraits für das neue Team");
      await expect(status).toHaveValue("planning");
      const planningColour = await status.evaluate(
        (node) => getComputedStyle(node).color,
      );
      await status.selectOption("active");
      await expect(status).toHaveValue("active");
      expect(
        await status.evaluate((node) => getComputedStyle(node).color),
      ).not.toBe(planningColour);
      await status.selectOption("planning");
      // Real browser drag and drop keeps the existing persistence path.
      if (width === 1440) {
        const card = page
          .locator(".hive-clean-project-card")
          .filter({ hasText: "Portraits für das neue Team" });
        await card.dragTo(
          page.locator(
            ".hive-project-column[data-status=active] header",
          ),
        );
        await expect(status).toHaveValue("active");
        await status.selectOption("planning");
      }
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBeTruthy();
      await page.screenshot({
        path: `../../outputs/hive-project-board-${width}-${theme}.png`,
        fullPage: true,
      });
      if(width<=760) {
        await nav.getByRole('button',{name:'Mehr',exact:true}).click();
        await page.getByRole('dialog').getByRole('button',{name:'Rechnungen',exact:true}).click();
      } else await nav.getByRole('button',{name:'Rechnungen',exact:true}).click();
      const paid = page.locator(".hive-status[data-state=paid]").first(),
        overdue = page.locator(".hive-status[data-state=overdue]").first();
      await expect(paid).toBeVisible();
      await expect(overdue).toBeVisible();
      expect(await paid.evaluate((n) => getComputedStyle(n).color)).not.toBe(
        await overdue.evaluate((n) => getComputedStyle(n).color),
      );
    });
