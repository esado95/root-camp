@echo off
title Quiz TSSR2601 - serveur local
echo ============================================
echo   Quiz TSSR2601 - http://localhost:8123
echo   Fermez cette fenetre pour arreter le quiz
echo ============================================
start "" http://localhost:8123
python -m http.server 8123 --directory "%~dp0"
