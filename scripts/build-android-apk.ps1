param(
  [string]$JdkPath = "C:\Program Files\Microsoft\jdk-17.0.20.101-hotspot",
  [string]$SdkPath = "$env:LOCALAPPDATA\Android\Sdk"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$twa = Join-Path $root "android-twa"
$backupDir = "C:\TeamSuite_backup"

if (-not (Test-Path (Join-Path $JdkPath "bin\java.exe"))) {
  throw "JDK not found at $JdkPath"
}
if (-not (Test-Path $SdkPath)) {
  throw "Android SDK not found at $SdkPath"
}

$env:JAVA_HOME = $JdkPath
$env:ANDROID_HOME = $SdkPath
$env:ANDROID_SDK_ROOT = $SdkPath
$env:Path = (Join-Path $JdkPath "bin") + ";" + $env:Path

$sdkProps = Join-Path $twa "local.properties"
$sdkLine = "sdk.dir=" + $SdkPath.Replace("\", "\\")
[System.IO.File]::WriteAllText($sdkProps, $sdkLine)

New-Item -ItemType Directory -Force -Path $backupDir | Out-Null
Push-Location $twa
try {
  .\gradlew.bat assembleDebug --no-daemon
  if ($LASTEXITCODE -ne 0) { throw "Gradle assembleDebug failed" }
} finally {
  Pop-Location
}

$apk = Join-Path $twa "app\build\outputs\apk\debug\app-debug.apk"
if (-not (Test-Path $apk)) { throw "APK not found after build" }

$dest = Join-Path $backupDir "TeamSuite.apk"
Copy-Item $apk $dest -Force
Write-Output $dest
