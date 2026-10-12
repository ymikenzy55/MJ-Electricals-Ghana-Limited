# MJ Electricals POS — one-click local launcher
#
# Starts the local backend (SQLite + cloud sync), the frontend, and opens
# the POS in the browser. Safe to run repeatedly — it detects services that
# are already up and does not start duplicates.

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$backendDir = Join-Path $root "backend"
$frontendDir = Join-Path $root "frontend"
$python = Join-Path $backendDir ".venv\Scripts\python.exe"
$backendUrl = "http://127.0.0.1:8000"
$frontendUrl = "http://localhost:3000"

function Test-Endpoint($url) {
    try {
        $null = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 2
        return $true
    } catch {
        return $false
    }
}

# --- Backend -------------------------------------------------------------
if (Test-Endpoint "$backendUrl/api/v1/health") {
    Write-Host "POS backend already running on $backendUrl"
} else {
    Write-Host "Starting POS backend (local offline-first mode)..."
    $env:POS_MODE = "local"
    $env:LOCAL_DATABASE_URL = "sqlite:///$($backendDir -replace '\\','/')/data/mjpos_local.db"
    Start-Process -FilePath $python `
        -ArgumentList "-m","uvicorn","app.main:app","--host","127.0.0.1","--port","8000" `
        -WorkingDirectory $backendDir `
        -WindowStyle Hidden

    $ready = $false
    for ($i = 0; $i -lt 30; $i++) {
        Start-Sleep -Seconds 1
        if (Test-Endpoint "$backendUrl/api/v1/health") { $ready = $true; break }
    }
    if (-not $ready) {
        Write-Host "ERROR: backend did not start within 30 seconds." -ForegroundColor Red
        exit 1
    }
    Write-Host "Backend is up."
}

# --- Frontend ------------------------------------------------------------
if (Test-Endpoint $frontendUrl) {
    Write-Host "POS frontend already running on $frontendUrl"
} else {
    Write-Host "Starting POS frontend..."
    $npm = (Get-Command npm.cmd -ErrorAction SilentlyContinue).Source
    if (-not $npm) { $npm = "npm.cmd" }

    $built = Test-Path (Join-Path $frontendDir ".next\BUILD_ID")
    $args = if ($built) { @("run","start") } else { @("run","dev") }

    Start-Process -FilePath $npm `
        -ArgumentList $args `
        -WorkingDirectory $frontendDir `
        -WindowStyle Hidden

    $ready = $false
    for ($i = 0; $i -lt 60; $i++) {
        Start-Sleep -Seconds 1
        if (Test-Endpoint $frontendUrl) { $ready = $true; break }
    }
    if (-not $ready) {
        Write-Host "ERROR: frontend did not start within 60 seconds." -ForegroundColor Red
        exit 1
    }
    Write-Host "Frontend is up."
}

# --- Open the POS ---------------------------------------------------------
Write-Host "Opening MJ Electricals POS at $frontendUrl ..."
Start-Process $frontendUrl
