# Builds installer\dist\MJ-POS-Setup.exe — the POS for other company computers.
#
#   powershell -ExecutionPolicy Bypass -File installer\build-installer.ps1
#
# Needs (once): installer\vendor\ with python-3.13.14-embed-amd64.zip and
# node.exe, Inno Setup 6, and installer\secrets\till_database_url.txt from
# create_till_role.py. The installed POS runs offline-first exactly like this
# machine, but with the restricted mjpos_till database login and its own id
# block (claimed on first start). Nothing here touches the running POS:
# the frontend is built from a copy under installer\build.

$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$pos = Split-Path -Parent $here
$vendor = Join-Path $here "vendor"
$build = Join-Path $here "build"
$stage = Join-Path $build "stage"
$dist = Join-Path $here "dist"

$pyZip = Join-Path $vendor "python-3.13.14-embed-amd64.zip"
$nodeExe = Join-Path $vendor "node.exe"
$tillUrlFile = Join-Path $here "secrets\till_database_url.txt"
$iscc = @("$env:LOCALAPPDATA\Programs\Inno Setup 6\ISCC.exe", "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe") |
    Where-Object { Test-Path $_ } | Select-Object -First 1
foreach ($f in $pyZip, $nodeExe, $tillUrlFile) { if (-not (Test-Path $f)) { throw "Missing $f" } }
if (-not $iscc) { throw "Inno Setup 6 not found (winget install JRSoftware.InnoSetup)" }
$venvPy = Join-Path $pos "backend\.venv\Scripts\python.exe"

function Step($text) { Write-Host "`n== $text" -ForegroundColor Cyan }
function Robo($from, $to, [string[]]$extra) {
    & robocopy $from $to /E /NFL /NDL /NJH /NJS /NP /MT:16 @extra | Out-Null
    if ($LASTEXITCODE -ge 8) { throw "robocopy $from failed ($LASTEXITCODE)" }
}

Step "Clean"
if (Test-Path $stage) { Remove-Item -Recurse -Force $stage }
New-Item -ItemType Directory -Force $stage, $dist | Out-Null

Step "Python runtime"
$py = Join-Path $stage "runtime\python"
Expand-Archive $pyZip $py
# The ._pth file fixes sys.path for the embeddable build: stdlib, packages,
# and the backend folder (so "python -m app...." works from anywhere).
Set-Content (Join-Path $py "python313._pth") -Encoding ascii -Value @(
    "python313.zip", ".", "Lib\site-packages", "..\..\backend", "import site")
$req = Get-Content (Join-Path $pos "backend\requirements.txt") | Where-Object { $_ -notmatch '^\s*pytest' }
$reqFile = Join-Path $build "requirements-till.txt"
Set-Content $reqFile $req -Encoding ascii
& $venvPy -m pip install --disable-pip-version-check --no-compile --quiet --target (Join-Path $py "Lib\site-packages") -r $reqFile
if ($LASTEXITCODE -ne 0) { throw "pip install failed" }

Step "Node runtime"
New-Item -ItemType Directory -Force (Join-Path $stage "runtime\node") | Out-Null
Copy-Item $nodeExe (Join-Path $stage "runtime\node\node.exe")

Step "Backend"
Robo (Join-Path $pos "backend\app") (Join-Path $stage "backend\app") @("/XD", "__pycache__", "tests")
# Till settings: the restricted login only. No Cloudinary secret and no
# website admin key — tills never need them, so the installer never carries them.
$tillUrl = (Get-Content $tillUrlFile -Raw).Trim()
# (UTF-8 without a BOM: PowerShell 5's -Encoding utf8 adds one, which corrupts the first key.)
[IO.File]::WriteAllLines((Join-Path $stage "backend\.env"), [string[]]@(
    "DATABASE_URL=$tillUrl", "ENVIRONMENT=production", "ACCESS_TOKEN_EXPIRE_MINUTES=480",
    "CLOUDINARY_CLOUD_NAME=dm0r8tvwf"), (New-Object Text.UTF8Encoding $false))

Step "Frontend (standalone build from a copy)"
$src = Join-Path $build "frontend-src"
Robo (Join-Path $pos "frontend") $src @("/XD", ".next", ".git", "/XF", "*.log", "*.err", "tsconfig.tsbuildinfo", "/PURGE")
Push-Location $src
try {
    $env:MJPOS_STANDALONE = "1"
    & node (Join-Path $src "node_modules\next\dist\bin\next") build
    if ($LASTEXITCODE -ne 0) { throw "next build failed" }
} finally { Remove-Item Env:\MJPOS_STANDALONE -ErrorAction SilentlyContinue; Pop-Location }
$fe = Join-Path $stage "frontend"
Robo (Join-Path $src ".next\standalone") $fe
Robo (Join-Path $src ".next\static") (Join-Path $fe ".next\static")
Robo (Join-Path $src "public") (Join-Path $fe "public")
if (-not (Test-Path (Join-Path $fe "server.js"))) { throw "standalone server.js missing" }

Step "Launcher"
& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $pos "Launcher\build-launcher.ps1") -Out (Join-Path $stage "MJ POS.exe")
if ($LASTEXITCODE -ne 0) { throw "launcher build failed" }
Copy-Item (Join-Path $pos "MJPOS.ico") $stage

Step "Installer"
& $iscc /Q "/O$dist" "/DStageDir=$stage" (Join-Path $here "MJPOS.iss")
if ($LASTEXITCODE -ne 0) { throw "Inno Setup failed" }
$out = Get-Item (Join-Path $dist "MJ-POS-Setup.exe")
Write-Host ("`nBuilt {0} ({1:N0} MB)" -f $out.FullName, ($out.Length / 1MB)) -ForegroundColor Green
Write-Host "It contains the till database login: share it privately (not on the public website)."
