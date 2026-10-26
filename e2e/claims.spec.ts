import { expect, test, type Page } from "@playwright/test";

const PRIME = 257;
const mod = (value: number): number => ((value % PRIME) + PRIME) % PRIME;

async function run(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Run with fresh masks" }).click();
  await expect(page.locator("#status")).toContainText("independently checked");
}

async function setNumber(page: Page, id: string, value: number): Promise<void> {
  const input = page.locator(`#${id}`);
  await input.fill(String(value));
}

test.beforeEach(async ({ page }) => {
  await page.goto(".");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Hostile Paths",
  );
  await expect(page.locator("#status")).toContainText("independently checked");
});

test("default transcript is a real degree-one word and both decoders recover", async ({
  page,
}) => {
  const rows = page.locator("#path-table tbody tr");
  await expect(rows).toHaveCount(4);
  const values = await rows.evaluateAll((items) =>
    items.map((row) =>
      [...row.querySelectorAll("td")].map(
        (cell) => cell.textContent?.trim() ?? "",
      ),
    ),
  );
  const sent = values.map((row) => Number(row[3]));
  const slope = mod(sent[1]! - sent[0]!);
  const recoveredConstant = mod(sent[0]! - slope);
  expect(recoveredConstant, "independent interpolation at x=0").toBe(42);
  sent.forEach((value, index) => {
    expect(value, `sender value on path ${index + 1}`).toBe(
      mod(recoveredConstant + slope * (index + 1)),
    );
  });
  expect(values[0]![1]).toBe("modify");
  expect(Number(values[0]![4])).toBe(mod(sent[0]! + 1));
  expect(values[1]![1]).toBe("honest");
  await expect(page.locator("#privacy-candidates")).toHaveText("257");
  await expect(page.locator("#privacy-completions")).toHaveText("1");
  await expect(page.locator("#naive-result")).toContainText("wrong");
  await expect(page.locator("#psmt-result")).toHaveText("recovered 42");
  await expect(page.locator("#oracle-result")).toHaveText("recovered 42");
  await expect(page.locator("#bound-left")).toHaveText("2·1 + 0 = 2");
  await expect(page.locator("#bound-right")).toHaveText("n − (t+1) = 2");
  await expect(
    page.locator('[data-verdict="universal-guarantee"]'),
  ).toBeVisible();
});

test("changed inputs retire old evidence before a fresh run", async ({
  page,
}) => {
  await expect(page.locator("#psmt-result")).toHaveText("recovered 42");
  await setNumber(page, "message", 77);
  await expect(page.locator('[data-verdict="stale"]')).toContainText(
    "Evidence retired",
  );
  await expect(page.locator("#evidence-body")).not.toContainText(
    "recovered 42",
  );
  await run(page);
  await expect(page.locator("#psmt-result")).toHaveText("recovered 77");
  await expect(page.locator("#oracle-result")).toHaveText("recovered 77");
});

test("mixed error and erasure satisfy the exact t=2 correction inequality", async ({
  page,
}) => {
  await setNumber(page, "budget", 2);
  await setNumber(page, "message", 200);
  await setNumber(page, "modify-count", 1);
  await setNumber(page, "drop-count", 1);
  await setNumber(page, "observe-count", 0);
  await run(page);
  await expect(page.locator("#path-table tbody tr")).toHaveCount(7);
  await expect(page.locator("#psmt-result")).toHaveText("recovered 200");
  await expect(page.locator("#oracle-result")).toHaveText("recovered 200");
  await expect(page.locator("#bound-left")).toHaveText("2·1 + 1 = 3");
  await expect(page.locator("#bound-right")).toHaveText("n − (t+1) = 4");
  await expect(page.locator("#privacy-candidates")).toHaveText("257");
});

test("three one-way paths expose ambiguity and withdraw the guarantee", async ({
  page,
}) => {
  await setNumber(page, "path-count", 3);
  await run(page);
  await expect(page.locator("#planner-required")).toHaveText("4");
  await expect(page.locator('[data-verdict="planner"]')).toContainText(
    "No perfect guarantee",
  );
  await expect(page.locator("#psmt-result")).toContainText("REFUSED");
  await expect(
    page.locator('[data-verdict="guarantee-withdrawn"]'),
  ).toBeVisible();

  const witness = await page
    .locator("#ambiguity-table tbody tr")
    .evaluateAll((rows) =>
      rows.map((row) =>
        [...row.querySelectorAll("td")].map(
          (cell) => cell.textContent?.trim() ?? "",
        ),
      ),
    );
  expect(witness).toEqual([
    ["secret 10, slope 20", "30", "50", "70", "1"],
    ["secret 11, slope 19", "30", "49", "68", "1"],
    ["received", "30", "50", "68", "—"],
  ]);
});

test("two-round feedback shows the 2t+1 theorem boundary but executes no fake protocol", async ({
  page,
}) => {
  await setNumber(page, "path-count", 3);
  await page.locator("#rounds").selectOption("2");
  await page.locator("#feedback").check();
  await expect(page.locator("#planner-required")).toHaveText("3");
  await expect(page.locator('[data-verdict="planner"]')).toContainText(
    "different protocol required",
  );
  await page.getByRole("button", { name: "Run with fresh masks" }).click();
  await expect(page.locator('[data-verdict="not-executed"]')).toContainText(
    "Selected protocol not executed",
  );
  await expect(page.locator("#path-table")).toHaveCount(0);
  await expect(page.locator("#status")).toContainText("different construction");
});

test("one-round feedback is rejected as an invalid round model", async ({
  page,
}) => {
  await page.locator("#feedback").check();
  await expect(page.locator('[data-verdict="planner"]')).toContainText(
    "Invalid round model",
  );
  await expect(page.locator('[data-verdict="planner"]')).toContainText(
    "cannot occur inside a single",
  );
});

test("more than t observations reveal the exact secret and withdraw privacy", async ({
  page,
}) => {
  await setNumber(page, "modify-count", 0);
  await setNumber(page, "observe-count", 2);
  await run(page);
  await expect(page.locator("#privacy-candidates")).toHaveText("1");
  await expect(page.locator("#privacy-completions")).toHaveText("1");
  await expect(page.locator('[data-verdict="privacy"]')).toContainText(
    "leaks message information",
  );
  await expect(page.locator("#psmt-result")).toHaveText("recovered 42");
  await expect(
    page.locator('[data-verdict="guarantee-withdrawn"]'),
  ).toBeVisible();
});

test("invalid action totals release no stale protocol result", async ({
  page,
}) => {
  await setNumber(page, "observe-count", 2);
  await setNumber(page, "modify-count", 2);
  await setNumber(page, "drop-count", 1);
  await page.getByRole("button", { name: "Run with fresh masks" }).click();
  await expect(page.locator("#error")).toContainText("path actions exceed");
  await expect(page.locator('[data-verdict="input-rejected"]')).toBeVisible();
  await expect(page.locator("#psmt-result")).toHaveCount(0);
});

test("source and limitation claims remain explicit", async ({ page }) => {
  await expect(
    page.getByText("does not establish physical path independence", {
      exact: false,
    }),
  ).toBeVisible();
  await expect(
    page.getByText("does not claim to execute", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByText("not constant-time", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: /Towards Optimal/ }),
  ).toHaveAttribute("href", "https://harsha-simhadri.org/pubs/tcc07-FFGH.pdf");
});
