param([ValidateSet('backup','restore')][string]$Mode)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$root = Split-Path $PSScriptRoot -Parent
$data = Join-Path $env:LOCALAPPDATA 'AURA Agent\data'
if ($env:AURA_DATA_DIR) { $data = $env:AURA_DATA_DIR }
Add-Type -AssemblyName System.Windows.Forms
Write-Host '먼저 AURA 설정에서 앱 종료를 누르세요. 브라우저만 닫으면 앱은 실행 중입니다.'
Write-Host '포함: 대화, 기억, 스킬, 화면 설정. 제외: 키, 파일, 작업/실행 기록, 사용량, MCP, 권한.'
if ($Mode -eq 'restore') {
  $answer = [System.Windows.Forms.MessageBox]::Show('현재 데이터를 교체합니다. 기존 데이터의 암호화 안전 사본을 남깁니다. 기억/스킬은 재승인, 키/권한은 재설정해야 합니다. 계속할까요?', 'AURA 복원 확인', 'YesNo', 'Warning')
  if ($answer -ne 'Yes') { exit 0 }
  $dialog = New-Object System.Windows.Forms.OpenFileDialog
} else {
  $dialog = New-Object System.Windows.Forms.SaveFileDialog
  $dialog.FileName = 'AURA-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.aura-backup'
  $dialog.OverwritePrompt = $true
}
$dialog.Filter = 'AURA encrypted backup (*.aura-backup)|*.aura-backup'
if ($dialog.ShowDialog() -ne 'OK') { exit 0 }
$secret = Read-Host '백업 암호 (12~256자, 분실 시 복구 불가)' -AsSecureString
$ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
try {
  $plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
  if ($Mode -eq 'backup') {
    $confirm = Read-Host '같은 암호를 다시 입력하세요' -AsSecureString
    $ptr2 = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($confirm)
    try { if ($plain -cne [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr2)) { throw '암호가 일치하지 않습니다.' } }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr2) }
  }
  $OutputEncoding = New-Object System.Text.UTF8Encoding($false)
  $plain | & (Join-Path $root 'node.exe') (Join-Path $root 'backup-cli.mjs') $Mode $data $dialog.FileName
  if ($LASTEXITCODE -ne 0) { throw '작업이 완료되지 않았습니다. 위 안내를 확인하세요.' }
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
  $plain = $null
}
