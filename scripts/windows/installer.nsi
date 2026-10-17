Unicode true
!include "MUI2.nsh"
!include "LogicLib.nsh"
!ifndef PACKAGE
!error "PACKAGE path is required"
!endif
!ifndef OUTPUT
!error "OUTPUT path is required"
!endif
Name "AURA Agent"
OutFile "${OUTPUT}"
InstallDir "$LOCALAPPDATA\Programs\AURA Agent"
RequestExecutionLevel user
SetCompressor /SOLID lzma
!define MUI_ABORTWARNING
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_COMPONENTS
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "Korean"
Section "AURA Agent (필수)" Main
  SectionIn RO
  SetShellVarContext current
  MessageBox MB_OKCANCEL "설치/업데이트 전에 AURA 설정에서 앱을 종료하세요. 중요한 데이터는 먼저 백업하세요. 데이터 폴더는 유지됩니다." IDOK +2
  Abort
  SetOutPath "$INSTDIR\app-0.1.0"
  File /r "${PACKAGE}\*"
  CreateDirectory "$SMPROGRAMS\AURA Agent"
  CreateShortcut "$SMPROGRAMS\AURA Agent\AURA Agent.lnk" "$INSTDIR\app-0.1.0\windows\Start.cmd"
  CreateShortcut "$SMPROGRAMS\AURA Agent\암호화 백업.lnk" "$INSTDIR\app-0.1.0\windows\Backup.cmd"
  CreateShortcut "$SMPROGRAMS\AURA Agent\데이터 복원.lnk" "$INSTDIR\app-0.1.0\windows\Restore.cmd"
  CreateShortcut "$DESKTOP\AURA Agent.lnk" "$INSTDIR\app-0.1.0\windows\Start.cmd"
  WriteUninstaller "$INSTDIR\Uninstall.exe"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\AURA Agent" "DisplayName" "AURA Agent"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\AURA Agent" "DisplayVersion" "0.1.0"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\AURA Agent" "UninstallString" '$\"$INSTDIR\Uninstall.exe$\"'
SectionEnd
Section /o "로그인할 때 AURA 시작" Startup
  CreateShortcut "$SMSTARTUP\AURA Agent.lnk" "$INSTDIR\app-0.1.0\windows\Start.cmd"
SectionEnd
Section "Uninstall"
  SetShellVarContext current
  MessageBox MB_OKCANCEL "AURA를 먼저 종료하세요. 앱을 제거해도 대화 데이터와 백업은 보존됩니다." IDOK +2
  Abort
  Delete "$SMSTARTUP\AURA Agent.lnk"
  Delete "$DESKTOP\AURA Agent.lnk"
  RMDir /r "$SMPROGRAMS\AURA Agent"
  RMDir /r "$INSTDIR\app-0.1.0"
  Delete "$INSTDIR\Uninstall.exe"
  RMDir "$INSTDIR"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\AURA Agent"
SectionEnd
