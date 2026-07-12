# One-shot better-sqlite3 ABI diagnostic (Windows / PowerShell).
#
# Prints the Node ABI that better-sqlite3 was compiled against and the
# ABIs of the two runtimes it might be loaded under:
#   1. System Node (drives `npm test` / vitest)
#   2. Electron's bundled Node (drives `npm start` / the running app)
#
# If either ABI matches the binary's (or the binary is N-API), it will
# load under that runtime. Otherwise run `npm test` for tests, or
# `npm run rebuild` for the running app — the `pretest` script
# (`scripts/rebuild-better-sqlite3-node.mjs`) rebuilds better-sqlite3
# against the system Node ABI automatically.
#
# Usage (in PowerShell, from the project root):
#   .\check-sqlite-abi.ps1
#
# If execution policy blocks scripts, run first:
#   Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $projectRoot

$nodeVersion = (node -v).TrimStart("v")
$nodeAbi = node -p "process.versions.modules"
$nodeNapi = node -p "process.versions.napi"

# Electron version -> bundled Node ABI lookup. Stable per Electron major.
# Source: https://www.electronjs.org/docs/latest/tutorial/electron-timelines
$electronTable = @{
    28 = @{ NodeVersion = "18.18.2"; NodeAbi = "108" }
    29 = @{ NodeVersion = "20.9.0";  NodeAbi = "115" }
    30 = @{ NodeVersion = "20.9.0";  NodeAbi = "115" }
    31 = @{ NodeVersion = "20.14.0"; NodeAbi = "115" }
    32 = @{ NodeVersion = "20.18.0"; NodeAbi = "115" }
    33 = @{ NodeVersion = "20.18.1"; NodeAbi = "115" }
    34 = @{ NodeVersion = "20.18.1"; NodeAbi = "115" }
    35 = @{ NodeVersion = "22.9.0";  NodeAbi = "127" }
    36 = @{ NodeVersion = "22.14.0"; NodeAbi = "127" }
    37 = @{ NodeVersion = "22.14.0"; NodeAbi = "127" }
    38 = @{ NodeVersion = "22.14.0"; NodeAbi = "127" }
    39 = @{ NodeVersion = "22.14.0"; NodeAbi = "127" }
    40 = @{ NodeVersion = "22.14.0"; NodeAbi = "127" }
    41 = @{ NodeVersion = "22.14.0"; NodeAbi = "127" }
    42 = @{ NodeVersion = "22.14.0"; NodeAbi = "127" }
    43 = @{ NodeVersion = "22.14.0"; NodeAbi = "127" }
    44 = @{ NodeVersion = "22.15.0"; NodeAbi = "127" }
}

$electronVersion = ""
$electronNodeAbi = ""
$electronPkgPath = "node_modules\electron\package.json"
if (Test-Path $electronPkgPath) {
    $electronVersion = (Get-Content $electronPkgPath -Raw | ConvertFrom-Json).version
    $electronMajor = [int]($electronVersion.Split('.')[0])
    if ($electronTable.ContainsKey($electronMajor)) {
        $electronNodeAbi = $electronTable[$electronMajor].NodeAbi
    }
}

$binaryPath = "node_modules\better-sqlite3\build\Release\better_sqlite3.node"

function Write-Row($label, $value) {
    Write-Host ("{0,-22} {1}" -f $label, $value)
}

Write-Host ""
Write-Row "System Node:"     $nodeVersion
Write-Row "System Node ABI:" $nodeAbi
Write-Row "System N-API:"    $nodeNapi
if ($electronVersion) {
    Write-Row "Electron:"        $electronVersion
    if ($electronNodeAbi) {
        Write-Row "Electron Node ABI:" $electronNodeAbi
    } else {
        Write-Row "Electron Node ABI:" "<unknown for this version>"
    }
}

if (-not (Test-Path $binaryPath)) {
    Write-Host ""
    Write-Row "better-sqlite3:" "<binary not found at $binaryPath>"
    Write-Host ""
    Write-Host "STATUS: better-sqlite3 binary is missing. Run 'npm install' to trigger" -ForegroundColor Yellow
    Write-Host "        the 'postinstall' step ('electron-rebuild --force')."
    exit 0
}

# Try to extract the legacy NODE_MODULE_VERSION string (older better-sqlite3
# versions embedded it directly in the .node binary).
$binaryAbi = $null
$bytes = [System.IO.File]::ReadAllBytes($binaryPath)
$text = [System.Text.Encoding]::ASCII.GetString($bytes)
$match = [regex]::Match($text, "NODE_MODULE_VERSION\s*(\d+)")
if ($match.Success) {
    $binaryAbi = $match.Groups[1].Value
}

$binaryMtime = (Get-Item $binaryPath).LastWriteTime.ToString("yyyy-MM-dd HH:mm:ss")

if ($null -eq $binaryAbi) {
    Write-Row "better-sqlite3:" "<N-API binary, see mtime>"
} else {
    Write-Row "better-sqlite3:" $binaryAbi
}
Write-Row "binary built:" $binaryMtime

Write-Host ""
if ($null -ne $binaryAbi) {
    # Legacy binary — strict ABI matching required.
    $matchesSystem = $false
    $matchesElectron = $false
    if ($binaryAbi -eq $nodeAbi) { $matchesSystem = $true }
    if ($electronNodeAbi -and $binaryAbi -eq $electronNodeAbi) { $matchesElectron = $true }

    if ($matchesSystem -or $matchesElectron) {
        Write-Host ("STATUS: ABI match (system={0}, electron={1}) -" -f $(if ($matchesSystem) {"YES"} else {"no"}), $(if ($matchesElectron) {"YES"} else {"no"})) -ForegroundColor Green
        Write-Host "        binary will load under the matching runtime(s)." -ForegroundColor Green
    } else {
        Write-Host "STATUS: ABI MISMATCH for both runtimes - run 'npm test' (rebuilds for system" -ForegroundColor Yellow
        Write-Host "        Node via 'pretest') or 'npm run rebuild' (rebuilds for Electron's Node)." -ForegroundColor Yellow
    }
} else {
    # N-API binary — ABI-agnostic, should work on any Node with a compatible
    # N-API version. Just check the binary exists.
    Write-Host "STATUS: N-API build detected - better-sqlite3 v12+ uses a stable N-API" -ForegroundColor Green
    Write-Host "        ABI that works across Node versions. If 'npm test' fails, run" -ForegroundColor Green
    Write-Host "        it once to trigger the 'pretest' rebuild against your system Node." -ForegroundColor Green
}
