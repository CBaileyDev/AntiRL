import { test, expect } from "@playwright/test";
test("typed practice actions preserve mode isolation and malformed evidence fails visibly", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/tests/evidence-fixture.html");
  await page.getByText("Browse imported evidence", { exact: true }).click();
  await page.getByRole("button", { name: "Load personal history" }).click();
  await expect(page.getByText("2v2 · original-name.replay")).toBeVisible();
  await page.getByRole("button", { name: "Inspect metrics" }).click();
  await expect(page.getByRole("cell", { name: "42 boost" })).toBeVisible();
  await page.getByRole("button", { name: "Malformed metric response" }).click();
  await page.getByRole("button", { name: "Inspect metrics" }).click();
  await expect(page.getByText("A metric in the evidence response is invalid.")).toBeVisible();
  await expect(page.getByRole("cell", { name: "42 boost" })).toHaveCount(0);
  await page.getByText("Add a practice plan", { exact: true }).click();
  await page.getByLabel("Practice priority").fill("Synthetic recovery");
  await page.getByLabel("Drill setup").fill("Land with wheels aligned");
  await page.getByLabel("Success criterion").fill("Record five clean attempts");
  await page.getByLabel("Next-match cue").fill("Review one safe recovery");
  await page.getByLabel("Planned minutes").fill("5");
  await page.getByRole("button", { name: "Save practice plan" }).click();
  await expect(page.getByRole("heading", { name: "Synthetic recovery" })).toBeVisible();
  await page.getByLabel("Completed minutes for Synthetic recovery").fill("4");
  await page.getByRole("button", { name: "Record practice", exact: true }).click();
  await expect(page.getByText("Recent practice · 1 recorded sessions")).toBeVisible();
  await page.getByRole("button", { name: "Switch practice mode" }).click();
  await expect(page.getByText("No saved plans yet.", { exact: false })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Synthetic recovery" })).toHaveCount(0);
  const calls = await page.evaluate(
    () =>
      (window as unknown as { fixtureCalls: { command: string; args: Record<string, unknown> }[] })
        .fixtureCalls,
  );
  const record = calls.find((c) => c.command === "record_training")!;
  expect(record.args.planId).toBe("plan-0");
  expect(record.args.plan_id).toBeUndefined();
  const evidence = calls.find(
    (c) => c.command === "evidence_tool" && c.args.tool === "get_match_metrics",
  )!;
  expect(evidence.args.args).toEqual({ replay_id: "synthetic:replay" });
  const plan = calls.find((c) => c.command === "save_practice_plan")!;
  expect(plan.args.body).toMatchObject({
    intended_minutes: 5,
    next_match_cue: "Review one safe recovery",
  });
  expect(errors).toEqual([]);
});
