# Builds the Android app (android/, see android/README.md):
#   1. the site package (deploy/build-site-zip.ps1), so the APK carries
#      exactly the files the live site serves, and demo/app-files.json;
#   2. those files into android/app/src/main/assets/web/;
#   3. Gradle: a signed release APK when android/keystore.properties exists
#      (deploy/make-keystore.ps1), otherwise a debug APK for testing.
# The APK lands in dist/ with its size and SHA-256 printed (download page).
#
#   powershell -ExecutionPolicy Bypass -File deploy\build-android.ps1 [-Debug] [-SkipSite] [-Offline]
param([switch]$Debug, [switch]$SkipSite, [switch]$Offline)
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$android = Join-Path $repo 'android'

if (-not $SkipSite) { & (Join-Path $PSScriptRoot 'build-site-zip.ps1') }
$stage = Join-Path $repo 'dist\stage'
$listFile = Join-Path $stage 'demo\app-files.json'
if (-not (Test-Path $listFile)) { throw 'dist\stage has no demo\app-files.json: run without -SkipSite' }
$list = [IO.File]::ReadAllText($listFile) | ConvertFrom-Json

$web = Join-Path $android 'app\src\main\assets\web'
if (Test-Path $web) { Remove-Item -Recurse -Force $web }
foreach ($f in @($list.files.PSObject.Properties.Name) + 'demo/app-files.json') {
  $to = Join-Path $web ($f -replace '/', '\')
  New-Item -ItemType Directory -Force (Split-Path $to) | Out-Null
  Copy-Item (Join-Path $stage ($f -replace '/', '\')) $to
}

# Gradle 8.4 runs on JDK 17-20 (not 21): use one of those if JAVA_HOME isn't.
$jdk = $env:JAVA_HOME
if (-not $jdk -or -not (Test-Path (Join-Path $jdk 'bin\java.exe')) -or $jdk -match 'jdk-21') {
  $jdk = Get-ChildItem 'C:\Program Files\Java', 'C:\Program Files\Android\Android Studio' -Directory -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -match '^(jdk-(17|18|19|20)|jbr)' } | Select-Object -First 1 -ExpandProperty FullName
  if (-not $jdk) { throw 'No JDK 17-20 found: install one, or set JAVA_HOME to it' }
}
$env:JAVA_HOME = $jdk
if (-not (Test-Path (Join-Path $android 'local.properties'))) {
  $sdk = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { Join-Path $env:LOCALAPPDATA 'Android\Sdk' }
  [IO.File]::WriteAllText((Join-Path $android 'local.properties'), 'sdk.dir=' + ($sdk -replace '\\', '/'))
}

$release = (-not $Debug) -and (Test-Path (Join-Path $android 'keystore.properties'))
$task = if ($release) { 'assembleRelease' } else { 'assembleDebug' }
$gradleArgs = @($task, '-q')
if ($Offline) { $gradleArgs += '--offline' }
Push-Location $android
try {
  & .\gradlew.bat @gradleArgs
  if ($LASTEXITCODE) { throw "gradle $task failed" }
} finally { Pop-Location }

$version = ([regex]::Match([IO.File]::ReadAllText((Join-Path $android 'app\build.gradle.kts')), 'versionName = "([^"]+)"')).Groups[1].Value
$kind = if ($release) { 'release' } else { 'debug' }
$apk = Join-Path $android "app\build\outputs\apk\$kind\app-$kind.apk"
$name = if ($release) { "toojibee-$version.apk" } else { "toojibee-$version-debug.apk" }
$out = Join-Path $repo "dist\$name"
Copy-Item -Force $apk $out
$item = Get-Item $out
'{0}  {1:N2} MB  SHA-256 {2}' -f $out, ($item.Length / 1MB), (Get-FileHash -Algorithm SHA256 $out).Hash.ToLower()
if (-not $release) { 'Debug build (for testing only): create the release key with deploy\make-keystore.ps1 before publishing.' }
