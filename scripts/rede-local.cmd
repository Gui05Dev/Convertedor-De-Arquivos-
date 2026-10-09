@echo off
rem Duplo clique: sobe o Conversor para teste na rede local. Ver rede-local.ps1.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0rede-local.ps1" %*
echo.
pause
