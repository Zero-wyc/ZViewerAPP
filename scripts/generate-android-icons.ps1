Add-Type -AssemblyName System.Drawing
$root = Split-Path $PSScriptRoot -Parent
$source = [System.Drawing.Image]::FromFile((Join-Path $root 'public/favicon.jpg'))
$res = Join-Path $root 'ZV-Android/app/src/main/res'

function Export-Icon([string]$Path, [int]$Size, [int]$Inset = 0, [bool]$Round = $false) {
    $bitmap = [System.Drawing.Bitmap]::new($Size, $Size)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $clip = $null
    try {
        $graphics.Clear([System.Drawing.Color]::Transparent)
        $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
        if ($Round) {
            $clip = [System.Drawing.Drawing2D.GraphicsPath]::new()
            $clip.AddEllipse(0, 0, $Size, $Size)
            $graphics.SetClip($clip)
        }
        $graphics.DrawImage($source, $Inset, $Inset, ($Size - 2 * $Inset), ($Size - 2 * $Inset))
        $bitmap.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
    } finally {
        if ($clip) { $clip.Dispose() }
        $graphics.Dispose()
        $bitmap.Dispose()
    }
}

try {
    foreach ($density in @(
        @{ Name = 'mdpi'; Scale = 1 },
        @{ Name = 'hdpi'; Scale = 1.5 },
        @{ Name = 'xhdpi'; Scale = 2 },
        @{ Name = 'xxhdpi'; Scale = 3 },
        @{ Name = 'xxxhdpi'; Scale = 4 }
    )) {
        $directory = Join-Path $res "mipmap-$($density.Name)"
        $size = [int](48 * $density.Scale)
        Export-Icon (Join-Path $directory 'ic_launcher.png') $size
        Export-Icon (Join-Path $directory 'ic_launcher_round.png') $size 0 $true
        # Adaptive icons mask the central 72dp of a 108dp layer.
        Export-Icon (Join-Path $directory 'ic_launcher_foreground.png') ([int](108 * $density.Scale)) ([int](18 * $density.Scale))
    }
} finally {
    $source.Dispose()
}
