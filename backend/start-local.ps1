# Starts the API locally with zero setup (SQLite, development secrets).
# Run from anywhere:  powershell -ExecutionPolicy Bypass -File backend\start-local.ps1
# First run creates .venv and installs requirements; later runs just start.
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

if (-not (Test-Path '.venv\Scripts\python.exe')) {
    Write-Host 'Creating virtual environment...'
    python -m venv .venv
    .venv\Scripts\python.exe -m pip install --quiet --upgrade pip
    .venv\Scripts\python.exe -m pip install --quiet -r requirements.txt
}

.venv\Scripts\python.exe manage.py migrate_all --verbosity 0
Write-Host 'API:   http://127.0.0.1:8000/api/v1/   (health: http://127.0.0.1:8000/health)'
Write-Host 'Admin: http://127.0.0.1:8000/admin/    (create a login: .venv\Scripts\python.exe manage.py createsuperuser)'
.venv\Scripts\python.exe manage.py runserver 127.0.0.1:8000
