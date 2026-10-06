// Uses only the isolated hardening QA profile; never a live user profile.
import {
  chromium,
  expect,
} from "../app/node_modules/@playwright/test/index.mjs";
import { writeFile } from "node:fs/promises";
const browser = await chromium.connectOverCDP("http://127.0.0.1:9239");
const page = browser.contexts()[0].pages()[0];
await page.waitForFunction(() => !!window.__TAURI_INTERNALS__);
const invoke = (name, args = {}) =>
  page.evaluate(
    ({ name, args }) => window.__TAURI_INTERNALS__.invoke(name, args),
    { name, args },
  );
const original = await invoke("get_settings");
try {
  await invoke("save_settings", {
    settings: { player_id: "synthetic:native-contract", auto_import: false },
  });
  const plan = await invoke("save_practice_plan", {
    mode: "2v2",
    body: {
      title: "Synthetic recovery",
      drill: "Land on wheels",
      success_criterion: "Five clean attempts",
      next_match_cue: "Review one recovery",
      intended_minutes: 5,
    },
  });
  expect(plan.body.intended_minutes).toBe(5);
  await invoke("record_training", {
    mode: "2v2",
    planId: plan.id,
    minutes: 4,
    difficulty: "appropriate",
    notes: "Synthetic native contract smoke",
  });
  const practice = await invoke("get_practice", { mode: "2v2" });
  expect(
    practice.sessions.some(
      (session) =>
        session.plan_id === plan.id && session.body.completed_minutes === 4,
    ),
  ).toBe(true);
  expect((await invoke("get_practice", { mode: "1v1" })).plans).toEqual([]);
  const packs = await invoke("search_training_packs", {
    query: "",
    mode: "2v2",
  });
  expect(packs.records.length).toBeGreaterThan(0);
  expect(
    packs.records.every(
      (pack) =>
        typeof pack.source_hash === "string" &&
        typeof pack.in_game_tested === "boolean",
    ),
  ).toBe(true);
  await invoke("archive_practice", { mode: "2v2", id: plan.id });
  await writeFile(
    "docs/validation/native-contracts.json",
    JSON.stringify(
      {
        status: "PASS",
        checks: [
          "typed practice creation",
          "camelCase training args",
          "practice session response",
          "mode isolation",
          "typed training catalog",
        ],
      },
      null,
      2,
    ),
  );
} finally {
  await invoke("save_settings", { settings: original });
  await browser.close();
}
console.log("PASS: final native typed practice and training catalog contracts");
