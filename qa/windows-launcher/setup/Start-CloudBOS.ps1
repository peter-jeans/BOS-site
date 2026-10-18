# Run from an ordinary PowerShell terminal. Do not bypass execution policy.
$ErrorActionPreference = 'Stop'
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host 'Cloud BOS needs Node.js 20 or later. Install the supported Node.js from https://nodejs.org/en/download, then run this launcher again.'
    exit 1
}
& node (Join-Path $PSScriptRoot 'setup.mjs') @args
exit $LASTEXITCODE
