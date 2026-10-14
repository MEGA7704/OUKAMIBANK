@echo off
setlocal
cd /d "%~dp0.."
echo IMPORT OUKAMI - CLOUDFARE D1
where npx >nul 2>&1 || (echo Installer Node.js puis relancer. & pause & exit /b 1)
echo ATTENTION: la banque OUKAMI doit exister dans D1 avant cet import.
echo Sauvegarde de la base D1 avant toute modification...
call npx wrangler d1 export oukami_d1 --remote --output=import_oukami_prive\sauvegarde_avant_import.sql
if errorlevel 1 (echo ECHEC SAUVEGARDE - import annule. & pause & exit /b 1)
echo Import des clients, comptes et mouvements...
call npx wrangler d1 execute oukami_d1 --remote --file=import_oukami_prive\import_d1.sql
if errorlevel 1 (echo ECHEC IMPORT - verifier la base et les journaux. & pause & exit /b 1)
echo Import termine. Verifiez vos donnees sur l'application.
pause
