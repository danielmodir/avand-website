# Creates the Android app's release signing key — ONCE, by the repo owner.
# Every update of the app must be signed with this same key, or phones
# refuse to install it over the old one: keep a backup of both files
# below (outside the repo, e.g. on a USB stick) and of the password.
#
#   powershell -ExecutionPolicy Bypass -File deploy\make-keystore.ps1
#
# Writes android/toojibee-release.jks and android/keystore.properties (the
# password Gradle signs with). Both are in android/.gitignore: never commit them.
$ErrorActionPreference = 'Stop'
$android = Join-Path (Split-Path -Parent $PSScriptRoot) 'android'
$jks = Join-Path $android 'toojibee-release.jks'
if (Test-Path $jks) { throw "$jks already exists: it is the app's key, don't replace it" }

$keytool = Get-ChildItem 'C:\Program Files\Java' -Directory | ForEach-Object { Join-Path $_.FullName 'bin\keytool.exe' } | Where-Object { Test-Path $_ } | Select-Object -First 1
if ($env:JAVA_HOME -and (Test-Path (Join-Path $env:JAVA_HOME 'bin\keytool.exe'))) { $keytool = Join-Path $env:JAVA_HOME 'bin\keytool.exe' }
if (-not $keytool) { throw 'keytool not found (it comes with the JDK)' }

$p1 = Read-Host 'Password for the key (at least 8 characters)' -AsSecureString
$p2 = Read-Host 'The same password again' -AsSecureString
$plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($p1))
$again = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($p2))
if ($plain -ne $again) { throw 'The two passwords differ' }
if ($plain.Length -lt 8) { throw 'At least 8 characters' }

# Valid for 30 years (Android needs a key that outlives the app's updates).
$env:TJ_KS_PASS = $plain
try {
  & $keytool -genkeypair -v -keystore $jks -alias toojibee -keyalg RSA -keysize 2048 -validity 10950 `
    -storepass:env TJ_KS_PASS -keypass:env TJ_KS_PASS -dname 'CN=Toojibee, O=Toojibee, C=IR'
  if ($LASTEXITCODE) { throw 'keytool failed' }
} finally { Remove-Item Env:TJ_KS_PASS }

$props = "storeFile=toojibee-release.jks`nstorePassword=$plain`nkeyAlias=toojibee`nkeyPassword=$plain`n"
[IO.File]::WriteAllText((Join-Path $android 'keystore.properties'), $props, (New-Object Text.UTF8Encoding $false))
''
'Done. Back up these two files and the password somewhere safe (not in git):'
"  $jks"
"  $(Join-Path $android 'keystore.properties')"
'SHA-256 fingerprint of the key (for app links / store listings):'
& $keytool -list -v -keystore $jks -alias toojibee -storepass $plain | Select-String 'SHA256:'
