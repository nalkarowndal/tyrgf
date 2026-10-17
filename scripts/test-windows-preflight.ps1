param([Parameter(Mandatory=$true)][string]$PackageRoot)
$ErrorActionPreference = 'Stop'
$verify = Join-Path $PSScriptRoot 'windows/Verify-Package.ps1'
& $verify -PackageRoot $PackageRoot -CheckOnly
$temp = Join-Path ([IO.Path]::GetTempPath()) ('aura-preflight-' + [Guid]::NewGuid().ToString())
try {
  Copy-Item -LiteralPath $PackageRoot -Destination $temp -Recurse
  function MustReject([string]$Expected) {
    $caught = $false
    try { & $verify -PackageRoot $temp -CheckOnly } catch {
      if ($_.Exception.Message -notmatch $Expected) { throw }
      $caught = $true
    }
    if (-not $caught) { throw 'Tampered package was accepted' }
  }
  $launcher = Join-Path $temp 'launcher.mjs'
  $original = [IO.File]::ReadAllBytes($launcher)
  [IO.File]::WriteAllText($launcher, 'throw new Error("must not execute")')
  MustReject 'hash'
  [IO.File]::WriteAllBytes($launcher, $original)
  $extra = Join-Path $temp 'unexpected.txt'
  [IO.File]::WriteAllText($extra, 'extra')
  MustReject 'Unexpected'
  Remove-Item -LiteralPath $extra
  $node = Join-Path $temp 'node.exe'
  [IO.File]::WriteAllText($node, 'fake runtime')
  $manifestPath = Join-Path $temp 'manifest.json'
  $manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
  $manifest.files.'node.exe' = (Get-FileHash -LiteralPath $node -Algorithm SHA256).Hash.ToLower()
  $manifest | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $manifestPath -Encoding UTF8
  MustReject 'runtime'
  Write-Host 'PASS: trusted PowerShell preflight rejects modified code, extra files and a replaced runtime'
} finally { if (Test-Path -LiteralPath $temp) { Remove-Item -LiteralPath $temp -Recurse -Force } }
