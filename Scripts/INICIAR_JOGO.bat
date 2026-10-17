@echo off
setlocal
title Cabo de Guerra Presidencial - Inicializador
cd /d "%~dp0"

echo ============================================================
echo   CABO DE GUERRA PRESIDENCIAL - Inicializador (Windows)
echo ============================================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [ERRO] Node.js nao foi encontrado no PATH.
  echo Instale em https://nodejs.org/ - versao LTS - e rode este script novamente.
  pause
  exit /b 1
)

if not exist "server\node_modules" (
  echo [1/4] Instalando dependencias do servidor...
  pushd server
  call npm install
  popd
) else (
  echo [1/4] Dependencias do servidor ja instaladas.
)

if not exist "game\node_modules" (
  echo [2/4] Instalando dependencias do jogo...
  pushd game
  call npm install
  popd
) else (
  echo [2/4] Dependencias do jogo ja instaladas.
)

echo [3/4] Iniciando servidor (fisica, rounds, API admin, ponte TikTok)...
start "Cabo de Guerra - SERVIDOR" cmd /k "cd /d "%~dp0server" && npm run dev"

timeout /t 3 /nobreak >nul

echo [4/4] Iniciando cliente do jogo (Vite)...
start "Cabo de Guerra - JOGO (Vite)" cmd /k "cd /d "%~dp0game" && npm run dev"

timeout /t 4 /nobreak >nul

echo.
echo Abrindo no navegador:
echo   - Cena do jogo (capturar no OBS):  http://localhost:5173/index.html
echo   - Painel admin (NAO capturar):     http://localhost:5173/admin.html
echo.
set "CHROME=C:\Program Files\Google\Chrome\Application\chrome.exe"
if exist "%CHROME%" (
  rem Cena em janela propria, sem barras, com som liberado - musica de vitoria
  start "" "%CHROME%" --app=http://localhost:5173/index.html --window-size=450,1000 --autoplay-policy=no-user-gesture-required --user-data-dir="%TEMP%\cabo-cena"
) else (
  start "" "http://localhost:5173/index.html"
)
start "" "http://localhost:5173/admin.html"

echo ============================================================
echo Duas janelas de terminal foram abertas (servidor e jogo).
echo Feche-as para encerrar o jogo. Veja docs\OBS_SETUP.md para
echo configurar a captura 1080x1920 no OBS ou TikTok LIVE Studio.
echo ============================================================
pause
