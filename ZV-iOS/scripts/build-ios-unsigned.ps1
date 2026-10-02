param([switch]$Wait)
$ErrorActionPreference = 'Stop'
$taskRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$previousNoVcs = $env:EAS_NO_VCS
$previousRoot = $env:EAS_PROJECT_ROOT
Push-Location -LiteralPath $taskRoot
try {
    # EAS_NO_VCS uploads the working copy, including Windows checkout endings.
    # Shell scripts must be LF on the macOS worker even before the next commit.
    foreach ($taskShellFile in Get-ChildItem -LiteralPath (Join-Path $taskRoot 'scripts') -Filter '*.sh') {
        $taskShellText = [IO.File]::ReadAllText($taskShellFile.FullName).Replace("`r`n", "`n")
        [IO.File]::WriteAllText($taskShellFile.FullName, $taskShellText, [Text.UTF8Encoding]::new($false))
    }
    & node scripts/stage-native-core.cjs
    if ($LASTEXITCODE -ne 0) { throw 'Native source staging failed.' }
    $env:EAS_NO_VCS = '1'
    $env:EAS_PROJECT_ROOT = $taskRoot
    $taskArgs = @('eas-cli@latest', 'build', '--platform', 'ios', '--profile', 'unsigned-device', '--non-interactive')
    if (-not $Wait) { $taskArgs += '--no-wait' }
    & npx @taskArgs
    if ($LASTEXITCODE -ne 0) { throw 'Unsigned device build failed. Check the EAS build log.' }
} finally {
    $env:EAS_NO_VCS = $previousNoVcs
    $env:EAS_PROJECT_ROOT = $previousRoot
    Pop-Location
}
