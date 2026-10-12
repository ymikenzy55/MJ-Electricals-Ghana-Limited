# Builds "MJ POS.exe" (and MJPOS.ico) with the C# compiler that ships with
# Windows — no SDK install needed. Run from anywhere:
#   powershell -ExecutionPolicy Bypass -File Launcher\build-launcher.ps1
#   ... -Out <path>   compile to another location (used by the till installer build)
param([string]$Out)

$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = Split-Path -Parent $here
$csc = "$env:WINDIR\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
if (-not (Test-Path $csc)) { throw "C# compiler not found at $csc" }

# ---- icon: a proper multi-size .ico built from the company logo -------------
$ico = Join-Path $root "MJPOS.ico"
$logo = Join-Path $root "frontend\public\MJ_Logo.png"
if (-not (Test-Path $logo)) { $logo = Join-Path $root "frontend\public\MJ_Logo.jpg" }
if (Test-Path $logo) {
    Add-Type -AssemblyName System.Drawing
    $src = [System.Drawing.Image]::FromFile($logo)
    $sizes = 16, 32, 48, 64, 128, 256
    $pngs = foreach ($s in $sizes) {
        $bmp = New-Object System.Drawing.Bitmap $s, $s
        $g = [System.Drawing.Graphics]::FromImage($bmp)
        $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
        $g.Clear([System.Drawing.Color]::FromArgb(6, 17, 97))
        $g.DrawImage($src, 0, 0, $s, $s)
        $ms = New-Object System.IO.MemoryStream
        $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
        ,$ms.ToArray()
        $g.Dispose(); $bmp.Dispose()
    }
    $src.Dispose()
    $fs = [System.IO.File]::Create($ico)
    $bw = New-Object System.IO.BinaryWriter $fs
    $bw.Write([uint16]0); $bw.Write([uint16]1); $bw.Write([uint16]$sizes.Count)
    $offset = 6 + 16 * $sizes.Count
    for ($i = 0; $i -lt $sizes.Count; $i++) {
        $s = $sizes[$i]; $len = $pngs[$i].Length
        $bw.Write([byte]($(if ($s -ge 256) { 0 } else { $s }))); $bw.Write([byte]($(if ($s -ge 256) { 0 } else { $s })))
        $bw.Write([byte]0); $bw.Write([byte]0); $bw.Write([uint16]1); $bw.Write([uint16]32)
        $bw.Write([uint32]$len); $bw.Write([uint32]$offset)
        $offset += $len
    }
    foreach ($p in $pngs) { $bw.Write($p) }
    $bw.Close(); $fs.Close()
    Write-Host "Icon written: $ico"
}

# ---- compile ------------------------------------------------------------------
$exe = if ($Out) { $Out } else { Join-Path $root "MJ POS.exe" }
$args = @("/nologo", "/target:winexe", "/optimize+", "/out:$exe",
          "/reference:System.Windows.Forms.dll", "/reference:System.Drawing.dll",
          (Join-Path $here "MJPOS.cs"))
if (Test-Path $ico) { $args = @("/win32icon:$ico") + $args }
& $csc @args
if ($LASTEXITCODE -ne 0) { throw "Compilation failed" }
Write-Host "Built: $exe"
