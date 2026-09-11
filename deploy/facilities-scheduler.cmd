@echo off
REM Launcher for the facilities cron worker on a native Windows host.
REM
REM docker-compose.yml also defines this worker as `facilities_scheduler`, and
REM that is the right way to run it wherever the stack runs in containers. This
REM script exists for hosts where Postgres and the API run natively, because
REM the compose service points DATABASE_URL at the `postgres` service rather
REM than at a native server, so running the container here would have the
REM worker generating compliance tasks against the wrong database.
REM
REM The worker polls every FACILITIES_SCHEDULER_INTERVAL_SECONDS (default 1800)
REM and every operation it performs is idempotent, so a restart mid-cycle or an
REM overlap with somebody pressing the button in the UI cannot double anything.

setlocal

REM backend\venv is currently unusable: it was built by a Python 3.13 that is no
REM longer installed on this machine (see backend\venv\pyvenv.cfg). Prefer it
REM when it works, and fall back to the interpreter that does.
set "PYTHON=%~dp0..\backend\venv\Scripts\python.exe"
if not exist "%PYTHON%" set "PYTHON=python"
"%PYTHON%" -c "import sys" >nul 2>&1
if errorlevel 1 set "PYTHON=%LOCALAPPDATA%\Programs\Python\Python312\python.exe"

cd /d "%~dp0..\backend"
"%PYTHON%" -m app.jobs.facilities_scheduler

endlocal
