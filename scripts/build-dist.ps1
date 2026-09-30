<#
  Copies the publishable parts of the site into dist/. No npm, no build
  step — this only assembles the same static files into one clean folder
  so nothing internal (docs/, SPEC.md, CLAUDE.md, .git) accidentally gets
  uploaded. See DEPLOY.md for what goes on the host.
#>

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$dist = Join-Path $root 'dist'

if (Test-Path $dist) {
  Remove-Item $dist -Recurse -Force
}
New-Item -ItemType Directory -Path $dist | Out-Null

$items = @('index.html', 'robots.txt', 'sitemap.xml', 'en', 'fa', 'demo', 'assets')

foreach ($item in $items) {
  $source = Join-Path $root $item
  if (-not (Test-Path $source)) {
    Write-Warning "Skipping missing item: $item"
    continue
  }
  Copy-Item -Path $source -Destination $dist -Recurse -Force
}

Write-Host "dist/ ready at $dist"
