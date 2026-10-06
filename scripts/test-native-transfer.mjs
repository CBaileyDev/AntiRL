// Operates only on the isolated transfer-native database snapshot, with cloud disabled.
import {
  chromium,
  expect,
} from "../app/node_modules/@playwright/test/index.mjs";
import { writeFile } from "node:fs/promises";
const browser = await chromium.connectOverCDP("http://127.0.0.1:49187");
try {
  const page = browser.contexts()[0].pages()[0];
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.waitForFunction(() => !!window.__TAURI_INTERNALS__);
  const call = (name, args = {}) =>
    page.evaluate(
      ({ name, args }) => window.__TAURI_INTERNALS__.invoke(name, args),
      { name, args },
    );
  const settings = await call("get_settings");
  if (!settings.player_id)
    throw new Error(
      "Isolated snapshot requires the already confirmed player identity",
    );
  await call("save_settings", {
    settings: {
      ...settings,
      provider: "none",
      cloud_consent: false,
      auto_import: false,
      onboarding_status: "skipped",
    },
  });
  const plan = await call("save_practice_plan", {
    mode: "2v2",
    body: {
      title: "Synthetic transfer QA",
      drill: "Five pad routes",
      success_criterion: "Five controlled routes",
      next_match_cue: "Use pads on recovery",
      intended_minutes: 5,
      pack_id: null,
    },
  });
  await call("record_training", {
    mode: "2v2",
    planId: plan.id,
    minutes: 5,
    difficulty: "appropriate",
    notes: "",
    completedAt: "2000-01-01T00:00:00Z",
  });
  const options = (await call("get_practice", { mode: "2v2" })).transfer
    .match_options;
  const reference = options.find((m) => m.context && !m.eligibility_note);
  if (!reference) throw new Error("No eligible 2v2 reference in isolated copy");
  await call("start_transfer", {
    mode: "2v2",
    planId: plan.id,
    metricKey: "avg_boost",
    referenceReplayId: reference.replay_id,
    replayOffsetMinutes: -240,
  });
  const data = await call("get_practice", { mode: "2v2" });
  const cycle = data.transfer.cycles.find((c) => c.active);
  expect(cycle.anchor_at).toBe("2000-01-01T00:00:00+00:00");
  expect(cycle.after.selected_count).toBeGreaterThan(0);
  expect(cycle.after.selected_count).toBeLessThanOrEqual(10);
  expect(cycle.after.valid_count).toBe(0);
  expect(cycle.after.value).toBeNull();
  expect(cycle.after.excluded.incompatible_metric_version).toBeGreaterThan(0);
  expect(cycle.before.value).toBeNull();
  expect(cycle.delta).toBeNull();
  await page.reload();
  await page
    .getByRole("button", { name: "Progress & Goals", exact: true })
    .click();
  await expect(
    page.getByText("Synthetic transfer QA · Active tracking", { exact: true }),
  ).toBeVisible();
  const card = page.locator(".transfer-checkin").first();
  await card.getByRole("combobox").selectOption("used");
  await card
    .getByRole("textbox")
    .fill("Synthetic isolated local transfer reflection");
  await card
    .getByRole("button", { name: "Save check-in", exact: true })
    .click();
  await expect(
    card.getByText("Saved locally · Used the cue", { exact: true }),
  ).toBeVisible();
  const saved = await call("get_practice", { mode: "2v2" });
  expect(saved.transfer.cycles.find((c) => c.active).checkins[0].state).toBe(
    "used",
  );
  const cloud = await call("evidence_tool", {
    mode: "2v2",
    tool: "get_training_history",
    args: {},
  });
  expect(JSON.stringify(cloud)).not.toContain(
    "Synthetic isolated local transfer reflection",
  );
  expect(cloud.transfer).toBeUndefined();
  await page.screenshot({ path: ".local/transfer-native/transfer-native.png" });
  await card.getByRole("button", { name: "Open replay", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Player telemetry", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Progress & Goals", exact: true })
    .click();
  await expect(
    page
      .locator(".transfer-checkin")
      .first()
      .getByText("Saved locally · Used the cue", { exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
  await writeFile(
    "docs/validation/transfer-native.json",
    JSON.stringify(
      {
        status: "PASS",
        fixture:
          "isolated copy of local replay library; synthetic practice and reflection",
        checks: [
          "release WebView IPC and schema-5 migration",
          "known context and explicit offset window selection",
          "legacy metric versions correctly remain unknown",
          "native check-in form writes SQLite",
          "reflection retained across navigation",
          "real Replay Studio navigation",
          "cloud retrieval excludes transfer payload",
          "no WebView page errors",
        ],
        selected_after: cycle.after.selected_count,
        valid_after: cycle.after.valid_count,
      },
      null,
      2,
    ),
  );
  console.log(
    "PASS: isolated native transfer migration, IPC, form persistence, replay navigation and cloud boundary",
  );
} finally {
  await browser.close();
}
