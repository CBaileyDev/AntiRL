$ErrorActionPreference = 'Stop'
$taskRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$taskReviewRoot = (Resolve-Path -LiteralPath $PSScriptRoot).Path

# These are the two server PIDs started by this review. Check their command
# before stopping them; never kill other Node, browser or AntiRL processes.
foreach ($ownedServer in @(
    @{ Id = 55288; Pattern = 'review/serve_harness\.mjs' },
    @{ Id = 48268; Pattern = 'AntiRL.*vite.*1433.*strictPort' }
)) {
    $process = Get-CimInstance Win32_Process -Filter ("ProcessId=" + $ownedServer.Id)
    if ($process) {
        if ($process.Name -ne 'node.exe' -or $process.CommandLine -notmatch $ownedServer.Pattern) {
            throw 'Server PID ownership changed; no process was stopped.'
        }
        Stop-Process -Id $ownedServer.Id -ErrorAction Stop
        Write-Output ("Stopped owned review server PID " + $ownedServer.Id)
    }
}

$cleanupTargets = @(
    (Join-Path $taskRoot '.vite'),
    (Join-Path $taskReviewRoot '.vite'),
    (Join-Path $taskReviewRoot 'snapshot'),
    (Join-Path $taskReviewRoot 'metrics-probe\target'),
    (Join-Path $taskReviewRoot 'frontend-probes.cjs')
)
foreach ($cleanupTarget in $cleanupTargets) {
    if (-not (Test-Path -LiteralPath $cleanupTarget)) { continue }
    $resolvedTarget = (Resolve-Path -LiteralPath $cleanupTarget).Path
    $allowedRootCache = $resolvedTarget -eq (Join-Path $taskRoot '.vite')
    $insideReview = $resolvedTarget.StartsWith($taskReviewRoot + '\', [StringComparison]::OrdinalIgnoreCase)
    if (-not ($insideReview -or $allowedRootCache)) { throw 'Cleanup target escaped the allowed directory.' }

    # Remove only link entries before recursion, so pnpm junction targets in
    # shared dependency stores cannot be traversed or deleted.
    $item = Get-Item -LiteralPath $resolvedTarget -Force
    if ($item.PSIsContainer) {
        $links = @(Get-ChildItem -LiteralPath $resolvedTarget -Recurse -Force -Attributes ReparsePoint |
            Sort-Object { $_.FullName.Length } -Descending)
        foreach ($link in $links) {
            $linkPath = [IO.Path]::GetFullPath($link.FullName)
            if (-not $linkPath.StartsWith($resolvedTarget + '\', [StringComparison]::OrdinalIgnoreCase)) {
                throw 'Reparse link escaped the cleanup root.'
            }
            if ($link.PSIsContainer) { [IO.Directory]::Delete($linkPath, $false) }
            else { [IO.File]::Delete($linkPath) }
        }
        Remove-Item -LiteralPath $resolvedTarget -Recurse -Force
    } else {
        Remove-Item -LiteralPath $resolvedTarget -Force
    }
    Write-Output ("Removed temporary review output: " + $resolvedTarget)
}
Write-Output 'Original profiles, replay sources, target cache and tracked files were preserved.'
