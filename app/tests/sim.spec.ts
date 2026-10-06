import { test, expect } from "@playwright/test";

type Fx = {
  calls: { command: string; args: Record<string, unknown> }[];
  flags: Record<string, unknown>;
};

test("bot-likeness shows signals, confounders, labels and an uncalibrated report", async ({
  page,
}) => {
  await page.goto("/tests/sim-fixture.html");
  await page.getByText("Bot detection · local bot-likeness index").click();
  await expect(page.getByLabel("Bot-likeness index for Me")).toHaveText("Index 63.5 / 100");
  await expect(page.getByText("not calibrated", { exact: false }).first()).toBeVisible();
  await expect(page.getByText("Controller input was not captured")).toBeVisible();
  await page.getByText("Signals and confounders").click();
  await expect(page.getByRole("cell", { name: "unavailable" })).toBeVisible();
  await page.getByText("Confounders and limits (1)").first().click();
  await expect(page.getByText("Keyboard, d-pad", { exact: false }).first()).toBeVisible();
  await page.getByLabel("Label Me").selectOption("human");
  await expect(page.getByText("Labels are your own confirmations", { exact: false })).toBeVisible();
  const call = await page.evaluate(() =>
    (window as unknown as Fx).calls.find((c) => c.command === "set_bot_label"),
  );
  expect(call?.args).toMatchObject({ replayId: "a", playerId: "steam:1", confirmedBot: false });
  await page.getByRole("button", { name: "Show label calibration report" }).click();
  await expect(page.getByText("insufficient labels")).toBeVisible();
  await expect(page.getByText("at least 10 of each are required", { exact: false })).toBeVisible();
  await expect(page.getByText("probability that anyone cheated", { exact: false })).toBeVisible();
});

test("xG states unavailable with a reason, then shows per-shot values when the model passes", async ({
  page,
}) => {
  await page.goto("/tests/sim-fixture.html");
  await page.getByText("Shots · expected goals (xG)").click();
  await expect(page.getByText("xG unavailable.", { exact: false })).toBeVisible();
  await expect(page.getByText("at least 150 are required").first()).toBeVisible();
  await expect(
    page.getByRole("table", { name: "Shots with xG" }).getByText("unavailable"),
  ).toBeVisible();
  await page.getByText("Expected goals (xG) · library shot model").click();
  await expect(page.getByText("Model unavailable")).toBeVisible();
  await expect(page.getByText("Decision xG (value of positioning", { exact: false })).toBeVisible();

  await page.goto("/tests/sim-fixture.html");
  await page.evaluate(() => ((window as unknown as Fx).flags.xgAvailable = true));
  await page.getByText("Shots · expected goals (xG)").click();
  await expect(page.getByRole("cell", { name: "0.31" })).toBeVisible();
  await expect(page.getByText("no geometry")).toBeVisible();
  await expect(page.getByText("Not a population probability", { exact: false })).toBeVisible();
});

test("counterfactual gates by mode, refuses honestly, and plots simulated vs actual", async ({
  page,
}) => {
  await page.goto("/tests/sim-fixture.html");
  await page.getByText("Counterfactual · trained-policy simulation").click();
  await expect(page.getByText("Simulation, not a prediction.", { exact: false })).toBeVisible();
  const run = page.getByRole("button", { name: "Run simulation" });
  await expect(run).toBeEnabled();
  await run.click();
  await expect(page.getByLabel("Simulation result")).toContainText("unknown skill, not a model of any player");
  await expect(page.getByTestId("sim-rollout-note")).toContainText(
    "not a recommendation, not what would have happened",
  );
  await expect(page.getByTestId("actual-ball")).toBeAttached();
  await expect(page.getByTestId("sim-ball")).toBeAttached();
  await expect(
    page.getByText("Ball position gap at the end of the run", { exact: false }),
  ).toBeVisible();
  await expect(page.getByText("measured skill: none", { exact: false })).toBeVisible();
  await expect(page.getByText("Unquantified", { exact: false })).toBeVisible();

  await page.evaluate(() => ((window as unknown as Fx).flags.refuse = true));
  await run.click();
  await expect(page.getByRole("alert")).toContainText("Simulation refused");
  await expect(page.getByRole("alert")).toContainText("limits 150 / 60");
  await expect(page.getByTestId("sim-ball")).toHaveCount(0);

  await page.getByLabel("Counterfactual steps").fill("9999");
  await expect(run).toBeDisabled();

  await page.goto("/tests/sim-fixture.html");
  await page.evaluate(() => ((window as unknown as Fx).flags.modes = ["1v1"]));
  await page.getByText("Counterfactual · trained-policy simulation").click();
  await expect(
    page.getByText("no compatible checkpoint (available: 1v1)", { exact: false }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Run simulation" })).toBeDisabled();
});

test("RLTRAIN_2 path setting validates through the backend and reports the source", async ({
  page,
}) => {
  await page.goto("/tests/sim-fixture.html");
  await expect(page.getByText("default (not configured)", { exact: false })).toBeVisible();
  await page.getByLabel("RLTRAIN_2 folder").fill("D:\\RLTRAIN_2");
  await page.getByRole("button", { name: "Validate and save" }).click();
  await expect(page.getByText("Location source: configured", { exact: false })).toBeVisible();
  await page.setViewportSize({ width: 600, height: 1000 });
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    .toBe(true);
});
