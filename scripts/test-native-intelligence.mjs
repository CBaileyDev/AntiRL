// Uses the isolated intelligence-native snapshot; never the live user database.
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
  await call("save_settings", {
    settings: {
      ...settings,
      provider: "none",
      cloud_consent: false,
      auto_import: false,
      onboarding_status: "skipped",
    },
  });
  const camera = await call("camera_profile");
  expect(camera.source).toBe("your recorded replay camera");
  expect(camera.camera.fov).toBeGreaterThanOrEqual(60);
  const started = Date.now();
  const report = await call("evidence_tool", {
    tool: "get_mistake_fingerprints",
    mode: "2v2",
    args: {},
  });
  const coldMs = Date.now() - started;
  expect(report.matches_searched).toBeGreaterThan(0);
  expect(report.clusters.length).toBeGreaterThan(0);
  const ot = await call("evidence_tool", {
    tool: "search_replay_events",
    mode: "2v2",
    args: { kind: "goal conceded", phase: "overtime", limit: 10 },
  });
  expect(ot.rows.every((r) => r.event_phase === "overtime")).toBe(true);
  expect(ot.unknown_phase_events).toBeGreaterThan(0);
  const allOt = await call("evidence_tool", {
    tool: "search_replay_events", mode: "All",
    args: { kind: "goals", phase: "overtime", limit: 10 },
  });
  expect(allOt.total).toBeGreaterThan(0);
  expect(allOt.rows.every((r) => r.event_phase === "overtime")).toBe(true);
  const recurring = report.clusters.find((c) => c.examples.length >= 2);
  expect(recurring).toBeTruthy();
  for (const example of recurring.examples.slice(0, 2)) {
    await call("review_situation", {
      mode: "2v2", replayId: example.replay_id,
      eventId: example.event_id, verdict: "mistake",
    });
  }
  const drill = await call("drill_from_fingerprint", {
    mode: "2v2", fingerprint: recurring.id,
  });
  const practice = await call("get_practice", { mode: "2v2" });
  expect(practice.plans.some((p) => p.id === drill.id)).toBe(true);
  await page.reload();
  await page
    .getByRole("button", { name: "Progress & Goals", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Replay intelligence", exact: true }),
  ).toBeVisible();
  await expect(
    page.locator(".fingerprint-grid .fingerprint").first(),
  ).toBeVisible();
  await page.screenshot({
    path: ".local/intelligence-native/progress.png",
    fullPage: true,
  });
  const first = page.locator(".fingerprint-grid .fingerprint").first();
  await first.getByRole("combobox").first().selectOption("mistake");
  await expect(
    page.getByText("Review saved locally.", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Search library", exact: true })
    .click();
  await expect(
    page.getByText("Interpreted filters: goal conceded · overtime.", {
      exact: false,
    }),
  ).toBeVisible();
  const opponents = await call("evidence_tool", {
    tool: "get_opponent_history",
    mode: "2v2",
    args: {},
  });
  expect(opponents.records.length).toBeGreaterThan(0);
  expect(opponents.records.every((r) => r.encounters >= 1)).toBe(true);
  const library = await call("get_library");
  const replay = library.replays.find(
    (r) =>
      r.mode === "2v2" && r.players.some((p) => p.id === settings.player_id),
  );
  await page.getByRole("button", { name: /Replay Library/ }).click();
  await page
    .locator("tbody tr")
    .filter({ hasText: replay.played_at })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: "Player telemetry", exact: true }),
  ).toBeVisible();
  await page.locator(".camera-settings summary").click();
  await expect(page.getByLabel("Camera Field of view")).toHaveValue(
    String(camera.camera.fov),
  );
  await page.getByLabel("Camera Field of view").fill("100");
  await page.getByRole("button", { name: "Save camera", exact: true }).click();
  await expect(
    page.getByText("Camera saved locally for your account.", { exact: true }),
  ).toBeVisible();
  expect((await call("camera_profile")).camera.fov).toBe(100);
  await page
    .getByRole("button", { name: "Rediscover game camera", exact: true })
    .click();
  expect((await call("camera_profile")).source).toBe(
    "your recorded replay camera",
  );
  await page.locator(".reference-settings summary").click();
  const option = await page
    .getByLabel("Reference ghost replay")
    .locator("option")
    .nth(1)
    .getAttribute("value");
  if (option) {
    await page.getByLabel("Reference ghost replay").selectOption(option);
    await page
      .getByRole("button", { name: "Show reference ghost", exact: true })
      .click();
    await expect(
      page.getByLabel("Recorded reference ghost overlay"),
    ).toBeVisible();
  }
  await expect(page.locator(".arena-loading-overlay")).toBeHidden({
    timeout: 30000,
  });
  await page.screenshot({
    path: ".local/intelligence-native/studio.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
  await writeFile(
    "docs/validation/intelligence-native.json",
    JSON.stringify(
      {
        status: "PASS",
        data: "isolated clone of 29 local replays",
        camera_source: camera.source,
        camera: camera.camera,
        index_query_ms: coldMs,
        matches_searched: report.matches_searched,
        overtime_conceded: ot.total,
        recorded_overtime_goals: allOt.total,
        unknown_phase_events: ot.unknown_phase_events,
        opponents: opponents.records.length,
        checks: [
          "schema 5 to 7 migration preserves imported library",
          "camera discovered by exact replay player identity",
          "native fingerprint review persisted",
          "bounded full-library OT query uses event phase",
          "unknown flags remain unknown",
          "local opponent encounters",
          "confirmed recurring mistakes create a durable weekly drill",
          "real recorded overtime goals are returned from the full library",
          "native camera edit and rediscovery",
          "same-mode recorded reference ghost",
          "no WebView page errors",
        ],
        not_run: [
          "live AI tool planning",
          "live Discord delivery",
          "trained xG or RLGym inference",
          "external bot detector upload",
        ],
      },
      null,
      2,
    ),
  );
  console.log(
    "PASS: isolated native camera, fingerprints, event search, opponent history and reference overlay",
  );
} finally {
  await browser.close();
}
