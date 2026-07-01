@echo off
cd /d %~dp0
echo Instalando dependencias si es necesario...
if not exist node_modules npm install
echo Iniciando modulo administradores...
npm start
pause
