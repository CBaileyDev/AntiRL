$ErrorActionPreference = 'Stop'
$repository = Split-Path -Parent $PSScriptRoot
$executable = Join-Path $repository 'dist\AntiRL-Test\AntiRL.exe'
if (!(Test-Path -LiteralPath $executable)) {
    throw 'Test build missing. Build with scripts/tauri.ps1 build --bundles nsis, then prepare the portable test folder.'
}
$alreadyRunning = Get-Process -Name AntiRL -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $executable }
if ($alreadyRunning) {
    $shell = New-Object -ComObject WScript.Shell
    $null = $shell.AppActivate($alreadyRunning[0].Id)
    return
}
# Normal user launch: never inherit a QA data directory or debugging listener.
$launch = [System.Diagnostics.ProcessStartInfo]::new($executable)
$launch.UseShellExecute = $false
$launch.WorkingDirectory = Split-Path -Parent $executable
$launch.Environment.Remove('ANTIRL_QA_DATA_DIR') | Out-Null
$launch.Environment.Remove('WEBVIEW2_USER_DATA_FOLDER') | Out-Null
$launch.Environment.Remove('WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS') | Out-Null
$launch.WindowStyle = [System.Diagnostics.ProcessWindowStyle]::Normal
[System.Diagnostics.Process]::Start($launch) | Out-Null
