# Creates the "MJ Electricals POS" shortcuts for the POS application.
#
#   powershell -ExecutionPolicy Bypass -File Install-Desktop-Shortcut.ps1            # desktop + Start menu
#   powershell -ExecutionPolicy Bypass -File Install-Desktop-Shortcut.ps1 -AutoStart # also start with Windows
#
# Run once after setup (or whenever the install folder moves).
param([switch]$AutoStart)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$exe = Join-Path $root "MJ POS.exe"

if (-not (Test-Path $exe)) {
    Write-Host "MJ POS.exe not found - building it first..."
    & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $root "Launcher\build-launcher.ps1")
}
$ico = Join-Path $root "MJPOS.ico"
$shell = New-Object -ComObject WScript.Shell

function New-Shortcut($path, $arguments) {
    $lnk = $shell.CreateShortcut($path)
    $lnk.TargetPath = $exe
    $lnk.Arguments = $arguments
    $lnk.WorkingDirectory = $root
    $lnk.Description = "MJ Electricals POS - works online and offline"
    if (Test-Path $ico) { $lnk.IconLocation = "$ico,0" }
    $lnk.Save()
    Write-Host "Created: $path"
}

New-Shortcut (Join-Path ([Environment]::GetFolderPath("Desktop")) "MJ Electricals POS.lnk") ""
New-Shortcut (Join-Path ([Environment]::GetFolderPath("Programs")) "MJ Electricals POS.lnk") ""

if ($AutoStart) {
    # Start hidden in the tray at login so cloud sync keeps running all day.
    New-Shortcut (Join-Path ([Environment]::GetFolderPath("Startup")) "MJ Electricals POS.lnk") "--minimized"
}
Write-Host "`nDone. Double-click 'MJ Electricals POS' on the desktop to open the POS."
