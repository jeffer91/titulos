@echo off
setlocal EnableExtensions EnableDelayedExpansion

title Subir cambios a GitHub - main seguro
color 0A

set "REMOTE=origin"
set "TARGET_BRANCH=main"

echo ==================================================
echo   SUBIR CAMBIOS A GITHUB - RAMA MAIN
echo ==================================================
echo.

echo Este proceso subira tus cambios a:
echo   remoto: %REMOTE%
echo   rama:   %TARGET_BRANCH%
echo.
echo No usa --force y se detiene si detecta errores.
echo.
pause

echo.
echo Moviendose a la carpeta donde esta este archivo .bat...
cd /d "%~dp0"

echo.
echo Verificando que Git este instalado...
git --version >nul 2>&1
if errorlevel 1 (
    echo.
    echo ERROR: Git no esta instalado o no esta disponible en PATH.
    echo Instala Git o abre esta terminal desde VS Code con Git configurado.
    echo.
    pause
    exit /b 1
)

echo.
echo Verificando que esta carpeta sea un repositorio Git...
git rev-parse --is-inside-work-tree >nul 2>&1
if errorlevel 1 (
    echo.
    echo ERROR: Esta carpeta no es un repositorio Git.
    echo Coloca este .bat dentro de la carpeta raiz del proyecto.
    echo.
    pause
    exit /b 1
)

for /f "delims=" %%r in ('git rev-parse --show-toplevel') do set "REPO_ROOT=%%r"

cd /d "%REPO_ROOT%"

echo.
echo Carpeta raiz detectada:
echo %REPO_ROOT%
echo.

echo Verificando rama actual...
for /f "delims=" %%b in ('git branch --show-current') do set "CURRENT_BRANCH=%%b"

if "%CURRENT_BRANCH%"=="" (
    echo.
    echo ERROR: Git no esta en una rama normal. Parece estar en modo detached HEAD.
    echo No se continuara para evitar errores.
    echo.
    pause
    exit /b 1
)

echo Rama actual: %CURRENT_BRANCH%

if /I not "%CURRENT_BRANCH%"=="%TARGET_BRANCH%" (
    echo.
    echo ERROR: No estas en la rama %TARGET_BRANCH%.
    echo Estas en la rama: %CURRENT_BRANCH%
    echo.
    echo Cambia manualmente con:
    echo git switch %TARGET_BRANCH%
    echo.
    pause
    exit /b 1
)

echo.
echo Verificando remoto %REMOTE%...
git remote get-url %REMOTE% >nul 2>&1
if errorlevel 1 (
    echo.
    echo ERROR: No existe el remoto %REMOTE%.
    echo Revisa con:
    echo git remote -v
    echo.
    pause
    exit /b 1
)

for /f "delims=" %%u in ('git remote get-url %REMOTE%') do set "REMOTE_URL=%%u"

echo.
echo Repositorio remoto detectado:
echo %REMOTE_URL%
echo.

echo Verificando si existen archivos sensibles o pesados...
echo.

if exist "node_modules\" (
    git check-ignore -q "node_modules/"
    if errorlevel 1 (
        echo ADVERTENCIA:
        echo Existe la carpeta node_modules y no parece estar ignorada por .gitignore.
        echo Esto puede subir miles de archivos innecesarios a GitHub.
        echo.
        set /p CONT_NODE=Escribe SI para continuar de todos modos: 
        if /I not "!CONT_NODE!"=="SI" (
            echo.
            echo Proceso cancelado por seguridad.
            echo Agrega node_modules/ al .gitignore y vuelve a ejecutar.
            echo.
            pause
            exit /b 1
        )
    ) else (
        echo OK: node_modules esta ignorado.
    )
)

if exist ".env" (
    git check-ignore -q ".env"
    if errorlevel 1 (
        echo.
        echo ADVERTENCIA:
        echo Existe un archivo .env y no parece estar ignorado por .gitignore.
        echo Puede contener claves privadas, tokens o secretos.
        echo.
        set /p CONT_ENV=Escribe SI para continuar de todos modos: 
        if /I not "!CONT_ENV!"=="SI" (
            echo.
            echo Proceso cancelado por seguridad.
            echo Agrega .env al .gitignore y vuelve a ejecutar.
            echo.
            pause
            exit /b 1
        )
    ) else (
        echo OK: .env esta ignorado.
    )
)

echo.
echo Trayendo informacion actual del remoto...
git fetch %REMOTE% %TARGET_BRANCH%
if errorlevel 1 (
    echo.
    echo ERROR: No se pudo hacer fetch desde GitHub.
    echo Revisa tu conexion, permisos o el remoto configurado.
    echo.
    pause
    exit /b 1
)

echo.
echo Estado actual del repositorio:
git status -sb
echo.

echo ==================================================
echo   CONFIRMACION DE DESTINO
echo ==================================================
echo.
echo Se trabajara en la rama local:
echo %CURRENT_BRANCH%
echo.
echo Se subira al repositorio:
echo %REMOTE_URL%
echo.
echo Se subira a la rama remota:
echo %TARGET_BRANCH%
echo.
set /p CONFIRMAR=Escribe SUBIR para continuar: 

if /I not "%CONFIRMAR%"=="SUBIR" (
    echo.
    echo Proceso cancelado. No se subio nada.
    echo.
    pause
    exit /b 0
)

