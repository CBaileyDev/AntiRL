// Requires the isolated QA executable already running with CDP 9236.
import {
  chromium,
  expect,
} from "../app/node_modules/@playwright/test/index.mjs";
import { execFileSync } from "node:child_process";
import { writeFile } from "node:fs/promises";
let browser = await chromium.connectOverCDP("http://127.0.0.1:9236");
let page = browser.contexts()[0].pages()[0];
const capture = () =>
  page.evaluate(async () => {
    const call = window.__TAURI_INTERNALS__.invoke;
    const chats = await call("get_conversations");
    const duel = chats.find((c) => c.title === "Synthetic duel review");
    return {
      id: duel.id,
      messages: await call("get_messages", { conversationId: duel.id }),
      practice: await call("get_practice", { mode: "2v2" }),
      manifest: await call("get_context_manifest", { mode: "2v2" }),
      settings: await call("get_settings"),
    };
  });
const before = await capture();
await browser.close();
execFileSync("pwsh", [
  "-NoProfile",
  "-Command",
  `
$qaId=[int](Get-Content .local/qa-process.txt);$qa=Get-Process -Id $qaId
$expected=Join-Path (Get-Location) 'target/upgrade-qa/release/antirl.exe'
if($qa.Path -ne $expected){throw 'Unexpected QA process'}
Stop-Process -Id $qaId
$env:ANTIRL_QA_DATA_DIR=Join-Path $env:TEMP 'antirl-upgrade-qa'
$env:WEBVIEW2_USER_DATA_FOLDER=Join-Path $env:TEMP 'antirl-upgrade-webview'
$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS='--remote-debugging-port=9236'
$qa=Start-Process -FilePath $expected -WindowStyle Hidden -PassThru
Set-Content .local/qa-process.txt $qa.Id
`,
]);
for (let i = 0; i < 40; i++) {
  try {
    browser = await chromium.connectOverCDP("http://127.0.0.1:9236");
    break;
  } catch {
    await new Promise((r) => setTimeout(r, 100));
  }
}
page = browser.contexts()[0].pages()[0];
await page.waitForTimeout(1000);
const after = await capture();
expect(after.id).toBe(before.id);
expect(after.messages).toEqual(before.messages);
expect(after.practice).toEqual(before.practice);
expect(after.manifest.modes["2v2"].lifetime_count).toBe(1);
expect(after.settings.onboarding_status).toBe(
  before.settings.onboarding_status,
);
await expect(page.getByRole("dialog", { name: "Player setup" })).toHaveCount(0);
await writeFile(
  "docs/validation/native-restart.json",
  JSON.stringify(
    {
      status: "PASS",
      fixture: "synthetic",
      checks: [
        "actual process restart retains mode-specific messages and practice sessions",
        "analytics reconciles on startup",
        "skipped onboarding does not repeat",
      ],
    },
    null,
    2,
  ),
);
await browser.close();
