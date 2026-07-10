# Fix better-sqlite3 native module ABI mismatch on Windows / PowerShell.
#
# Problem: the .node binary was compiled for one Node ABI (e.g. Electron's)
# but `vitest` runs under the system Node, which expects a different ABI.
# This script rebuilds better-sqlite3 against the Node version that runs
# `npm test` / `npx vitest`.
#
# Usage (in PowerShell, from the project root):
#   .\fix-sqlite-abi.ps1
#
# If execution policy blocks scripts, run first:
#   Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $projectRoot

$nodeVersion = (node -v).TrimStart("v")
$nodeAbi = node -p "process.versions.modules"

Write-Host "System Node version: $nodeVersion" -ForegroundColor Cyan
Write-Host "System Node ABI:     $nodeAbi" -ForegroundColor Cyan

$binaryPath = "node_modules\better-sqlite3\build\Release\better_sqlite3.node"
if (Test-Path $binaryPath) {
    Write-Host ""
    Write-Host "Current better-sqlite3 binary ABI:" -ForegroundColor Yellow
    $bytes = [System.IO.File]::ReadAllBytes($binaryPath)
    $text = [System.Text.Encoding]::ASCII.GetString($bytes)
    $matches = [regex]::Matches($text, "NODE_MODULE_VERSION\s*\d+")
    if ($matches.Count -gt 0) {
        $matches | ForEach-Object { Write-Host $_.Value }
    } else {
        Write-Host "(could not detect from binary)"
    }
}

Write-Host ""
Write-Host "Rebuilding better-sqlite3 for system Node $nodeVersion (ABI $nodeAbi)..." -ForegroundColor Green

# Clean any stale build artifacts
$buildPath = "node_modules\better-sqlite3\build"
if (Test-Path $buildPath) {
    Remove-Item -Recurse -Force $buildPath
}

# Rebuild against the system Node runtime
npm rebuild better-sqlite3 `
  --runtime=node `
  --target=$nodeVersion `
  --arch=x64 `
  --dist-url=https://nodejs.org/download/release

Write-Host ""
Write-Host "Verifying ABI match..." -ForegroundColor Green
try {
    $test = node -e "console.log(require('better-sqlite3').constructor.name)" 2>&1
    Write-Host "OK: better-sqlite3 loaded successfully under Node $nodeVersion (ABI $nodeAbi)." -ForegroundColor Green
    Write-Host ""
    Write-Host "Run the DB tests with:" -ForegroundColor Cyan
    Write-Host "  npx vitest run tests/unit/services/database-service.test.ts"
} catch {
    Write-Host "ERROR: better-sqlite3 still cannot load." -ForegroundColor Red
    Write-Host ""
    Write-Host "Common fixes:" -ForegroundColor Yellow
    Write-Host "  1. Ensure you have Python and Visual Studio Build Tools / C++ workload installed."
    Write-Host "  2. Try a full reinstall:"
    Write-Host "       Remove-Item -Recurse -Force node_modules\better-sqlite3"
    Write-Host "       npm install better-sqlite3"
    Write-Host "       .\fix-sqlite-abi.ps1"
    Write-Host "  3. If using nvm-windows, make sure the same Node version runs rebuild and tests:"
    Write-Host "       nvm use <version>"
    exit 1
}