echo.
echo Creando fecha de respaldo...
for /f %%i in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd-HHmmss"') do set "FECHA=%%i"

set "BACKUP_BRANCH=respaldo-local-%FECHA%"
set "BACKUP_DIR=.git\local-backups"
set "PATCH_FILE=%BACKUP_DIR%\cambios-locales-%FECHA%.patch"
set "MSG_FILE=%BACKUP_DIR%\mensaje-commit-%FECHA%.txt"

if not exist "%BACKUP_DIR%" mkdir "%BACKUP_DIR%"

echo.
echo Creando rama de respaldo local...
git branch "%BACKUP_BRANCH%"
if errorlevel 1 (
    echo.
    echo ERROR: No se pudo crear la rama de respaldo.
    echo No se continuara.
    echo.
    pause
    exit /b 1
)

echo Respaldo local creado:
echo %BACKUP_BRANCH%

echo.
echo Agregando todos los cambios...
git add -A
if errorlevel 1 (
    echo.
    echo ERROR: Fallo git add -A.
    echo No se continuara.
    echo.
    pause
    exit /b 1
)

echo.
echo Creando respaldo patch de los cambios preparados...
git diff --cached --binary HEAD > "%PATCH_FILE%"
if errorlevel 1 (
    echo.
    echo ADVERTENCIA: No se pudo crear el archivo patch.
    echo El proceso puede continuar porque ya existe la rama de respaldo.
    echo.
) else (
    echo Patch creado:
    echo %PATCH_FILE%
)

echo.
echo Cambios preparados para commit:
git status --short
echo.

echo Resumen de cambios:
git diff --cached --stat
echo.

git diff --cached --quiet
if errorlevel 2 (
    echo.
    echo ERROR: No se pudo revisar si existen cambios preparados.
    echo.
    pause
    exit /b 1
)

if not errorlevel 1 (
    echo.
    echo No hay cambios nuevos para hacer commit.
    echo Se continuara con pull y push por seguridad.
    goto PULL_REBASE
)

echo.
set /p COMMIT_MSG=Escribe el mensaje del commit y presiona Enter: 

if "%COMMIT_MSG%"=="" (
    set "COMMIT_MSG=Actualizar app de titulos con cambios locales"
)

> "%MSG_FILE%" echo(!COMMIT_MSG!

echo.
echo Creando commit...
git commit -F "%MSG_FILE%"
if errorlevel 1 (
    echo.
    echo ERROR: No se pudo crear el commit.
    echo Revisa el mensaje anterior de Git.
    echo.
    echo Tu respaldo local es:
    echo %BACKUP_BRANCH%
    echo.
    echo Tu patch esta en:
    echo %PATCH_FILE%
    echo.
    pause
    exit /b 1
)

:PULL_REBASE
echo.
echo Actualizando con GitHub usando pull --rebase...
git pull --rebase %REMOTE% %TARGET_BRANCH%
if errorlevel 1 (
    echo.
    echo ==================================================
    echo   ERROR O CONFLICTO DURANTE EL PULL --REBASE
    echo ==================================================
    echo.
    echo No se hizo push.
    echo Debes resolver el conflicto en VS Code.
    echo.
    echo Opciones utiles:
    echo   git status
    echo   git rebase --continue
    echo   git rebase --abort
    echo.
    echo Tu respaldo local es:
    echo %BACKUP_BRANCH%
    echo.
    echo Tu patch esta en:
    echo %PATCH_FILE%
    echo.
    pause
    exit /b 1
)

echo.
echo Verificando estado antes del push...
git status -sb
echo.

echo ==================================================
echo   ULTIMA CONFIRMACION
echo ==================================================
echo.
echo Ahora se ejecutara:
echo git push %REMOTE% %TARGET_BRANCH%
echo.
echo Eso subira tus cambios a:
echo %REMOTE_URL%
echo.
set /p PUSH_CONFIRM=Escribe SI para hacer push a main: 

if /I not "%PUSH_CONFIRM%"=="SI" (
    echo.
    echo Push cancelado por el usuario.
    echo Tus cambios quedaron en commit local, pero no se subieron.
    echo Para subir luego usa:
    echo git push %REMOTE% %TARGET_BRANCH%
    echo.
    pause
    exit /b 0
)

echo.
echo Subiendo cambios a GitHub...
git push %REMOTE% %TARGET_BRANCH%
if errorlevel 1 (
    echo.
    echo ERROR: No se pudo hacer push.
    echo Revisa el mensaje anterior de Git.
    echo.
    echo Tu respaldo local es:
    echo %BACKUP_BRANCH%
    echo.
    echo Tu patch esta en:
    echo %PATCH_FILE%
    echo.
    pause
    exit /b 1
)

echo.
echo ==================================================
echo   LISTO: CAMBIOS SUBIDOS A GITHUB EN MAIN
echo ==================================================
echo.

echo Repositorio:
echo %REMOTE_URL%
echo.

echo Rama:
echo %TARGET_BRANCH%
echo.

echo Ultimo commit local:
git log -1 --oneline

echo.
echo Estado final:
git status -sb

echo.
echo Respaldo local creado:
echo %BACKUP_BRANCH%

echo.
echo Patch de respaldo:
echo %PATCH_FILE%

echo.
pause
exit /b 0