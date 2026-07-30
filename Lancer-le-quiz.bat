@echo off
title Root Camp - serveur local
echo ============================================
echo   Root Camp (TSSR2601) - http://localhost:8123
echo   Fermez cette fenetre pour arreter le quiz
echo ============================================
start "" http://localhost:8123
python -m http.server 8123 --directory "%~dp0"
