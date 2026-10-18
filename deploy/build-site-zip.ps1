# Builds dist/toojibee-site.zip: everything in frontend/ (incl. .htaccess),
# ready to upload to the host's public_html and extract there.
# See docs/DEPLOY.md §8.
#
#   powershell -ExecutionPolicy Bypass -File deploy\build-site-zip.ps1
#
# Entry names use "/" on purpose: Windows' built-in zip writes "\", and a
# Linux host's unzip then creates files literally named "demo\index.html"
# instead of folders.
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$root = Join-Path $repo 'frontend'
$out  = Join-Path $repo 'dist'
New-Item -ItemType Directory -Force $out | Out-Null
$zip = Join-Path $out 'toojibee-site.zip'
if (Test-Path $zip) { Remove-Item $zip }

Add-Type -AssemblyName System.IO.Compression, System.IO.Compression.FileSystem
$fs = [IO.File]::Open($zip, 'Create')
$za = New-Object IO.Compression.ZipArchive($fs, [IO.Compression.ZipArchiveMode]::Create)
function Add-Tree($za, $dir, $prefix) {
  Get-ChildItem $dir -Recurse -File -Force | Where-Object { $_.Name -notlike 'config.php' -and $_.FullName -notmatch '\\tests\\' } | ForEach-Object {
    $rel = $prefix + $_.FullName.Substring($dir.Length + 1).Replace('\', '/')
    [void][IO.Compression.ZipFileExtensions]::CreateEntryFromFile($za, $_.FullName, $rel, [IO.Compression.CompressionLevel]::Optimal)
  }
}
try {
  Add-Tree $za $root ''
  # The PHP API (backend-php/) is served from /api on the same host.
  # Its config with the DB password lives outside public_html and is
  # never part of this package.
  Add-Tree $za (Join-Path $repo 'backend-php') 'api/'
} finally { $za.Dispose(); $fs.Dispose() }

$count = ([IO.Compression.ZipFile]::OpenRead($zip)).Entries.Count
'{0}  ({1} files, {2:N0} KB)' -f $zip, $count, ((Get-Item $zip).Length / 1KB)
