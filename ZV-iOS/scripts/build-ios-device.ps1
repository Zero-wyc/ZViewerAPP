param([switch]$SkipDeviceRegistration)
$ErrorActionPreference = 'Stop'
$taskProject = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$taskPreviousRoot = $env:EAS_PROJECT_ROOT
$taskPreviousNoVcs = $env:EAS_NO_VCS
$taskPreviousCi = $env:CI
Push-Location -LiteralPath $taskProject
try {
    # Archive only this Expo project, even inside the larger client repository.
    $env:EAS_PROJECT_ROOT = $taskProject
    $env:EAS_NO_VCS = '1'
    Remove-Item Env:CI -ErrorAction SilentlyContinue
    Write-Host 'Enter Apple credentials only in the EAS terminal prompts, never in chat.'
    if (-not $SkipDeviceRegistration) {
        & npx eas-cli@latest device:create
        if ($LASTEXITCODE -ne 0) { throw 'Device registration failed; build was not started.' }
    }
    & npx eas-cli@latest build --platform ios --profile development
    if ($LASTEXITCODE -ne 0) { throw 'The iOS development build did not complete successfully.' }
} finally {
    $env:EAS_PROJECT_ROOT = $taskPreviousRoot
    $env:EAS_NO_VCS = $taskPreviousNoVcs
    $env:CI = $taskPreviousCi
    Pop-Location
}
