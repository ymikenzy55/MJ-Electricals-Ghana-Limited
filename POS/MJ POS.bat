@echo off
REM MJ Electricals POS - launcher. Opens the POS application (same as MJ POS.exe).
if exist "%~dp0MJ POS.exe" (
  start "" "%~dp0MJ POS.exe"
) else (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Start-MJPOS.ps1"
)
