import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const widths = [1280, 320] as const;

async function assertNoOverflow(page: Page, label: string): Promise<void> {
  const overflow = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    page: document.documentElement.scrollWidth,
  }));
  expect(overflow.page, `${label}: document must reflow`).toBeLessThanOrEqual(
    overflow.viewport + 1,
  );
}

async function scan(page: Page, label: string): Promise<void> {
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(result.violations, `${label}: axe violations`).toEqual([]);
  await assertNoOverflow(page, label);
  const obscured = await page.evaluate(() =>
    [
      ...document.querySelectorAll<HTMLElement>(
        "button,input,select,a[href],[tabindex='0']",
      ),
    ]
      .filter((item) => item.offsetParent !== null)
      .filter((item) => {
        const rect = item.getBoundingClientRect();
        return rect.width < 1 || rect.height < 1 || rect.right > innerWidth + 1;
      })
      .map((item) => `${item.tagName.toLowerCase()}#${item.id}`),
  );
  expect(obscured, `${label}: interactive controls remain measurable`).toEqual(
    [],
  );
}

for (const width of widths) {
  test(`accessibility and reflow at ${width}px across result states`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
    await page.goto(".");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page.locator("main")).toHaveCount(1);
    await expect(page.locator("header.cl-topbar")).toHaveCount(1);
    await expect(page.locator("#status")).toHaveAttribute(
      "aria-live",
      "polite",
    );
    await scan(page, `${width}px default`);

    await page.locator("#message").fill("77");
    await expect(page.locator('[data-verdict="stale"]')).toBeVisible();
    await scan(page, `${width}px stale`);

    await page.locator("#rounds").selectOption("2");
    await page.locator("#feedback").check();
    await page.getByRole("button", { name: "Run with fresh masks" }).click();
    await expect(page.locator('[data-verdict="not-executed"]')).toBeVisible();
    await scan(page, `${width}px interactive-boundary`);

    await page.locator("#rounds").selectOption("1");
    await page.locator("#feedback").uncheck();
    await page.locator("#observe-count").fill("16");
    await page.getByRole("button", { name: "Run with fresh masks" }).click();
    await expect(page.locator("#error")).not.toBeEmpty();
    await scan(page, `${width}px rejected`);
    expect(errors).toEqual([]);
  });
}

test("keyboard route reaches the run control and activates it", async ({
  page,
}) => {
  await page.goto(".");
  await page.locator("body").press("Tab");
  await expect(page.locator(".skip-link")).toBeFocused();
  let reached = false;
  for (let index = 0; index < 16; index += 1) {
    await page.keyboard.press("Tab");
    if (
      await page
        .locator("#run")
        .evaluate((button) => button === document.activeElement)
    ) {
      reached = true;
      break;
    }
  }
  expect(reached).toBe(true);
  await page.locator("#message").fill("99");
  await page.locator("#run").focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#psmt-result")).toHaveText("recovered 99");
});
