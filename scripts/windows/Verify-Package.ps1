param(
  [Parameter(Mandatory=$true)][string]$PackageRoot,
  [string]$ReportPath,
  [switch]$CheckOnly
)
$ErrorActionPreference = 'Stop'
$rootItem = Get-Item -LiteralPath $PackageRoot -Force
if (-not $rootItem.PSIsContainer -or ($rootItem.Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Invalid package directory' }
$root = $rootItem.FullName.TrimEnd([IO.Path]::DirectorySeparatorChar)
$manifestPath = Join-Path $root 'manifest.json'
if ((Get-Item -LiteralPath $manifestPath -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Invalid manifest link' }
$manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
if ($manifest.format -ne 1 -or $manifest.target -ne 'win-x64' -or $manifest.node -ne '24.19.0') { throw 'Unsupported manifest target or version' }
$expected = New-Object 'System.Collections.Generic.Dictionary[string,string]' ([StringComparer]::Ordinal)
foreach ($entry in $manifest.files.PSObject.Properties) {
  if ($entry.Name -match '(^/|\\|:|(^|/)\.\.?(/|$))' -or $entry.Value -notmatch '^[0-9a-f]{64}$') { throw 'Invalid manifest path or hash' }
  $expected.Add($entry.Name, $entry.Value)
}
# This pin is independent of the mutable manifest: never execute an altered runtime.
if (-not $expected.ContainsKey('node.exe') -or $expected['node.exe'] -ne '3602f2bb1a10f2cbab4c36886218a33c1ab3db87290e73b033c46c77147d0237') { throw 'Unexpected Windows runtime hash' }
$pending = New-Object 'System.Collections.Generic.Stack[string]'
$pending.Push($root)
$count = 0
while ($pending.Count -gt 0) {
  foreach ($entry in Get-ChildItem -LiteralPath $pending.Pop() -Force) {
    if ($entry.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Package links are not permitted' }
    if ($entry.PSIsContainer) { $pending.Push($entry.FullName); continue }
    if ($entry.FullName -eq $manifestPath) { continue }
    $relative = $entry.FullName.Substring($root.Length + 1).Replace('\','/')
    if (-not $expected.ContainsKey($relative)) { throw "Unexpected package file: $relative" }
    if ((Get-FileHash -LiteralPath $entry.FullName -Algorithm SHA256).Hash -ne $expected[$relative]) { throw "Package hash mismatch: $relative" }
    $count++
  }
}
if ($count -ne $expected.Count) { throw 'Package files are missing' }
Write-Host 'PASS: Windows package hashes checked before bundled code execution'
if (-not $CheckOnly) {
  if ($env:OS -ne 'Windows_NT') { throw 'Runtime verification requires Windows' }
  if (-not $ReportPath) { throw 'ReportPath is required' }
  & (Join-Path $root 'node.exe') (Join-Path $root 'checks/smoke-package.mjs') $root $ReportPath
  if ($LASTEXITCODE -ne 0) { throw 'AURA runtime verification failed; inspect the JSON report' }
}
