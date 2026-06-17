@echo off
REM Wrapper de fabric.ps1 para Windows: evita problemas de ExecutionPolicy y
REM funciona con doble clic o desde cmd.exe.  Uso:
REM   fabric.cmd            -> arranca todo (up)
REM   fabric.cmd restart backend
REM   fabric.cmd status / stop / logs
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0fabric.ps1" %*
