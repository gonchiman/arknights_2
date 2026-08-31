$ErrorActionPreference = 'Stop'

$inputDoc = 'C:\Users\legen\Documents\arknights_2\tmp\enemy_notation_doc\smoke.docx'
$outputDir = 'C:\Users\legen\Documents\arknights_2\tmp\enemy_notation_doc\render-smoke'
$pdfPath = Join-Path $outputDir 'smoke.pdf'

New-Item -ItemType Directory -Path $outputDir -Force | Out-Null

$word = New-Object -ComObject Word.Application
$word.Visible = $false
$word.DisplayAlerts = 0
$word.AutomationSecurity = 3
$word.Options.PrintBackground = $false
$document = $null

try {
  Write-Output 'WORD_STARTED'
  $document = $word.Documents.OpenNoRepairDialog($inputDoc, $false, $true, $false)
  Write-Output 'DOCUMENT_OPENED'
  $pageCount = $document.ComputeStatistics(2)
  Write-Output "PAGE_COUNT=$pageCount"
  $document.ExportAsFixedFormat($pdfPath, 17)
  Write-Output 'PDF_EXPORTED'
  [pscustomobject]@{
    Pdf = $pdfPath
    Pages = $pageCount
    Paragraphs = $document.Paragraphs.Count
    Tables = $document.Tables.Count
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
