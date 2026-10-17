@echo off
chcp 65001 >nul
cd /d "%~dp0.."
"%~dp0..\node.exe" "%~dp0..\launcher.mjs"
if errorlevel 1 pause
