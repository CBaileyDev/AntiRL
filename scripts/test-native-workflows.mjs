// Only synthetic IPC data; this does not read production settings or replays.
import {
  chromium,
  expect,
} from "../app/node_modules/@playwright/test/index.mjs";
import { writeFile } from "node:fs/promises";
const browser = await chromium.connectOverCDP("http://127.0.0.1:9236");
const page = browser.contexts()[0].pages()[0];
const result = await page.evaluate(async () => {
  const invoke = window.__TAURI_INTERNALS__.invoke;
  const old = await invoke("get_practice", { mode: "2v2" });
  for (const p of old.plans.filter(
    (p) => p.body.title === "Synthetic recovery block",
  ))
    await invoke("archive_practice", { mode: "2v2", id: p.id });
  const a = await invoke("create_conversation", {
    mode: "1v1",
    preset: "Decision review",
  });
  const b = await invoke("create_conversation", {
    mode: "2v2",
    preset: "Balanced",
  });
  await invoke("update_conversation", {
    id: a.id,
    title: "Synthetic duel review",
    archived: false,
  });
  const pack = await invoke("search_training_packs", {
    mode: "2v2",
    query: "Poquito clears",
  });
  const plan = await invoke("save_practice_plan", {
    mode: "2v2",
    body: {
      title: "Synthetic recovery block",
      drill: "Land with wheels aligned; repeat a simple recovery",
      success_criterion: "Record clean attempts versus total",
      next_match_cue: "Review one same-mode recovery",
      intended_minutes: 5,
    },
  });
  await invoke("record_training", {
    mode: "2v2",
    planId: plan.id,
    minutes: 4,
    difficulty: "appropriate",
    notes: "Synthetic self-report",
  });
  const practice = await invoke("get_practice", { mode: "2v2" });
  const other = await invoke("get_practice", { mode: "1v1" });
  let rejected = false;
  try {
    await invoke("evidence_tool", {
      mode: "1v1",
      tool: "get_match_metrics",
      args: { replay_id: "synthetic-viewer" },
    });
  } catch {
    rejected = true;
  }
  await invoke("update_conversation", {
    id: b.id,
    title: "Synthetic archived chat",
    archived: true,
  });
  return {
    aId: a.id,
    planId: plan.id,
    conversations: await invoke("get_conversations"),
    pack,
    practice,
    other,
    rejected,
  };
});
expect(result.pack.records.some((p) => p.code === "5DA1-EA21-5EF9-EA21")).toBe(
  true,
);
expect(result.rejected).toBe(true);
expect(result.other.plans).toEqual([]);
expect(
  result.practice.sessions.some(
    (s) => s.plan_id === result.planId && s.body.completed_minutes === 4,
  ),
).toBe(true);
await page.reload();
await page.waitForTimeout(300);
await page.getByRole("button", { name: "Coach Chat", exact: true }).click();
await page.getByLabel("Conversation", { exact: true }).selectOption(result.aId);
await page
  .getByLabel("Message the coach")
  .fill("Summarize my synthetic duel history without invented numbers.");
await page.getByLabel("Send message").click();
await expect(
  page.getByText("Offline evidence summary", { exact: false }).first(),
).toBeVisible();
const persisted = await page.evaluate(
  async (id) => ({
    messages: await window.__TAURI_INTERNALS__.invoke("get_messages", {
      conversationId: id,
    }),
    practice: await window.__TAURI_INTERNALS__.invoke("get_practice", {
      mode: "2v2",
    }),
    conversations: await window.__TAURI_INTERNALS__.invoke("get_conversations"),
  }),
  result.aId,
);
expect(
  persisted.conversations.some(
    (c) =>
      c.id === result.aId &&
      c.mode === "1v1" &&
      c.title === "Synthetic duel review",
  ),
).toBe(true);
expect(
  persisted.conversations.some((c) => c.title === "Synthetic archived chat"),
).toBe(false);
expect(persisted.messages.map((m) => m.body.role)).toEqual([
  "user",
  "assistant",
]);
expect(persisted.messages[1].body.mode).toBe("1v1");
await page
  .getByRole("button", { name: "Progress & Goals", exact: true })
  .click();
await expect(
  page.getByText("Synthetic recovery block", { exact: true }),
).toBeVisible();
await page
  .getByLabel("Completed minutes for Synthetic recovery block")
  .first()
  .fill("3");
await page
  .getByRole("button", { name: "Record practice", exact: true })
  .first()
  .click();
await expect(page.getByText("Saved locally", { exact: true })).toBeVisible();
await page.screenshot({ path: "docs/validation/native-practice.png" });
const evidenceChat = await page.evaluate(() =>
  window.__TAURI_INTERNALS__.invoke("create_conversation", {
    mode: "2v2",
    preset: "Balanced",
  }),
);
await page.reload();
await page.getByRole("button", { name: "Coach Chat", exact: true }).click();
await page
  .getByLabel("Conversation", { exact: true })
  .selectOption(evidenceChat.id);
await page.getByText("Browse imported evidence", { exact: true }).click();
await page
  .getByRole("button", { name: "Load personal history", exact: true })
  .click();
await expect(
  page.getByRole("button", { name: "Inspect metrics", exact: true }),
).toHaveCount(1);
await page
  .getByRole("button", { name: "Inspect metrics", exact: true })
  .click();
await expect(
  page.getByRole("columnheader", { name: "Observed value", exact: true }),
).toBeVisible();
await page.screenshot({ path: "docs/validation/native-evidence.png" });
await writeFile(
  "docs/validation/native-workflows.json",
  JSON.stringify(
    {
      status: "PASS",
      fixture: "synthetic",
      checks: [
        "native mode/preset creation and rename",
        "archive hidden while stored",
        "history retained on reload",
        "catalog code provenance",
        "wrong-mode retrieval denied",
        "persistent practice completion and mode isolation",
        "native practice form",
      ],
    },
    null,
    2,
  ),
);
await browser.close();
