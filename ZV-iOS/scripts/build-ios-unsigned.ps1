param([switch]$Wait)
$ErrorActionPreference = 'Stop'
$taskRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$previousNoVcs = $env:EAS_NO_VCS
$previousRoot = $env:EAS_PROJECT_ROOT
Push-Location -LiteralPath $taskRoot
try {
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
