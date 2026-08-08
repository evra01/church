@echo off
REM Double-cliquez sur ce fichier pour installer les dependances si besoin
REM et demarrer le site.

cd /d "%~dp0"

if not exist node_modules (
  echo Premiere installation, merci de patienter quelques instants...
  call npm install
)

echo.
echo ==================================================
echo   Le site va demarrer sur http://localhost:3000
echo   L administration est sur http://localhost:3000/admin.html
echo   Pour arreter le serveur : fermez cette fenetre
echo ==================================================
echo.

start "" http://localhost:3000

call npm start
pause
