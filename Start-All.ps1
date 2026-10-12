# Starts every MJ Electricals server (idempotent — anything already running is left alone).
#
#   POS       backend :8000  frontend :3000   (offline-first local mode, via "MJ POS.exe")
#   Website   backend :8001  frontend :3001
#   Payroll   backend :8002  frontend :3002
#
#   powershell -ExecutionPolicy Bypass -File Start-All.ps1
#   powershell -ExecutionPolicy Bypass -File Start-All.ps1 -NoPos      # website + payroll only
param([switch]$NoPos)

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$node = (Get-Command node.exe -ErrorAction Stop).Source

function Test-Up($url) {
    try { $null = Invoke-WebRequest $url -UseBasicParsing -TimeoutSec 2; return $true }
    catch { return ($_.Exception.Response -ne $null) }
}

function Start-Server($name, $health, $exe, $arguments, $dir, $logName) {
    if (Test-Up $health) { Write-Host "[skip] $name already running"; return }
    $logDir = Join-Path $root "logs"; New-Item -ItemType Directory -Force $logDir | Out-Null
    Start-Process -FilePath $exe -ArgumentList $arguments -WorkingDirectory $dir -WindowStyle Hidden `
        -RedirectStandardOutput (Join-Path $logDir "$logName.out.log") -RedirectStandardError (Join-Path $logDir "$logName.err.log")
    Write-Host "[start] $name"
}

function Backend($name, $dir, $port) {
    $py = Join-Path $dir ".venv\Scripts\python.exe"
    Start-Server "$name backend" "http://127.0.0.1:$port/api/v1/health" $py "-m uvicorn app.main:app --host 127.0.0.1 --port $port --no-access-log" $dir "$($name.ToLower())-backend"
}
function Frontend($name, $dir, $port) {
    $next = Join-Path $dir "node_modules\next\dist\bin\next"
    if (-not (Test-Path (Join-Path $dir ".next\BUILD_ID"))) {
        Write-Host "[build] $name frontend (first run)..."
        Push-Location $dir; & $node $next build | Out-Null; Pop-Location
    }
    Start-Server "$name frontend" "http://localhost:$port" $node "`"$next`" start -p $port" $dir "$($name.ToLower())-frontend"
}

Backend  "Website" (Join-Path $root "Website\backend") 8001
Backend  "Payroll" (Join-Path $root "Payroll\backend") 8002
Frontend "Website" (Join-Path $root "Website\frontend") 3001
Frontend "Payroll" (Join-Path $root "Payroll\frontend") 3002

if (-not $NoPos) {
    if ((Test-Up "http://127.0.0.1:8000/api/v1/health") -and (Test-Up "http://localhost:3000")) {
        Write-Host "[skip] POS already running"
    } else {
        Start-Process -FilePath (Join-Path $root "POS\MJ POS.exe") -ArgumentList "--minimized"
        Write-Host "[start] POS (tray app: backend :8000, frontend :3000)"
    }
}

Write-Host "`nWaiting for servers..."
$targets = @(
    @("Website API", "http://127.0.0.1:8001/api/v1/health"), @("Payroll API", "http://127.0.0.1:8002/api/v1/health"),
    @("Website", "http://localhost:3001"), @("Payroll", "http://localhost:3002"))
if (-not $NoPos) { $targets += ,@("POS API", "http://127.0.0.1:8000/api/v1/health"), @("POS", "http://localhost:3000") }
foreach ($t in $targets) {
    $ok = $false
    for ($i = 0; $i -lt 90 -and -not $ok; $i++) { if (Test-Up $t[1]) { $ok = $true } else { Start-Sleep 1 } }
    Write-Host ("{0,-12} {1}" -f $t[0], $(if ($ok) { "UP   $($t[1])" } else { "NOT RESPONDING (see logs\)" }))
}
