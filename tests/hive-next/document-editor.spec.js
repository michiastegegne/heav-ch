import { test, expect } from "@playwright/test";
async function login(page, appearance) {
  await page.addInitScript(
    (mode) => localStorage.setItem("hive-appearance", mode),
    appearance,
  );
  await page.goto("/login");
  await page.getByLabel("E-Mail", { exact: true }).fill("owner@example.test");
  await page.getByLabel("Passwort", { exact: true }).fill("test-password");
  await page.getByRole("button", { name: "Anmelden", exact: true }).click();
  await expect(
    page.getByText("Dein Studio auf einen Blick.", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Rechnungen", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Rechnung erstellen", exact: true })
    .click();
}
async function layout(page) {
  const measurements = await page
    .locator(".hive-document")
    .evaluate((editor) => {
      const fields = [
        ...editor.querySelectorAll("input,select,textarea,button"),
      ];
      const footer = editor
        .querySelector(".hive-document-footer")
        .getBoundingClientRect();
      const scroll = editor
        .querySelector(".hive-document-scroll")
        .getBoundingClientRect();
      return {
        outside: fields
          .filter((el) => {
            const r = el.getBoundingClientRect();
            return r.width > 0 && (r.left < -1 || r.right > innerWidth + 1);
          })
          .map((el) => el.outerHTML.slice(0, 100)),
        footerBottom: footer.bottom,
        scrollBottom: scroll.bottom,
        footerTop: footer.top,
        width: editor.scrollWidth,
        viewportWidth: innerWidth,
        height: innerHeight,
      };
    });
  expect(measurements.outside).toEqual([]);
  expect(measurements.width).toBeLessThanOrEqual(measurements.viewportWidth);
  expect(measurements.footerBottom).toBeLessThanOrEqual(
    measurements.height + 1,
  );
  expect(measurements.scrollBottom).toBeLessThanOrEqual(
    measurements.footerTop + 1,
  );
  await expect(
    page.getByRole("button", {
      name: "Rechnungsentwurf erstellen",
      exact: true,
    }),
  ).toBeInViewport();
}
for (const appearance of ["light", "dark"])
  for (const width of [320, 375, 390, 430, 768, 1024, 1440])
    test(`invoice composer has stable layout and saves all positions at ${width}px ${appearance}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: width < 768 ? 844 : 1000 });
      await login(page, appearance);
      let payload = null;
      await page.route("**/api/hive/invoices", async (route) => {
        if (route.request().method() !== "POST") return route.continue();
        payload = route.request().postDataJSON();
        await route.fulfill({ json: { ok: true } });
      });
      await layout(page);
      // A blank position must be validated as part of the same form as the save button.
      await page
        .getByRole("button", {
          name: "Rechnungsentwurf erstellen",
          exact: true,
        })
        .click();
      expect(payload).toBeNull();
      await expect(page.getByLabel("Position 1: Beschreibung")).toBeFocused();
      await page
        .getByLabel("Position 1: Beschreibung")
        .fill("Konzeption und Umsetzung");
      await page.getByLabel("Position 1: Menge").fill("2");
      await page.getByLabel("Position 1: Preis pro Einheit in CHF").fill("150");
      await page.getByLabel("Steuersatz %", { exact: true }).fill("8.1");
      await page.getByRole("button", { name: "Position hinzufügen" }).click();
      await expect(page.getByLabel("Position 2: Beschreibung")).toBeFocused();
      await page
        .getByLabel("Position 2: Beschreibung")
        .fill("Abstimmung und Übergabe");
      await page.getByLabel("Position 2: Preis pro Einheit in CHF").fill("150");
      await expect(page.locator(".hive-document-grand")).toContainText(
        "486.45",
      );
      await layout(page);
      if ([390, 1440].includes(width)) {
        await page
          .locator(".hive-document-scroll")
          .evaluate((el) => (el.scrollTop = 0));
        await page.screenshot({
          path: `../../outputs/hive-invoice-redesigned-${width}-${appearance}.png`,
        });
      }
      await page
        .getByRole("button", {
          name: "Rechnungsentwurf erstellen",
          exact: true,
        })
        .click();
      await expect(page.getByRole("dialog")).toHaveCount(0);
      expect(payload.taxRate).toBe(8.1);
      expect(payload.items).toEqual([
        {
          description: "Konzeption und Umsetzung",
          quantity: 2,
          unitPriceRappen: 15000,
        },
        {
          description: "Abstimmung und Übergabe",
          quantity: 1,
          unitPriceRappen: 15000,
        },
      ]);
    });

test("failed save keeps the draft editable and keyboard focus stays in the editor", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 667 });
  await login(page, "dark");
  await page.getByLabel("Position 1: Beschreibung").fill("Nicht verlieren");
  await page.route("**/api/hive/invoices", (route) =>
    route.fulfill({
      status: 500,
      json: { error: "Test: Speichern fehlgeschlagen" },
    }),
  );
  await page
    .getByRole("button", { name: "Rechnungsentwurf erstellen", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByLabel("Position 1: Beschreibung")).toHaveValue(
    "Nicht verlieren",
  );
  await expect(
    page.getByRole("button", {
      name: "Rechnungsentwurf erstellen",
      exact: true,
    }),
  ).toBeEnabled();
  await layout(page);
  await page
    .getByRole("button", { name: "Rechnungsentwurf erstellen", exact: true })
    .focus();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("dialog").getByRole("button", { name: "Schliessen", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
