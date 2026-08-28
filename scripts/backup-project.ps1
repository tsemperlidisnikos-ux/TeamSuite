# Creates a timestamped project ZIP in C:\TeamSuite_backup
# Excludes heavy/generated folders (node_modules, dist, caches).

param(
  [string]$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path,
  [string]$BackupRoot = 'C:\TeamSuite_backup'
)

$ErrorActionPreference = 'Stop'

New-Item -ItemType Directory -Force -Path $BackupRoot | Out-Null

$stamp = Get-Date -Format 'yyyy-MM-dd_HH-mm-ss'
$zipName = "TeamSuite_$stamp.zip"
$zipPath = Join-Path $BackupRoot $zipName

$excludes = @(
  'node_modules',
  'dist',
  '.git',
  '.vercel',
  '.cursor',
  'coverage',
  '.turbo'
)

# Also exclude secret / env files from the staged copy (not robocopy /XD dirs).
$excludeFiles = @(
  '.env',
  '.env.local',
  '.env.production',
  '.env.development',
  '*.pem',
  '*.key',
  'credentials.json',
  'service-account*.json'
)

$tempRoot = Join-Path $env:TEMP ("TeamSuite_backup_" + [guid]::NewGuid().ToString('N'))
$stageDir = Join-Path $tempRoot 'TeamSuite'

try {
  New-Item -ItemType Directory -Force -Path $stageDir | Out-Null

  $robocopyArgs = @(
    $ProjectRoot,
    $stageDir,
    '/E',
    '/NFL', '/NDL', '/NJH', '/NJS', '/NC', '/NS', '/NP',
    '/XD'
  ) + $excludes

  & robocopy @robocopyArgs | Out-Null
  $rc = $LASTEXITCODE
  # Robocopy: 0-7 = success with varying copy stats
  if ($rc -ge 8) {
    throw "Robocopy failed with exit code $rc"
  }

  foreach ($pattern in $excludeFiles) {
    Get-ChildItem -Path $stageDir -Recurse -File -Force -ErrorAction SilentlyContinue |
      Where-Object { $_.Name -like $pattern } |
      ForEach-Object { Remove-Item -LiteralPath $_.FullName -Force -ErrorAction SilentlyContinue }
  }

  if (Test-Path $zipPath) {
    Remove-Item -Force $zipPath
  }

  Compress-Archive -Path (Join-Path $stageDir '*') -DestinationPath $zipPath -CompressionLevel Optimal

  if (!(Test-Path $zipPath) -or ((Get-Item $zipPath).Length -le 0)) {
    throw "Backup archive was not created or is empty: $zipPath"
  }

  Write-Output $zipPath
}
finally {
  if (Test-Path $tempRoot) {
    Remove-Item -Recurse -Force $tempRoot -ErrorAction SilentlyContinue
  }
}
