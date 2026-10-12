# Stops every MJ Electricals server started by Start-All.ps1 (POS, Website, Payroll)
# and the POS tray launcher. Only processes running from this folder are touched.
#
#   powershell -ExecutionPolicy Bypass -File Stop-All.ps1

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$procs = Get-CimInstance Win32_Process | Where-Object {
    $_.Name -in 'python.exe', 'node.exe', 'cmd.exe', 'MJ POS.exe' -and
    ($_.CommandLine -like "*$root*" -or $_.ExecutablePath -like "$root*")
}
if (-not $procs) { Write-Host "Nothing running."; return }
foreach ($p in $procs) {
    & taskkill /PID $p.ProcessId /T /F 2>$null | Out-Null
}
Start-Sleep 1
$busy = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
    Where-Object { 3000, 3001, 3002, 8000, 8001, 8002 -contains $_.LocalPort }
if ($busy) { Write-Host ("Still listening: " + (($busy.LocalPort | Sort-Object -Unique) -join ", ")) }
else { Write-Host "Stopped. Ports 3000-3002 and 8000-8002 are free." }
