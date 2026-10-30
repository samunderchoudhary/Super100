@echo off
setlocal
title Your shop - keep this window open
cd /d "%~dp0"
if not exist "server\razorpay-server.js" goto unzip
echo.
echo  ================================================
echo   Starting your shop. Please wait a moment...
echo  ================================================
echo.
where node >nul 2>nul
if not errorlevel 1 goto run
if exist "%ProgramFiles%\nodejs\node.exe" goto addpath
echo  Your shop needs a free program called Node.js, and it is not on this computer yet.
where winget >nul 2>nul
if errorlevel 1 goto manual
echo  Installing it now. If Windows asks whether to allow changes, click Yes. This takes a minute or two.
echo.
winget install -e --id OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
if exist "%ProgramFiles%\nodejs\node.exe" goto addpath
:manual
echo.
echo  Please install Node.js yourself. Its download page is opening now.
echo  Click the big green button marked LTS, open the file it downloads and keep clicking Next until it finishes.
echo  Then double-click START-SHOP.bat again.
start "" "https://nodejs.org/en/download"
echo.
pause
exit /b 1
:addpath
set "PATH=%ProgramFiles%\nodejs;%PATH%"
:run
node -e "process.exit(Number(process.versions.node.split('.')[0])>=18?0:1)"
if errorlevel 1 goto tooold
set FATSE_OPEN=1
node server\razorpay-server.js
echo.
echo  The shop has stopped. If you did not close it on purpose, double-click START-SHOP.bat again.
echo.
pause
exit /b 0
:unzip
echo.
echo  The shop files were not found next to this file.
echo  If you opened this from inside the zip, close this window, right-click the zip, choose Extract All,
echo  open the new folder and double-click START-SHOP.bat there.
echo.
pause
exit /b 1
:tooold
echo.
echo  The Node.js on this computer is too old for the shop. Its download page is opening now.
echo  Install the LTS version, then double-click START-SHOP.bat again.
start "" "https://nodejs.org/en/download"
echo.
pause
exit /b 1
