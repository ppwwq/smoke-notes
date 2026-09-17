# Regenerate web icons from the desktop app's canonical artwork.
Add-Type -AssemblyName System.Drawing
$root = Split-Path $PSScriptRoot -Parent
$source = [Drawing.Image]::FromFile((Join-Path $root 'apps/desktop/build/icon.png'))
try {
  foreach ($item in @(@('icon-32.png',32,$false), @('apple-touch-icon.png',180,$true), @('icon-192.png',192,$false), @('icon-512.png',512,$false), @('icon-maskable-512.png',512,$true))) {
    $size = [int]$item[1]
    $bitmap = [Drawing.Bitmap]::new($size,$size)
    $graphics = [Drawing.Graphics]::FromImage($bitmap)
    try {
      $graphics.InterpolationMode = [Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
      $graphics.PixelOffsetMode = [Drawing.Drawing2D.PixelOffsetMode]::HighQuality
      $padding = 0
      if ($item[2]) {
        $graphics.Clear([Drawing.ColorTranslator]::FromHtml('#0d1013'))
        $padding = [int]($size * 0.15)
      }
      $graphics.DrawImage($source,$padding,$padding,($size - 2*$padding),($size - 2*$padding))
      $bitmap.Save((Join-Path $root ('apps/web/public/' + $item[0])),[Drawing.Imaging.ImageFormat]::Png)
    } finally { $graphics.Dispose(); $bitmap.Dispose() }
  }
} finally { $source.Dispose() }
