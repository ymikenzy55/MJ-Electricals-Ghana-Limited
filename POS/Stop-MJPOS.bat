@echo off
REM Stops the POS servers (use if the tray icon is not available).
powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 8000,3000 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }; Get-Process 'MJ POS' -ErrorAction SilentlyContinue | Stop-Process -Force"
echo MJ POS stopped.
