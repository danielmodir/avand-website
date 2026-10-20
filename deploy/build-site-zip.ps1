# Builds dist/toojibee-site.zip: everything in frontend/ (incl. .htaccess)
# plus backend-php/ as api/, ready to upload to the host's public_html and
# extract there. See docs/DEPLOY.md §8.
#
#   powershell -ExecutionPolicy Bypass -File deploy\build-site-zip.ps1
#
# The live package is made lighter for Iran's slow networks, without
# changing what the site does or looks like (the sources in the repo stay
# exactly as written, and GitHub Pages still serves them as they are):
#   - JS and CSS: comments and whitespace removed (esbuild, whitespace-only:
#     no renaming, no reordering);
#   - demo/index.html: the HTML partials (data-include) are put straight
#     into the page, so the app doesn't wait for a second round of requests.
#
# Entry names use "/" on purpose: Windows' built-in zip writes "\", and a
# Linux host's unzip then creates files literally named "demo\index.html"
# instead of folders.
$ErrorActionPreference = 'Stop'
$repo  = Split-Path -Parent $PSScriptRoot
$out   = Join-Path $repo 'dist'
$stage = Join-Path $out 'stage'
New-Item -ItemType Directory -Force $out | Out-Null
if (Test-Path $stage) { Remove-Item -Recurse -Force $stage }
New-Item -ItemType Directory -Force $stage | Out-Null

# 1. Stage: frontend at the root, backend-php as api/ (never its config or tests).
Copy-Item -Recurse -Force (Join-Path $repo 'frontend\*') $stage
Get-ChildItem (Join-Path $repo 'frontend') -Force -Filter '.htaccess' | Copy-Item -Destination $stage -Force
$api = Join-Path $stage 'api'
New-Item -ItemType Directory -Force $api | Out-Null
Copy-Item -Recurse -Force (Join-Path $repo 'backend-php\*') $api
Get-ChildItem (Join-Path $repo 'backend-php') -Force -Filter '.htaccess' | Copy-Item -Destination $api -Force
Get-ChildItem $stage -Recurse -Force -File | Where-Object { $_.Name -eq 'config.php' -or $_.FullName -match '\\tests\\' -or $_.Name -like '_*.html' } | Remove-Item -Force

# 2. Minify JS and CSS in place (stage only).
Push-Location $stage
try {
  & npx -y esbuild@0.24.0 'demo/**/*.js' 'assets/**/*.js' --minify-whitespace --outbase=. --outdir=. --allow-overwrite --log-level=warning
  if ($LASTEXITCODE) { throw 'esbuild (js) failed' }
  & npx -y esbuild@0.24.0 'demo/**/*.css' 'assets/**/*.css' --minify-whitespace --outbase=. --outdir=. --allow-overwrite --log-level=warning
  if ($LASTEXITCODE) { throw 'esbuild (css) failed' }
} finally { Pop-Location }

# 3. demo/index.html: partials inline (include.js then finds nothing to fetch).
$index = Join-Path $stage 'demo\index.html'
$html = [IO.File]::ReadAllText($index)
$html = [regex]::Replace($html, '<div data-include="([^"]+)"></div>', {
  param($m)
  $file = Join-Path (Join-Path $stage 'demo') ($m.Groups[1].Value -replace '/', '\')
  if (-not (Test-Path $file)) { throw "missing partial $($m.Groups[1].Value)" }
  [IO.File]::ReadAllText($file).Trim()
})
# The partial preloads are no longer needed once they're inline.
$html = [regex]::Replace($html, '\s*<link rel="preload" href="components/[^"]+\.html[^"]*" as="fetch"[^>]*>', '')
[IO.File]::WriteAllText($index, $html, (New-Object Text.UTF8Encoding $false))

# 4. Zip with "/" entry names.
$zip = Join-Path $out 'toojibee-site.zip'
if (Test-Path $zip) { Remove-Item $zip }
Add-Type -AssemblyName System.IO.Compression, System.IO.Compression.FileSystem
$fs = [IO.File]::Open($zip, 'Create')
$za = New-Object IO.Compression.ZipArchive($fs, [IO.Compression.ZipArchiveMode]::Create)
try {
  Get-ChildItem $stage -Recurse -File -Force | ForEach-Object {
    $rel = $_.FullName.Substring($stage.Length + 1).Replace('\', '/')
    [void][IO.Compression.ZipFileExtensions]::CreateEntryFromFile($za, $_.FullName, $rel, [IO.Compression.CompressionLevel]::Optimal)
  }
} finally { $za.Dispose(); $fs.Dispose() }

$count = ([IO.Compression.ZipFile]::OpenRead($zip)).Entries.Count
$srcKB = ((Get-ChildItem (Join-Path $repo 'frontend\demo') -Recurse -File -Include *.js,*.css | Measure-Object Length -Sum).Sum / 1KB)
$minKB = ((Get-ChildItem (Join-Path $stage 'demo') -Recurse -File -Include *.js,*.css | Measure-Object Length -Sum).Sum / 1KB)
'{0}  ({1} files, {2:N0} KB)  app JS+CSS {3:N0} KB -> {4:N0} KB' -f $zip, $count, ((Get-Item $zip).Length / 1KB), $srcKB, $minKB
