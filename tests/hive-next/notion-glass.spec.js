import { test, expect } from "@playwright/test";
for (const theme of ["light", "dark"])
  for (const width of [390, 1440])
    test(`Notion workspace and installed glass controls work at ${width}px ${theme}`, async ({
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
        await expect(nav).toHaveClass(/ogui-dock/);
        await expect(nav).toHaveAttribute("data-ogui-glass", "");
      }
      await page.screenshot({
        path: `../../outputs/hive-notion-overview-${width}-${theme}.png`,
      });
      await nav.getByRole("button", { name: "Projekte", exact: true }).click();
      const views = page.getByRole("group", { name: "Projektansicht" });
      await expect(views).toHaveClass(/ogui-segments/);
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
        path: `../../outputs/hive-notion-board-${width}-${theme}.png`,
      });
      await page
        .getByRole("button", {
          name:
            theme === "light"
              ? "Dunklen Modus aktivieren"
              : "Hellen Modus aktivieren",
        })
        .click();
      await expect(
        page.locator(".hive-material-scope").first(),
      ).toHaveAttribute(
        "data-ogui-appearance",
        theme === "light" ? "dark" : "light",
      );
      expect(errors).toEqual([]);
    });
