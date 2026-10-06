// Operates only the isolated QA process and synthetic content; preserves clipboard.
import {
  chromium,
  expect,
} from "../app/node_modules/@playwright/test/index.mjs";
import { execFileSync } from "node:child_process";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
const ps = (script) =>
  execFileSync("pwsh", ["-NoProfile", "-Command", script], {
    encoding: "utf8",
  }).trim();
const pid = Number((await readFile(".local/qa-process.txt", "utf8")).trim());
const directory = join(process.env.TEMP, "antirl-export-test");
await mkdir(directory, { recursive: true });
const browser = await chromium.connectOverCDP("http://127.0.0.1:9236");
const page = browser.contexts()[0].pages()[0];
const controls = `Add-Type -AssemblyName UIAutomationClient,UIAutomationTypes
Add-Type 'using System; using System.Runtime.InteropServices; public static class QASave { [DllImport("user32.dll",CharSet=CharSet.Unicode)] public static extern IntPtr SendMessage(IntPtr h,uint m,IntPtr w,string s); [DllImport("user32.dll")] public static extern IntPtr SendMessage(IntPtr h,uint m,IntPtr w,IntPtr l); }'
$dialog=$null
for($attempt=0;$attempt -lt 40 -and !$dialog;$attempt++){
 $windows=[System.Windows.Automation.AutomationElement]::RootElement.FindAll([System.Windows.Automation.TreeScope]::Children,[System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::ProcessIdProperty,${pid}))
 foreach($window in $windows){if($window.Current.Name -eq 'Save As'){$dialog=$window;break}}
 if(!$dialog){Start-Sleep -Milliseconds 100}
}
if(!$dialog){throw 'QA Save dialog missing'}
$nodes=$dialog.FindAll([System.Windows.Automation.TreeScope]::Descendants,[System.Windows.Automation.Condition]::TrueCondition)
foreach($node in $nodes){if($node.Current.ClassName -eq 'Edit' -and $node.Current.AutomationId -eq '1001'){$edit=$node};if($node.Current.ClassName -eq 'Button' -and $node.Current.AutomationId -eq '1'){$save=$node};if($node.Current.ClassName -eq 'Button' -and $node.Current.AutomationId -eq '2'){$cancel=$node}}
`;
const checks = [];
for (const format of ["md", "txt", "json", "cancel"]) {
  const path = join(
    directory,
    `synthetic-${Date.now()}.${format === "cancel" ? "json" : format}`,
  );
  await page.evaluate((format) => {
    window.__qaExport = window.__TAURI_INTERNALS__.invoke(
      "export_conversation",
      {
        format: format === "cancel" ? "json" : format,
        snapshot: {
          title: "Synthetic export",
          mode: "2v2",
          preset: "Balanced",
          api_key: "DUMMY_EXCLUDED_FIELD",
          messages: [
            {
              role: "assistant",
              content: "Synthetic visible partial",
              status: "partial",
              timestamp: "2026-01-01",
              context_manifest: { metric_version: "metrics-2" },
              secret: "DUMMY_EXCLUDED_FIELD",
            },
          ],
        },
      },
    );
  }, format);
  ps(
    controls +
      (format === "cancel"
        ? `[QASave]::SendMessage([IntPtr]$cancel.Current.NativeWindowHandle,245,[IntPtr]::Zero,[IntPtr]::Zero)|Out-Null`
        : `[QASave]::SendMessage([IntPtr]$edit.Current.NativeWindowHandle,12,[IntPtr]::Zero,'${path.replaceAll("'", "''")}')|Out-Null
[QASave]::SendMessage([IntPtr]$save.Current.NativeWindowHandle,245,[IntPtr]::Zero,[IntPtr]::Zero)|Out-Null`),
  );
  await page.evaluate(() => window.__qaExport);
  if (format !== "cancel") {
    const contents = await readFile(path, "utf8");
    expect(contents).toContain("Synthetic visible partial");
    expect(contents).toContain("partial");
    expect(contents).not.toContain("DUMMY_EXCLUDED_FIELD");
  }
  checks.push(
    `native ${format === "cancel" ? "cancel" : format + " save"} dialog`,
  );
}
// Clipboard is restored even if the test fails, and its previous value is never logged.
const clipboard = ps(
  '[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes((Get-Clipboard -Raw) ?? ""))',
);
try {
  await page.getByRole("button", { name: "Coach Chat", exact: true }).click();
  await page
    .getByLabel("Conversation", { exact: true })
    .selectOption({ label: "1v1 · Synthetic duel review" })
    .catch(async () => {
      const values = await page
        .getByLabel("Conversation", { exact: true })
        .locator("option")
        .evaluateAll((nodes) =>
          nodes
            .filter((n) => n.textContent.includes("Synthetic duel review"))
            .map((n) => n.value),
        );
      await page
        .getByLabel("Conversation", { exact: true })
        .selectOption(values.at(-1));
    });
  await page
    .getByRole("button", { name: "Copy response", exact: true })
    .last()
    .click();
  expect(
    ps(
      '$text=Get-Clipboard -Raw; if($text -match "Offline evidence summary"){"PASS"}else{"FAIL"}',
    ),
  ).toBe("PASS");
  checks.push("native response clipboard");
} finally {
  ps(
    `$text=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${clipboard}'));Set-Clipboard -Value $text`,
  );
  await browser.close();
}
await writeFile(
  "docs/validation/native-export.json",
  JSON.stringify(
    {
      status: "PASS",
      fixture: "synthetic",
      checks,
      privacy: "unknown snapshot fields excluded; original clipboard restored",
    },
    null,
    2,
  ),
);
