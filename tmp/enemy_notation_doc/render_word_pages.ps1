$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$inputDoc = 'C:\Users\legen\Documents\arknights_2\docs\enemy-defense-resistance-notation-guide.docx'
$outputDir = 'C:\Users\legen\Documents\arknights_2\tmp\enemy_notation_doc\render-emf-v3'

New-Item -ItemType Directory -Path $outputDir -Force | Out-Null

$word = New-Object -ComObject Word.Application
$word.Visible = $false
$word.DisplayAlerts = 0
$word.AutomationSecurity = 3
$document = $null

try {
  Write-Output 'WORD_STARTED'
  $document = $word.Documents.OpenNoRepairDialog($inputDoc, $false, $true, $false)
  Write-Output 'DOCUMENT_OPENED'
  $document.ActiveWindow.View.Type = 3
  $document.Repaginate()
  $pageCount = $document.ComputeStatistics(2)
  Write-Output "PAGE_COUNT=$pageCount"

  $pages = $document.ActiveWindow.Panes.Item(1).Pages
  if ($pages.Count -ne $pageCount) {
    throw "Pages collection mismatch: expected $pageCount, got $($pages.Count)"
  }

  for ($index = 1; $index -le $pageCount; $index++) {
    $page = $pages.Item($index)
    [byte[]]$bits = $page.EnhMetaFileBits
    $emfPath = Join-Path $outputDir ("page-{0}.emf" -f $index)
    $pngPath = Join-Path $outputDir ("page-{0}.png" -f $index)
    [System.IO.File]::WriteAllBytes($emfPath, $bits)

    $metafile = [System.Drawing.Image]::FromFile($emfPath)
    try {
      $bitmap = New-Object System.Drawing.Bitmap 1275, 1650
      $bitmap.SetResolution(150, 150)
      $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
      try {
        $graphics.Clear([System.Drawing.Color]::White)
        $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
        $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        $graphics.DrawImage($metafile, 0, 0, 1275, 1650)
        $bitmap.Save($pngPath, [System.Drawing.Imaging.ImageFormat]::Png)
      }
      finally {
        $graphics.Dispose()
        $bitmap.Dispose()
      }
    }
    finally {
      $metafile.Dispose()
      [System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($page) | Out-Null
    }
    Write-Output "RENDERED_PAGE=$index"
  }
}
finally {
  if ($null -ne $document) {
    $document.Close([ref]0)
    [System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($document) | Out-Null
  }
  $word.Quit()
  [System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($word) | Out-Null
}
