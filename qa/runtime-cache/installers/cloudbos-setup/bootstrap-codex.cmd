@echo off
setlocal DisableDelayedExpansion
set "bos_event=%~1"
if "%bos_event%"=="SessionStart" goto supported
if "%bos_event%"=="UserPromptSubmit" goto supported
if "%bos_event%"=="PreToolUse" goto supported
if "%bos_event%"=="PostToolUse" goto supported
if "%bos_event%"=="Stop" goto supported
if "%bos_event%"=="SessionEnd" goto supported
echo BOS hook bootstrap: unsupported event. 1>&2
exit /b 1
:supported
rem Marker presence only refuses the public route; it grants no authority.
set "bos_guard_dir=%CD%"
:check_private_parent
if exist "%bos_guard_dir%\.bos" goto skip_private
if exist "%bos_guard_dir%\BOS_PRODUCT_AUTHORITY.json" goto skip_private
for %%I in ("%bos_guard_dir%\..") do set "bos_parent=%%~fI"
if /I "%bos_guard_dir%"=="%bos_parent%" goto runtime_lookup
set "bos_guard_dir=%bos_parent%"
goto check_private_parent
:runtime_lookup
set "bos_cache=%BOS_RUNTIME_CACHE_ROOT%"
if not defined bos_cache if not defined USERPROFILE goto repair
if not defined bos_cache set "bos_cache=%USERPROFILE%\.cloudbos-setup\runtimes"
set "bos_runtime_dir=%bos_cache%\node-v24.22.1-win32-x64-d702daa815eabbff"
set "bos_runtime_exe=%bos_runtime_dir%\node.exe"
if not exist "%bos_runtime_exe%" goto repair
set "PATH=%SystemRoot%\System32;%PATH%"
set "bos_hash="
for /f "skip=1 tokens=*" %%H in ('certutil.exe -hashfile "%bos_runtime_exe%" SHA256 2^>nul') do if not defined bos_hash set "bos_hash=%%H"
if /I not "%bos_hash%"=="d702daa815eabbff763c7d3808e235cf031cf2ca70211b56847bc72f51e240e5" goto repair
set "NODE_OPTIONS="
set "NODE_PATH="
set "PATH=%bos_runtime_dir%;%PATH%"
"%bos_runtime_exe%" "%~dp0bos_hook_ownership.mjs" run --host codex
exit /b %errorlevel%
:repair
if "%bos_event%"=="PreToolUse" goto deny_cloud
if "%bos_event%"=="SessionStart" goto warn_startup
echo {}
exit /b 0
:deny_cloud
echo {"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"BOS runtime needs repair. Open BOS setup before making this Cloud call."}}
exit /b 0
:warn_startup
echo {"systemMessage":"BOS runtime needs repair. Open BOS setup. Ordinary authorized work can continue."}
exit /b 0
:skip_private
echo {}
exit /b 0
