@echo off
chcp 65001 >nul
set "AURA_REPORT=%TEMP%\AURA-verification-%RANDOM%-%RANDOM%.json"
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "%~dp0Verify-Package.ps1" -PackageRoot "%~dp0.." -ReportPath "%AURA_REPORT%"
set "AURA_RESULT=%ERRORLEVEL%"
echo Report: %AURA_REPORT%
pause
exit /b %AURA_RESULT%
