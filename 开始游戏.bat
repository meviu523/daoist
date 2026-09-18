@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo 未检测到 Node.js 22.16.0 或更高版本。
  echo 可以直接打开 dist\index.html 体验经典剧情。
  pause
  exit /b 1
)
echo 请在浏览器打开 http://127.0.0.1:8787
node --env-file-if-exists=.env server.mjs
pause
