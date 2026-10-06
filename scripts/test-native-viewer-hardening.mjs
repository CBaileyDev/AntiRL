// Requires the isolated native profile started for test-native-hardening.
import {
  chromium,
  expect,
} from "../app/node_modules/@playwright/test/index.mjs";
import { resolve } from "node:path";
import { writeFile } from "node:fs/promises";
const browser = await chromium.connectOverCDP("http://127.0.0.1:9239");
const page = browser.contexts()[0].pages()[0];
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (message) => {
  if (
    message.type() === "error" &&
    /Content Security Policy|unsafe-eval|Refused/i.test(message.text())
  )
    errors.push(message.text());
});
await page.evaluate(async (filePath) => {
  await window.__TAURI_INTERNALS__.invoke("import_single_file", { filePath });
}, resolve(".local/hardening-native/imports/Viewer Match.replay"));
await page.reload();
await page.getByRole("button", { name: "Replay Library", exact: true }).click();
await page.getByRole("button", { name: "Studio", exact: true }).first().click();
await expect(
  page.getByRole("button", { name: "Play replay", exact: true }),
).toBeEnabled({ timeout: 45000 });
for (const camera of ["Chase", "Ball Cam", "Broadcast", "Overhead", "Orbit"]) {
  await page.getByRole("button", { name: camera, exact: true }).click();
  await expect(
    page.getByRole("button", { name: camera, exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
}
await page.getByRole("button", { name: "Play replay", exact: true }).click();
await page.waitForTimeout(400);
await page.getByRole("button", { name: "Pause replay", exact: true }).click();
await page.getByLabel("Replay scrub bar").fill("32");
await page.screenshot({ path: "docs/validation/native-hardening-viewer.png" });
expect(errors).toEqual([]);
await writeFile(
  "docs/validation/native-hardening-viewer.json",
  JSON.stringify(
    {
      status: "PASS",
      checks: [
        "native production CSP permits local viewer",
        "all five camera controls",
        "play/pause/seek",
      ],
      errors,
    },
    null,
    2,
  ),
);
await browser.close();
console.log("PASS: native viewer under production CSP");
