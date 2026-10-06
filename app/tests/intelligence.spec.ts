import { test, expect } from "@playwright/test";
test("intelligence reviews, library query, camera, reference and external score boundaries", async ({
  page,
}) => {
  await page.goto("/tests/intelligence-fixture.html");
  await expect(page.getByText("2 candidates / 2 matches", { exact: false })).toBeVisible();
  const drill = page.getByRole("button", { name: "Create weekly drill" });
  await expect(drill).toBeDisabled();
  await page.getByLabel("Review a.replay goal").selectOption("mistake");
  await page.getByLabel("Review b.replay goal").selectOption("mistake");
  await expect(drill).toBeEnabled();
  await drill.click();
  await expect(page.getByLabel("Drills created")).toHaveText("1");
  await page.getByRole("button", { name: "Toggle review failure" }).click();
  await page.getByLabel("Review a.replay goal").selectOption("unsure");
  await expect(
    page.getByRole("status").filter({ hasText: "Synthetic review save failure" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Search library", exact: true }).click();
  await expect(
    page.getByText("2 matches to your query across 30 replays.", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "a.replay · 0:10", exact: false }).click();
  await expect(page.getByLabel("Opened source")).toHaveText("a:7");
  await page.getByRole("button", { name: "Switch mode" }).click();
  await expect(page.getByText("0 matches to your query", { exact: false })).toBeVisible();
  await page.getByText("Your replay camera · your recorded replay camera", { exact: true }).click();
  await expect(page.getByLabel("Applied camera")).toHaveText("100");
  await page.getByLabel("Camera Field of view").fill("105");
  await page.getByRole("button", { name: "Save camera", exact: true }).click();
  await expect(page.getByLabel("Applied camera")).toHaveText("105");
  await page.getByText("Compare a reference replay", { exact: true }).click();
  await page.getByLabel("Reference ghost replay").selectOption("b");
  await page.getByLabel("Reference rank (self-reported)").fill("GC1");
  await page.getByRole("button", { name: "Show reference ghost", exact: true }).click();
  await expect(page.getByLabel("Recorded reference ghost overlay")).toBeVisible();
  await expect(page.getByText("Decision xG: unavailable", { exact: false })).toBeVisible();
  await page.getByText("Bot detection · external reports", { exact: true }).click();
  await page.getByLabel("External score (%)").fill("72");
  await page.getByLabel("Detector version").fill("1.8.2");
  await page.getByLabel("Result URL").fill("https://whosbotting.com/result/test");
  await page.getByRole("button", { name: "Save external result" }).click();
  await expect(page.getByRole("link", { name: "72% external score", exact: false })).toBeVisible();
  await page.screenshot({ path: "test-results/intelligence-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 600, height: 1000 });
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    .toBe(true);
  await page.screenshot({ path: "test-results/intelligence-narrow.png", fullPage: true });
});
