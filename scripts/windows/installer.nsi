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
  ; Keep the registration and original uninstaller until owned files are removed.
  ; A failed attempt may be partial; a later attempt must also handle absent paths.
  ClearErrors
  IfFileExists "$INSTDIR\app-0.1.0\*.*" 0 app_removed
  RMDir /r "$INSTDIR\app-0.1.0"
  IfErrors uninstall_failed
app_removed:
  Delete "$SMSTARTUP\AURA Agent.lnk"
  Delete "$DESKTOP\AURA Agent.lnk"
  IfErrors uninstall_failed
  IfFileExists "$SMPROGRAMS\AURA Agent\*.*" 0 shortcuts_removed
  RMDir /r "$SMPROGRAMS\AURA Agent"
  IfErrors uninstall_failed
shortcuts_removed:
  Delete "$INSTDIR\Uninstall.exe"
  IfErrors uninstall_failed
  ; Never recursively remove user-added files from the install root.
  RMDir "$INSTDIR"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\AURA Agent"
  SetErrorLevel 0
  Goto uninstall_done
uninstall_failed:
  MessageBox MB_OK|MB_ICONSTOP "일부 파일을 삭제하지 못해 제거를 완료하지 못했습니다. AURA와 파일을 사용 중인 프로그램을 닫은 뒤 Windows 앱 목록에서 제거를 다시 실행하세요. 대화 데이터와 백업은 보존됩니다."
  SetErrorLevel 2
  Quit
uninstall_done:
SectionEnd
