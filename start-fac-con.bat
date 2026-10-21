@echo off
title FAC-CON Server
echo ====================================================
echo Starting FAC-CON Faculty Consultation System...
echo ====================================================
cd /d "%~dp0"
set PATH=C:\Users\DHANYASHREE P\AppData\Local\Programs\node;%PATH%
node server.js
pause
