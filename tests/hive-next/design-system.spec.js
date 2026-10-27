import { navigate, openNavigation } from "./navigation.mjs";
import { test, expect } from "@playwright/test";
for (const theme of ["light", "dark"])
  for (const width of [320, 390, 688, 768, 1440])
    test(`customer directory and actions work at ${width}px ${theme}`, async ({
      page,
    }) => {
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.addInitScript(
        (theme) => localStorage.setItem("hive-appearance", theme),
        theme,
      );
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/login");
      await page
        .getByLabel("E-Mail", { exact: true })
        .fill("owner@example.test");
      await page.getByLabel("Passwort", { exact: true }).fill("test-password");
      await page.getByRole("button", { name: "Anmelden", exact: true }).click();
      await expect(page.locator(".crm-metrics button")).toHaveCount(4);
      const nav = await openNavigation(page);
      await navigate(page,"Kunden");
      const directory = page.getByRole("region", { name: "Kundenverzeichnis" });
      await expect(
        directory.getByRole("button", { name: "Nordkunde", exact: true }),
      ).toBeVisible();
      const search = directory.getByRole("textbox", {
        name: "Liste durchsuchen",
      });
      await search.fill("unauffindbarer kunde");
      await expect(
        directory.getByRole("heading", { name: "Keine passenden Kunden" }),
      ).toBeVisible();
      await directory
        .getByRole("button", { name: "Suche zurücksetzen" })
        .click();
      await expect(search).toHaveValue("");
      const menuButton = directory.getByRole("button", {
        name: "Aktionen für Nordkunde",
      });
      await menuButton.click();
      await expect(
        page.getByRole("menuitem", { name: "Bearbeiten", exact: true }),
      ).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(menuButton).toBeFocused();
      await menuButton.click();
      await page
        .getByRole("menuitem", { name: "Bearbeiten", exact: true })
        .click();
      await expect(
        page.getByRole("dialog", { name: "Kunde bearbeiten" }),
      ).toBeVisible();
      await expect(page.getByLabel("Firma", { exact: true })).toHaveValue(
        "Nordkunde",
      );
      await page.keyboard.press("Escape");
      await directory
        .getByRole("button", { name: "Kundenakte", exact: true })
        .click();
      const detail = page.getByRole("dialog", { name: "Workspace Details" });
      await expect(
        detail.getByRole("heading", { name: "Nordkunde", exact: true }),
      ).toBeVisible();
      const sections=detail.getByRole('tablist',{name:'Kundenakte Bereiche'});
      await sections.getByRole('tab',{name:'Projekte',exact:true}).click();
      await expect(detail.getByRole('tabpanel',{name:'Projekte',exact:true})).toBeVisible();
      await sections.getByRole('tab',{name:'Kontakt',exact:true}).click();
      await page.keyboard.press('End');
      await expect(sections.getByRole('tab',{name:'Verlauf',exact:true})).toHaveAttribute('aria-selected','true');
      await page.keyboard.press('Home');
      await expect(sections.getByRole('tab',{name:'Kontakt',exact:true})).toHaveAttribute('aria-selected','true');
      if (width === 688)
        expect(
          await detail
            .locator(".hive-customer-metrics")
            .evaluate(
              (node) =>
                getComputedStyle(node).gridTemplateColumns.split(" ").length,
            ),
        ).toBe(2);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBeTruthy();
      await page.keyboard.press("Escape");
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBeTruthy();
      const tooSmall = await directory
        .locator("button:visible")
        .evaluateAll((nodes) =>
          nodes
            .filter((node) => {
              const r = node.getBoundingClientRect();
              return r.height < 43 || r.width < 43;
            })
            .map((node) => node.textContent),
        );
      // Customer names are inline links; primary controls are all 44px.
      expect(tooSmall.filter((text) => text !== "Nordkunde")).toEqual([]);
      expect(errors).toEqual([]);
      await page.screenshot({
        path: `../../outputs/hive-system-customers-${width}-${theme}.png`,
        animations: "disabled",
      });
    });
