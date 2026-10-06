import { test, expect } from "@playwright/test";
test("practice transfer workflow, missing telemetry, edits, skips, manual dates and narrow layout", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/tests/transfer-fixture.html");
  await expect(page.getByText("Choose a saved plan above", { exact: false })).toBeVisible();
  await page.getByText("Track this cue in matches", { exact: true }).click();
  await page.getByLabel("Replay measurement for Small pad route").selectOption("avg_boost");
  await expect(page.getByRole("button", { name: "Start tracking", exact: true })).toBeDisabled();
  await page.getByLabel("Reference match for Small pad route").selectOption("before");
  await page.getByRole("button", { name: "Start tracking", exact: true }).click();
  await expect(
    page.getByText("Waiting for practice with a known completion time.", { exact: false }),
  ).toBeVisible();
  await page.getByLabel("Completed minutes for Small pad route").fill("5");
  await page.getByLabel("Practice completed at for Small pad route").fill("2026-01-01T19:00");
  await page.getByLabel("Completion offset for Small pad route").selectOption("-300");
  await page.getByRole("button", { name: "Record practice", exact: true }).click();
  await expect(
    page.getByText("1 of 2 selected matches have usable measurements.", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Replay measurement: Unknown", { exact: false })).toBeVisible();
  const first = page
    .locator(".transfer-checkin")
    .filter({ has: page.getByText("after-one.replay", { exact: true }) });
  await first.getByLabel("Cue use for after-one.replay").selectOption("used");
  await first.getByLabel("Transfer notes for after-one.replay").fill("Small-pad route once");
  await first.getByRole("button", { name: "Save check-in", exact: true }).click();
  await expect(first.getByText("Saved locally · Used the cue", { exact: true })).toBeVisible();
  await first.getByLabel("Cue use for after-one.replay").selectOption("missed");
  await first.getByRole("button", { name: "Update check-in", exact: true }).click();
  await expect(
    first.getByText("Saved locally · Had a chance but missed it", { exact: true }),
  ).toBeVisible();
  await first.getByRole("button", { name: "Open replay", exact: true }).click();
  await expect(page.getByLabel("Opened replay")).toHaveText("after-one");
  const missing = page
    .locator(".transfer-checkin")
    .filter({ has: page.getByText("after-missing.replay", { exact: true }) });
  await missing.getByRole("button", { name: "Skip this match", exact: true }).click();
  await expect(
    page.getByText("All selected matches reviewed or skipped", { exact: false }),
  ).toBeVisible();
  await expect(missing.getByLabel("Cue use for after-missing.replay")).toHaveValue("skipped");
  await page
    .getByText("Manual check-ins · 1 matches with unclear chronology", { exact: true })
    .click();
  const manual = page
    .locator(".transfer-checkin")
    .filter({ has: page.getByText("unclear-date.replay", { exact: true }) });
  await manual.getByLabel("Cue use for unclear-date.replay").selectOption("unsure");
  await manual.getByRole("button", { name: "Save check-in", exact: true }).click();
  await expect(manual.getByText("Saved locally · Unsure", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Toggle save failure" }).click();
  await first.getByRole("button", { name: "Update check-in", exact: true }).click();
  await expect(page.locator(".practice-panel [role=status]")).toContainText(
    "Synthetic save failure",
  );
  await page.screenshot({ path: "test-results/transfer-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 600, height: 1000 });
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    .toBe(true);
  await first.getByLabel("Cue use for after-one.replay").focus();
  await page.keyboard.press("Tab");
  await expect(first.getByLabel("Transfer notes for after-one.replay")).toBeFocused();
  await page.screenshot({ path: "test-results/transfer-narrow.png", fullPage: true });
  const calls = await page.evaluate(
    () =>
      (window as unknown as { fixtureCalls: { command: string; args: Record<string, unknown> }[] })
        .fixtureCalls,
  );
  expect(calls.find((c) => c.command === "record_training")?.args.completedAt).toBe(
    "2026-01-02T00:00:00.000Z",
  );
  expect(calls.find((c) => c.command === "start_transfer")?.args).toMatchObject({
    mode: "2v2",
    planId: "plan",
    metricKey: "avg_boost",
    referenceReplayId: "before",
    replayOffsetMinutes: null,
  });
  expect(errors).toEqual([]);
  await page.getByRole("button", { name: "Switch mode", exact: true }).click();
  await expect(page.getByText("Choose a saved plan above", { exact: false })).toBeVisible();
  await expect(page.getByText("Replay measurement · Average boost", { exact: true })).toHaveCount(
    0,
  );
});
