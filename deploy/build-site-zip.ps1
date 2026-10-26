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
  # Full minify (whitespace, syntax, local names). Each file is a classic
  # script, not a bundle: esbuild leaves every top-level name as it is, so the
  # globals shared between files (and called from the Android app, e.g.
  # applyPhoneActions) keep their names. Less to download and parse on phones.
  & npx -y esbuild@0.24.0 'demo/**/*.js' 'assets/**/*.js' --minify --outbase=. --outdir=. --allow-overwrite --log-level=warning
  if ($LASTEXITCODE) { throw 'esbuild (js) failed' }
  & npx -y esbuild@0.24.0 'demo/**/*.css' 'assets/**/*.css' --minify --outbase=. --outdir=. --allow-overwrite --log-level=warning
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

# 3b. One stylesheet and one script instead of ~50 files: on Iran's slow,
#     high-latency networks (HTTP/1.1, a few connections at a time) the
#     number of requests costs more than the bytes. Same files, same order
#     (classic scripts already share one global scope, so joining them
#     changes nothing). The CSS bundle sits in css/ so base.css's relative
#     font paths stay right; component CSS has no url()s.
$ver = ([regex]::Match($html, 'css/base\.css\?v=([^"]+)')).Groups[1].Value
$cssFiles = [regex]::Matches($html, '<link rel="stylesheet" href="([^"?]+\.css)\?v=[^"]*">') | ForEach-Object { $_.Groups[1].Value }
$css = ($cssFiles | ForEach-Object { [IO.File]::ReadAllText((Join-Path (Join-Path $stage 'demo') ($_ -replace '/', '\'))).Trim() }) -join "`n"
[IO.File]::WriteAllText((Join-Path $stage 'demo\css\bundle.css'), $css, (New-Object Text.UTF8Encoding $false))
# Fallbacks for phones with an old WebView/Chrome (inset, dvh, color-mix):
# a current browser still applies the original declarations.
& node (Join-Path $PSScriptRoot 'css-compat.js') (Join-Path $stage 'demo\css\bundle.css')
if ($LASTEXITCODE) { throw 'css-compat failed' }
$first = $true
$html = [regex]::Replace($html, '<link rel="stylesheet" href="[^"?]+\.css\?v=[^"]*">\r?\n?', {
  param($m)
  if ($script:first) { $script:first = $false; return "<link rel=`"stylesheet`" href=`"css/bundle.css?v=$ver`">`n" }
  ''
})
$jsFiles = [regex]::Matches($html, '<script src="([^"?]+\.js)\?v=[^"]*"></script>') | ForEach-Object { $_.Groups[1].Value }
$js = ($jsFiles | ForEach-Object { ";`n" + [IO.File]::ReadAllText((Join-Path (Join-Path $stage 'demo') ($_ -replace '/', '\'))).Trim() }) -join "`n"
[IO.File]::WriteAllText((Join-Path $stage 'demo\js\bundle.js'), $js, (New-Object Text.UTF8Encoding $false))
$first = $true
$html = [regex]::Replace($html, '<script src="[^"?]+\.js\?v=[^"]*"></script>\r?\n?', {
  param($m)
  if ($script:first) { $script:first = $false; return "<script src=`"js/bundle.js?v=$ver`"></script>`n" }
  ''
})
if ($cssFiles.Count -lt 10 -or $jsFiles.Count -lt 20) { throw "bundling found too few files ($($cssFiles.Count) css, $($jsFiles.Count) js)" }
[IO.File]::WriteAllText($index, $html, (New-Object Text.UTF8Encoding $false))

# 3c. demo/app-files.json: the files the Android app (android/) keeps on the
#     phone, each with a content hash (SHA-256, first 16 hex digits — the
#     same as WebFiles.kt), so an installed app downloads only the files
#     that changed. deploy/build-android.ps1 puts the same files in the APK.
$appFiles = @(
  'demo/index.html', 'demo/css/bundle.css', 'demo/js/bundle.js',
  'assets/fonts/baloo-bhaijaan-2/BalooBhaijaan2-Arabic-VF.woff2',
  'assets/fonts/baloo-bhaijaan-2/BalooBhaijaan2-Latin-VF.woff2',
  'assets/data/occasions.json', 'assets/data/hijri-months.json',
  'assets/icons/logo.svg', 'assets/icons/icon-192.png', 'assets/icons/favicon-48.png'
)
$hashes = [ordered]@{}
foreach ($f in $appFiles) {
  $p = Join-Path $stage ($f -replace '/', '\')
  if (-not (Test-Path $p)) { throw "app file missing: $f" }
  $hashes[$f] = (Get-FileHash -Algorithm SHA256 $p).Hash.Substring(0, 16).ToLower()
}
# minApp: the oldest APK (versionCode) these files work with — raise it when
# the web app starts needing something new from the bridge (js/core/android.js).
$appList = [ordered]@{ built = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds(); minApp = 1; files = $hashes }
[IO.File]::WriteAllText((Join-Path $stage 'demo\app-files.json'), ($appList | ConvertTo-Json -Compress), (New-Object Text.UTF8Encoding $false))

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
