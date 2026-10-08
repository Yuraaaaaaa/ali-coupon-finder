@echo off
setlocal EnableDelayedExpansion
rem Publishes this folder to GitHub. When the version in extension\manifest.json is new,
rem GitHub builds the ZIP and creates the release by itself (see .github\workflows\release.yml).
cd /d "%~dp0"
chcp 65001 >nul

where git >nul 2>&1 || (echo Git is not installed. Get it from https://git-scm.com/download/win & goto :end)
git rev-parse --is-inside-work-tree >nul 2>&1 || (echo This folder is not a Git repository. & goto :end)
git remote get-url origin >nul 2>&1 || (echo No GitHub address set. Run: git remote add origin https://github.com/YOUR-NAME/ali-coupon-finder.git & goto :end)

for /f "usebackq delims=" %%v in (`powershell -NoProfile -Command "(Get-Content -Raw 'extension\manifest.json' | ConvertFrom-Json).version"`) do set VERSION=%%v
for /f "usebackq delims=" %%u in (`git remote get-url origin`) do set REMOTE=%%u
set REPO=%REMOTE:.git=%

echo.
echo Publishing Ali Coupon Finder v%VERSION% to %REPO%
echo.

git add -A
git diff --cached --quiet
if errorlevel 1 (
  git commit -q -m "Release v%VERSION%"
  echo Saved your changes.
) else (
  echo No new changes to save.
)

git push -u origin main
if errorlevel 1 (
  echo.
  echo GitHub has a different copy of the project, for example files uploaded through the website.
  set /p ANSWER=Replace the copy on GitHub with this folder? [Y/N] 
  if /i "!ANSWER!"=="Y" (
    git push -u origin main --force
    if errorlevel 1 (echo Push failed. Check your internet connection and GitHub sign-in. & goto :end)
  ) else (
    echo Nothing was changed on GitHub. & goto :end
  )
)

echo.
echo Done. In about a minute the release v%VERSION% with the ZIP appears here:
echo   %REPO%/releases
echo Progress: %REPO%/actions
:end
echo.
pause
