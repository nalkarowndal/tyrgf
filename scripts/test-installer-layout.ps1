param([string]$ReportPath = 'test-results/windows-installer-layout.json')
$ErrorActionPreference = 'Stop'
if (-not $IsWindows) { throw 'Shortcut regression requires Windows Shell' }
. (Join-Path $PSScriptRoot 'installer-layout.ps1')
$work = Join-Path ([IO.Path]::GetTempPath()) ('aura-layout-' + [Guid]::NewGuid().ToString('N'))
$app = Join-Path $work '한글 공백 app'
$root = Join-Path $work 'removed-install'
$report = [ordered]@{ format=1; source=$env:GITHUB_SHA; platform='win32'; status='failed'; checks=@() }
function Check([string]$name, [scriptblock]$action) {
  try { & $action; $script:report.checks += @{name=$name;status='passed'} }
  catch { $script:report.checks += @{name=$name;status='failed';error=$_.Exception.Message} }
}
function MustReject([string]$code, [scriptblock]$action) {
  try { & $action | Out-Null }
  catch {
    if ($_.Exception.Data['InstallerValidationCode'] -eq $code) { return }
    throw "Wrong rejection for ${code}: $($_.Exception.Message)"
  }
  throw "Validator accepted injected fault: $code"
}
function Shortcut([string]$target, [string]$arguments='') {
  $link = Join-Path $work 'fixture.lnk'
  # WSH only creates an ASCII bootstrap link; Unicode metadata uses Shell.Application.
  $writer = New-Object -ComObject WScript.Shell
  $initial = $writer.CreateShortcut($link)
  $initial.TargetPath = $env:ComSpec
  $initial.Save()
  $shell = New-Object -ComObject Shell.Application
  $item = $shell.NameSpace($work).ParseName('fixture.lnk').GetLink()
  $item.Path = $target
  $item.Arguments = $arguments
  $item.Save()
  return $link
}
try {
  New-Item -ItemType Directory -Path $app | Out-Null
  $start = Join-Path $app 'Start.cmd'
  $backup = Join-Path $app 'Backup.cmd'
  Set-Content -LiteralPath $start,$backup -Value '@echo off' -Encoding ascii
  Check 'correct-unicode-target' { Assert-InstallerShortcut (Shortcut $backup) $backup $app | Out-Null }
  Check 'case-insensitive-target' { Assert-InstallerShortcut (Shortcut $backup) $backup.ToUpperInvariant() $app | Out-Null }
  Check 'wrong-existing-target-inside-app' {
    MustReject 'SHORTCUT_TARGET_MISMATCH' { Assert-InstallerShortcut (Shortcut $start) $backup $app }
  }
  Check 'unexpected-shortcut-arguments' {
    MustReject 'SHORTCUT_ARGUMENTS_MISMATCH' { Assert-InstallerShortcut (Shortcut $backup '/unexpected') $backup $app }
  }
  Check 'outside-app-target' {
    MustReject 'SHORTCUT_TARGET_MISMATCH' { Assert-InstallerShortcut (Shortcut $env:ComSpec) $backup $app }
  }
  Check 'missing-shortcut' {
    MustReject 'SHORTCUT_MISSING' { Assert-InstallerShortcut (Join-Path $work 'missing.lnk') $backup $app }
  }
  Check 'complete-removal' { Assert-InstallerRemoved $root }
  New-Item -ItemType Directory -Path $root | Out-Null
  Check 'empty-install-root-remains' { MustReject 'INSTALL_ROOT_REMAINS' { Assert-InstallerRemoved $root } }
  Set-Content -LiteralPath (Join-Path $root 'Uninstall.exe') -Value 'test-only placeholder'
  Check 'uninstaller-remains' { MustReject 'UNINSTALLER_REMAINS' { Assert-InstallerRemoved $root } }
  New-Item -ItemType Directory -Path (Join-Path $root 'app-0.1.0') | Out-Null
  Check 'app-files-remain' { MustReject 'APP_FILES_REMAIN' { Assert-InstallerRemoved $root } }
  if ($report.checks.Where({ $_.status -eq 'failed' }).Count) { throw 'Installer layout regressions failed' }
  $report.status = 'passed'
} finally {
  $file = [IO.Path]::GetFullPath($ReportPath)
  New-Item -ItemType Directory -Force -Path (Split-Path $file -Parent) | Out-Null
  $report | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $file -Encoding utf8
  $report | ConvertTo-Json -Depth 6 | Write-Output
  if (Test-Path -LiteralPath $work) { Remove-Item -LiteralPath $work -Recurse -Force }
}
