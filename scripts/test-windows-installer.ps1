param(
  [Parameter(Mandatory=$true)][string]$Installer,
  [string]$ReportPath = 'test-results/windows-installer.json',
  [switch]$CheckUninstallFailure
)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'installer-layout.ps1')
# This test changes per-user shell links and HKCU. Never run on a user's machine.
if (-not $IsWindows -or $env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_ENVIRONMENT -ne 'github-hosted') {
  throw 'Installer validation requires a disposable GitHub-hosted Windows runner'
}
$Installer = (Resolve-Path -LiteralPath $Installer).Path
$report = [ordered]@{ format=1; platform='win32'; source=$env:GITHUB_SHA; status='failed'; checks=@(); clicks=@(); startedAt=[DateTime]::UtcNow.ToString('o'); installerSha256=(Get-FileHash $Installer -Algorithm SHA256).Hash.ToLower() }
$reportFile = [IO.Path]::GetFullPath($ReportPath)
$work = Join-Path $env:RUNNER_TEMP ('aura-install-' + [Guid]::NewGuid().ToString('N'))
$installRoot = Join-Path $work '한글 공백 설치'
$app = Join-Path $installRoot 'app-0.1.0'
$dataRoot = Join-Path $env:LOCALAPPDATA 'AURA Agent'
$desktopLink = Join-Path ([Environment]::GetFolderPath('Desktop')) 'AURA Agent.lnk'
$menu = Join-Path ([Environment]::GetFolderPath('Programs')) 'AURA Agent'
$startupLink = Join-Path ([Environment]::GetFolderPath('Startup')) 'AURA Agent.lnk'
$reg = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\AURA Agent'
$stateFile = Join-Path $work 'state.json'
$owned = $false
$children = [Collections.Generic.List[Diagnostics.Process]]::new()
function Check([string]$name, [scriptblock]$action) {
  try { & $action; $script:report.checks += @{ name=$name; status='passed' } }
  catch { $script:report.checks += @{ name=$name; status='failed' }; throw }
}
function Assert([bool]$condition, [string]$message) { if (-not $condition) { throw $message } }
Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
public static class InstallerWindow {
  public delegate bool EnumProc(IntPtr h, IntPtr p);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc cb, IntPtr p);
  [DllImport("user32.dll")] static extern bool EnumChildWindows(IntPtr h, EnumProc cb, IntPtr p);
  [DllImport("user32.dll")] public static extern int GetDlgCtrlID(IntPtr h);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern bool IsWindowEnabled(IntPtr h);
  [DllImport("user32.dll")] public static extern IntPtr GetDlgItem(IntPtr h, int id);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder b, int size);
  [DllImport("user32.dll", SetLastError=true)] public static extern bool PostMessage(IntPtr h, uint msg, IntPtr wp, IntPtr lp);
  public static IntPtr[] ForProcess(int id) {
    var found = new List<IntPtr>();
    EnumWindows((h,p) => { uint pid; GetWindowThreadProcessId(h, out pid);
      if (pid == id && IsWindowVisible(h)) found.Add(h); return true; }, IntPtr.Zero);
    return found.ToArray();
  }
  public static string Text(IntPtr h) { var b=new StringBuilder(512); GetWindowText(h,b,b.Capacity); return b.ToString(); }
  public static IntPtr[] Children(IntPtr h) {
    var found = new List<IntPtr>();
    EnumChildWindows(h, (child,p) => { found.Add(child); return true; }, IntPtr.Zero);
    return found.ToArray();
  }
}
'@
function RunWizard([string]$exe, [string]$arguments, [string]$phase, [int]$expectedExit = 0) {
  # /D and _?= must be the final, unquoted NSIS parameter, even with spaces.
  $info = [Diagnostics.ProcessStartInfo]::new($exe, $arguments)
  $info.UseShellExecute = $false
  $process = [Diagnostics.Process]::Start($info)
  $children.Add($process)
  $deadline = [DateTime]::UtcNow.AddSeconds(120)
  $clicks = 0
  while (-not $process.HasExited) {
    if ([DateTime]::UtcNow -ge $deadline) {
      $script:report.timeoutWindows = @(
        foreach ($window in [InstallerWindow]::ForProcess($process.Id)) {
          @{ text=[InstallerWindow]::Text($window); enabled=[InstallerWindow]::IsWindowEnabled($window); controls=@(
            foreach ($child in [InstallerWindow]::Children($window)) {
              if ([InstallerWindow]::IsWindowVisible($child)) {
                @{ id=[InstallerWindow]::GetDlgCtrlID($child); text=[InstallerWindow]::Text($child); enabled=[InstallerWindow]::IsWindowEnabled($child) }
              }
            }
          ) }
        }
      )
    }
    Assert ([DateTime]::UtcNow -lt $deadline) "Installer timed out in $phase"
    foreach ($window in [InstallerWindow]::ForProcess($process.Id)) {
      if (-not [InstallerWindow]::IsWindowEnabled($window)) { continue }
      # IDOK is Next/Install/Finish on MUI pages and OK on the explicit warning.
      $button = [InstallerWindow]::GetDlgItem($window, 1)
      # Windows exposes the sole MB_OK button as control 2 on this runner.
      # Do not mistake the wizard's Cancel button for that error acknowledgement.
      if ($expectedExit -eq 2 -and $button -eq [IntPtr]::Zero) {
        $candidate = [InstallerWindow]::GetDlgItem($window, 2)
        $hasFailureText = @([InstallerWindow]::Children($window) | Where-Object {
          [InstallerWindow]::Text($_).StartsWith('일부 파일을 삭제하지 못해 제거를 완료하지 못했습니다.')
        }).Count -gt 0
        if ($hasFailureText -and ([InstallerWindow]::Text($candidate) -in @('OK', '확인'))) { $button = $candidate }
      }
      if ($button -ne [IntPtr]::Zero -and [InstallerWindow]::IsWindowVisible($button) -and [InstallerWindow]::IsWindowEnabled($button)) {
        $clicks++
        Assert ($clicks -le 12) "Unexpected repeated installer dialogs in $phase"
        $script:report.clicks += @{ phase=$phase; window=[InstallerWindow]::Text($window); button=[InstallerWindow]::Text($button); controlId=[InstallerWindow]::GetDlgCtrlID($button) }
        Assert ([InstallerWindow]::PostMessage($button, 0x00F5, [IntPtr]::Zero, [IntPtr]::Zero)) 'Could not click installer button'
        break
      }
    }
    Start-Sleep -Milliseconds 500
  }
  Assert ($process.ExitCode -eq $expectedExit) "$phase returned exit code $($process.ExitCode), expected $expectedExit"
  Assert ($clicks -ge 2) "$phase did not exercise the visible wizard"
}
function VerifyLinks {
  $links = @(
    @{ path=$desktopLink; target='Start.cmd' },
    @{ path=(Join-Path $menu 'AURA Agent.lnk'); target='Start.cmd' },
    @{ path=(Join-Path $menu '암호화 백업.lnk'); target='Backup.cmd' },
    @{ path=(Join-Path $menu '데이터 복원.lnk'); target='Restore.cmd' }
  )
  foreach ($link in $links) {
    Assert-InstallerShortcut $link.path (Join-Path $app ('windows\' + $link.target)) $app | Out-Null
  }
  Assert (-not (Test-Path -LiteralPath $startupLink)) 'Startup must be disabled by default'
  Assert ((Get-ItemProperty $reg).DisplayVersion -eq '0.1.0') 'Missing uninstall registration'
}
function InstalledApp([string]$mode) {
  & node (Join-Path $PSScriptRoot 'verify-installed-app.mjs') $app $stateFile $mode
  if ($LASTEXITCODE -ne 0) { throw "Installed app $mode failed" }
}
function DataHashes {
  $db = Join-Path $dataRoot 'data\aura.sqlite'
  $backup = Join-Path $dataRoot 'installer-test.aura-backup'
  return ((Get-FileHash -LiteralPath $db,$backup -Algorithm SHA256).Hash -join ':')
}
function AssertDataPreserved([string]$expected) {
  foreach ($file in @((Join-Path $dataRoot 'data\aura.sqlite'), (Join-Path $dataRoot 'installer-test.aura-backup'))) {
    if (-not (Test-Path -LiteralPath $file -PathType Leaf)) {
      $script:report.errorCode = 'INSTALLER_DATA_LOSS'
      throw "Installer removed preserved data: $file"
    }
  }
  if ((DataHashes) -ne $expected) {
    $script:report.errorCode = 'INSTALLER_DATA_LOSS'
    throw 'Installer changed database or backup bytes'
  }
}
function RemoveInstalledApp([string]$phase) {
  # Copy explicitly, so the child stays owned and exit status is observable.
  $copy = Join-Path $work ($phase + '-uninstall.exe')
  Copy-Item -LiteralPath (Join-Path $installRoot 'Uninstall.exe') -Destination $copy
  RunWizard $copy ('_?=' + $installRoot) $phase
  Assert-InstallerRemoved $installRoot
  foreach ($path in @($desktopLink, $menu, $startupLink, $reg)) {
    Assert (-not (Test-Path -LiteralPath $path)) "Uninstall left registration or shortcut: $path"
  }
}
function BlockedRemoval([string]$locked, [string]$phase, [bool]$keepShortcuts) {
  $before = DataHashes
  $handle = [IO.File]::Open($locked, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::ReadWrite)
  try {
    $copy = Join-Path $work ($phase + '.exe')
    Copy-Item -LiteralPath (Join-Path $installRoot 'Uninstall.exe') -Destination $copy
    RunWizard $copy ('_?=' + $installRoot) $phase 2
    Assert (Test-Path -LiteralPath $locked) 'Locked file disappeared'
    Assert (Test-Path -LiteralPath (Join-Path $installRoot 'Uninstall.exe')) 'Failed uninstall removed retry executable'
    Assert ((Get-ItemProperty $reg).DisplayVersion -eq '0.1.0') 'Failed uninstall removed registration'
    if ($keepShortcuts) { Assert (Test-Path -LiteralPath $desktopLink) 'Failed uninstall removed shortcuts before app deletion completed' }
    AssertDataPreserved $before
  } finally { $handle.Dispose() }
}
try {
  Check 'isolated-runner-preflight' {
    foreach ($path in @($dataRoot, $desktopLink, $menu, $startupLink, $reg)) {
      Assert (-not (Test-Path -LiteralPath $path)) "Existing AURA state: refusing to modify $path"
    }
    New-Item -ItemType Directory -Path $work | Out-Null
    $script:owned = $true
  }
  Check 'wizard-install-and-default-shortcuts' {
    RunWizard $Installer ('/D=' + $installRoot) 'install'
    VerifyLinks
    & (Join-Path $PSScriptRoot 'windows\Verify-Package.ps1') -PackageRoot $app -CheckOnly
  }
  Check 'installed-chat-and-encrypted-backup' { InstalledApp 'seed' }
  $before = DataHashes
  Check 'same-version-update-preserves-data' {
    # Repair a changed installed asset: verify an actual overwrite, not an exit code.
    Add-Content -LiteralPath (Join-Path $app 'server.mjs') -Value '// installer repair probe'
    RunWizard $Installer ('/D=' + $installRoot) 'update'
    VerifyLinks
    & (Join-Path $PSScriptRoot 'windows\Verify-Package.ps1') -PackageRoot $app -CheckOnly
    Assert ((DataHashes) -eq $before) 'Update changed database or backup'
    InstalledApp 'verify'
  }
  $before = DataHashes
  if ($CheckUninstallFailure) {
    Check 'locked-file-uninstall-preserves-retry-and-data' {
      BlockedRemoval (Join-Path $app 'server.mjs') 'blocked-uninstall' $true
    }
  }
  Check 'uninstall-removes-app-and-registration' { RemoveInstalledApp 'uninstall' }
  Check 'uninstall-preserves-database-and-backup' { AssertDataPreserved $before }
  Check 'reinstall-restores-existing-conversation' {
    RunWizard $Installer ('/D=' + $installRoot) 'reinstall'
    VerifyLinks
    Assert ((DataHashes) -eq $before) 'Reinstall changed database or backup'
    InstalledApp 'verify'
  }
  $before = DataHashes
  if ($CheckUninstallFailure) {
    Check 'locked-uninstaller-preserves-registration-for-retry' {
      BlockedRemoval (Join-Path $installRoot 'Uninstall.exe') 'blocked-self-delete' $false
    }
  }
  Check 'final-uninstall-preserves-data' {
    RemoveInstalledApp 'final-uninstall'
    Assert ((DataHashes) -eq $before) 'Final uninstall changed database or backup'
  }
  $report.status = 'passed'
} catch {
  $report.error = $_.Exception.Message
  throw
} finally {
  foreach ($process in $children) {
    if (-not $process.HasExited) { & taskkill.exe /PID $process.Id /T /F | Out-Null }
  }
  $report.finishedAt = [DateTime]::UtcNow.ToString('o')
  New-Item -ItemType Directory -Force -Path (Split-Path $reportFile -Parent) | Out-Null
  $report | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $reportFile -Encoding utf8
  $report | ConvertTo-Json -Depth 8 | Write-Output
  # Only state proven absent before this test is eligible for cleanup.
  if ($owned) {
    foreach ($path in @($desktopLink, $menu, $startupLink, $reg, $dataRoot, $work)) {
      if (Test-Path -LiteralPath $path) { Remove-Item -LiteralPath $path -Recurse -Force }
    }
  }
}
