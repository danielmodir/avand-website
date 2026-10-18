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
try {
  Get-ChildItem $root -Recurse -File -Force | ForEach-Object {
    $rel = $_.FullName.Substring($root.Length + 1).Replace('\', '/')
    [void][IO.Compression.ZipFileExtensions]::CreateEntryFromFile($za, $_.FullName, $rel, [IO.Compression.CompressionLevel]::Optimal)
  }
} finally { $za.Dispose(); $fs.Dispose() }

$count = ([IO.Compression.ZipFile]::OpenRead($zip)).Entries.Count
'{0}  ({1} files, {2:N0} KB)' -f $zip, $count, ((Get-Item $zip).Length / 1KB)
