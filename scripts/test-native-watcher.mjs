import {
  chromium,
  expect,
} from "../app/node_modules/@playwright/test/index.mjs";
import { resolve, join } from "node:path";
import { copyFile, writeFile } from "node:fs/promises";
const browser = await chromium.connectOverCDP("http://127.0.0.1:9239");
const page = browser.contexts()[0].pages()[0];
await page.reload();
await page.waitForFunction(() => !!window.__TAURI_INTERNALS__);
await expect(page.getByText("Overview", { exact: true }).first()).toBeVisible();
const invoke = (name, args = {}) =>
  page.evaluate(
    ({ name, args }) => window.__TAURI_INTERNALS__.invoke(name, args),
    { name, args },
  );
const before = await invoke("get_library");
// Tauri's invoke is immutable. Observe real IPC requests without replacing it.
let libraryLoads = 0;
page.on("request", (request) => {
  if (request.url() === "http://ipc.localhost/get_library") libraryLoads++;
});
const source = resolve(".local/hardening-native/imports");
await invoke("save_settings", {
  settings: { auto_import: true, replay_folder: source },
});
await copyFile(
  resolve(".local/hardening-native/watcher-source-verified.replay"),
  join(source, "Watcher Verified.replay"),
);
// Observe App's own event-driven refresh without polling the library through IPC.
await expect
  .poll(() => libraryLoads, { timeout: 45000, intervals: [250, 500, 1000] })
  .toBe(1);
const after = await invoke("get_library");
expect(after.count).toBe(before.count + 1);
libraryLoads = 0;
// A watcher event for another copy is already-present and must not reload library.
await copyFile(
  resolve(".local/hardening-native/watcher-source-verified.replay"),
  join(source, "Watcher Verified Duplicate.replay"),
);
await expect
  .poll(
    async () =>
      (await invoke("get_import_status")).some(
        (entry) =>
          entry.file_name === "Watcher Verified Duplicate.replay" &&
          entry.status === "already_present",
      ),
    { timeout: 12000, intervals: [500] },
  )
  .toBe(true);
expect(libraryLoads).toBe(0);
await invoke("save_settings", { settings: { auto_import: false } });
await writeFile(
  "docs/validation/native-watcher.json",
  JSON.stringify(
    {
      status: "PASS",
      checks: [
        "filesystem notification auto-import",
        "new event refreshes library once",
        "duplicate event skips parser and library reload",
      ],
      beforeCount: before.count,
      afterCount: after.count,
    },
    null,
    2,
  ),
);
await browser.close();
console.log("PASS: native filesystem watcher and new-only library refresh");
