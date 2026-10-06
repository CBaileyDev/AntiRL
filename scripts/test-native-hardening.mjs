// Isolated test profile only. Reads copies; never changes game replays or live settings.
import {
  chromium,
  expect,
} from "../app/node_modules/@playwright/test/index.mjs";
import {
  readdir,
  stat,
  writeFile,
  mkdir,
  utimes,
  copyFile,
} from "node:fs/promises";
import { resolve, join } from "node:path";
const qa = resolve(".local/hardening-native");
const source = join(qa, "imports");
const snapshots = join(
  process.env.ANTIRL_QA_DATA_DIR || join(qa, "data"),
  "replay-snapshots",
);
const browser = await chromium.connectOverCDP("http://127.0.0.1:9239");
const page = browser.contexts()[0].pages()[0];
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
await page.waitForFunction(() => !!window.__TAURI_INTERNALS__);
const invoke = (name, args = {}) =>
  page.evaluate(
    ({ name, args }) => window.__TAURI_INTERNALS__.invoke(name, args),
    { name, args },
  );
const initial = await invoke("get_settings");
expect(initial.provider).toBe("none");
expect(initial.cloud_consent).toBe(false);
await invoke("save_settings", {
  settings: {
    auto_import: false,
    provider: "none",
    cloud_consent: false,
    onboarding_status: "skipped",
  },
});
const first = await invoke("import_folder", { folder: source });
expect(first.new).toBe(1);
expect(first.failed).toBe(1);
const library = await invoke("get_library");
expect(library.replays).toHaveLength(1);
expect(library.count).toBe(1);
expect(library.replays[0].file_name).toBe("Friendly Match.replay");
const replayId = library.replays[0].id;
const full = await invoke("get_replay", { id: replayId });
expect(full.frames.length).toBeGreaterThan(10);
const compact = await invoke("get_coach_replay", { id: replayId });
expect(compact.frames).toBeUndefined();
const statusBefore = await invoke("get_import_status");
expect(
  statusBefore.find((entry) => entry.file_name === "Broken.replay").status,
).toBe("failed");
const snapshotsBefore = await readdir(snapshots);
expect(snapshotsBefore).toHaveLength(1);
const writtenBefore = (await stat(join(snapshots, snapshotsBefore[0]))).mtimeMs;
const start = performance.now();
const unchanged = await invoke("import_folder", { folder: source });
const unchangedMs = performance.now() - start;
expect(unchanged.new).toBe(0);
expect(unchanged.failed).toBe(0);
expect(unchanged.skipped).toBe(2);
expect(await invoke("get_import_status")).toEqual(statusBefore);
expect((await stat(join(snapshots, snapshotsBefore[0]))).mtimeMs).toBe(
  writtenBefore,
);
await invoke("delete_replay", { id: replayId });
expect((await invoke("get_library")).count).toBe(0);
expect(await readdir(snapshots)).toEqual([]);
const afterDelete = await invoke("import_folder", { folder: source });
expect(afterDelete.new).toBe(0);
expect((await invoke("get_library")).count).toBe(0);
// A new source name with the same bytes is also tombstoned.
await copyFile(
  join(source, "Friendly Match.replay"),
  join(source, "Renamed Match.replay"),
);
await utimes(join(source, "Renamed Match.replay"), new Date(0), new Date(0));
const renamed = await invoke("import_single_file", {
  filePath: join(source, "Renamed Match.replay"),
});
expect(renamed.new).toBe(0);
expect(await readdir(snapshots)).toEqual([]);
const retry = await invoke("retry_failed_imports", { folder: source });
expect(retry.failed).toBe(1);
expect(retry.new).toBe(0);
// Typed errors stay distinguishable and dangerous opener protocols are blocked.
const missingError = await page.evaluate(async () => {
  try {
    await window.__TAURI_INTERNALS__.invoke("get_replay", {
      id: "missing-fixture",
    });
    return null;
  } catch (error) {
    return error;
  }
});
expect(missingError.code).toBeTruthy();
expect(missingError.message).toBeTruthy();
let denied = false;
try {
  await invoke("plugin:opener|open_url", { url: "javascript:alert(1)" });
} catch {
  denied = true;
}
expect(denied).toBe(true);
await page.reload();
await expect(
  page.getByRole("button", { name: "Replay Library", exact: true }),
).toBeVisible();
await page.getByRole("button", { name: "Replay Library", exact: true }).click();
await expect(
  page.getByRole("heading", { name: "No Replays Found" }),
).toBeVisible();
await page.screenshot({ path: "docs/validation/native-hardening.png" });
expect(errors).toEqual([]);
await mkdir("docs/validation", { recursive: true });
await writeFile(
  "docs/validation/native-hardening.json",
  JSON.stringify(
    {
      status: "PASS",
      data: "isolated copied replay + malformed file",
      checks: [
        "native parser containment",
        "original filename",
        "typed IPC contracts",
        "compressed playback round trip",
        "unchanged and failed skip without snapshot rewrites",
        "durable deletion and renamed hash tombstone",
        "explicit failed retry",
        "external opener protocol denial",
        "production CSP mounts UI",
      ],
      first,
      unchanged,
      afterDelete,
      retry,
      unchangedMs,
      errors,
    },
    null,
    2,
  ),
);
await browser.close();
console.log("PASS: native isolated import, storage, privacy and CSP");
