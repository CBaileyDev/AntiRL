import { test, expect } from "@playwright/test";

test("provider consent, cloud preview, external links, import failures, identity and viewer cameras", async ({
  page,
  baseURL,
}, testInfo) => {
  const base = baseURL!;
  await page.setViewportSize({ width: 1440, height: 1080 });
  const errors = [];
  const remote = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => {
    if (!r.url().startsWith(base) && !r.url().startsWith("data:")) remote.push(r.url());
  });
  await page.goto(`${base}/tests/security-fixture.html`);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByText("Offline coaching · no cloud provider selected")).toBeVisible();
  const provider = page.locator("select").filter({ has: page.locator('option[value="none"]') });
  await expect(provider).toHaveValue("none");
  await provider.selectOption("neotoken");
  await expect(
    page.getByText("Send coaching data to NeoToken (api.v2.neokens.com), a third-party provider"),
  ).toBeVisible();
  const consent = page.getByRole("checkbox").nth(1);
  await expect(consent).not.toBeChecked();
  await consent.check();
  await provider.selectOption("openai");
  await expect(consent).not.toBeChecked();
  await provider.selectOption("chatgpt");
  await expect(page.getByText("ChatGPT sign-in is unavailable:", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue with ChatGPT" })).toHaveCount(0);
  await provider.selectOption("none");
  await expect(consent).toBeDisabled();
  await page.screenshot({ path: testInfo.outputPath("offline-settings.png") });
  await provider.selectOption("openai");
  await consent.check();
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await page.getByRole("button", { name: "Coach Chat", exact: true }).click();
  await page.getByLabel("Message the coach").fill("Review this synthetic match");
  await page.getByLabel("Send message").click();
  await expect(page.getByRole("region", { name: "Cloud data and cost preview" })).toBeVisible();
  expect(
    await page.evaluate(() =>
      (window as unknown as { fixtureCalls: string[] }).fixtureCalls.includes("chat"),
    ),
  ).toBe(false);
  await expect(page.getByText(/12,000 estimated input characters/)).toBeVisible();
  await page.getByRole("button", { name: "Send to openai", exact: true }).click();
  await expect(page.getByText("Offline-safe fixture reply.", { exact: false })).toBeVisible();
  const before = page.url();
  await page.getByRole("link", { name: "Source", exact: true }).click();
  expect(page.url()).toBe(before);
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as unknown as { fixtureCalls: string[] }).fixtureCalls.includes(
          "plugin:opener|open_url",
        ),
      ),
    )
    .toBe(true);
  await page.getByRole("button", { name: "Replay Library", exact: true }).click();
  await page.getByText("Import results · 1 failed").click();
  await expect(page.getByText("Invalid replay header")).toBeVisible();
  await page.getByRole("button", { name: "Retry failed files" }).click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as unknown as { fixtureCalls: string[] }).fixtureCalls.includes(
          "retry_failed_imports",
        ),
      ),
    )
    .toBe(true);
  await page.getByRole("button", { name: /Fixture Player/ }).click();
  await expect(page.getByLabel("Confirm detected player")).toHaveValue("fixture:p");
  await page.screenshot({ path: testInfo.outputPath("identity.png") });
  await page.getByLabel("Close", { exact: true }).click();
  await page.setViewportSize({ width: 1024, height: 768 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(remote).toEqual([]);
  expect(errors).toEqual([]);
  await page.goto(`${base}/tests/viewer-fixture.html`);
  await expect(page.getByRole("button", { name: "Play replay" })).toBeEnabled({ timeout: 45000 });
  for (const name of ["Chase", "Ball Cam", "Broadcast", "Overhead", "Orbit"]) {
    await page.getByRole("button", { name, exact: true }).click();
    await expect(page.getByRole("button", { name, exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  }
  await page.getByRole("button", { name: "Play replay" }).click();
  await page.waitForTimeout(300);
  await page.getByRole("button", { name: "Pause replay" }).click();
  await page.getByLabel("Replay scrub bar").fill("32");
  await expect(page.locator(".score-side.blue .score-num")).toHaveText("1");
  await page.screenshot({ path: testInfo.outputPath("viewer.png") });
  expect(errors).toEqual([]);
});
