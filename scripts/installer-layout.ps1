# Read-only assertions shared by the actual installer check and its regression fixtures.
function Throw-InstallerLayoutError([string]$code, [string]$message) {
  $failure = [InvalidOperationException]::new($message)
  $failure.Data['InstallerValidationCode'] = $code
  throw $failure
}
function Assert-InstallerShortcut([string]$linkPath, [string]$expectedTarget, [string]$appRoot) {
  if (-not (Test-Path -LiteralPath $linkPath -PathType Leaf)) {
    Throw-InstallerLayoutError 'SHORTCUT_MISSING' "Missing shortcut: $linkPath"
  }
  $shell = New-Object -ComObject Shell.Application
  $shortcut = $shell.NameSpace((Split-Path $linkPath -Parent)).ParseName((Split-Path $linkPath -Leaf)).GetLink()
  $target = [string]$shortcut.Path
  if (-not $target.StartsWith($appRoot + '\', [StringComparison]::OrdinalIgnoreCase)) {
    Throw-InstallerLayoutError 'SHORTCUT_TARGET_MISMATCH' "Unexpected shortcut target: $target"
  }
  if (-not (Test-Path -LiteralPath $target -PathType Leaf)) {
    Throw-InstallerLayoutError 'SHORTCUT_TARGET_MISSING' "Shortcut target missing: $target"
  }
  return @{ link=$linkPath; target=$target; arguments=[string]$shortcut.Arguments }
}
function Assert-InstallerRemoved([string]$installRoot) {
  if (Test-Path -LiteralPath (Join-Path $installRoot 'app-0.1.0')) {
    Throw-InstallerLayoutError 'APP_FILES_REMAIN' 'App files remain after uninstall'
  }
}
