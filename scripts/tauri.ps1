$ErrorActionPreference = 'Stop'
Push-Location (Split-Path -Parent $PSScriptRoot)
try {
    & .\app\node_modules\.bin\tauri.cmd @args
    if ($LASTEXITCODE -ne 0) { throw 'Tauri command failed' }
} finally { Pop-Location }
