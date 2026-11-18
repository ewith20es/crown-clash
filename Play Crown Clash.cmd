@echo off
cd /d "%~dp0"
set PORT=5188
echo Opening Crown Clash. Keep this window open while playing.
start "" "http://127.0.0.1:5188/"
node tools/serve.mjs
pause
