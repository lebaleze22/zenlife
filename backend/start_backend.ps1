param(
  [string]$HostAddr = "0.0.0.0",
  [int]$Port = 8000
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

if (-not (Test-Path ".venv")) {
  try {
    python -m venv .venv
  } catch {
    Write-Warning "Virtual environment creation failed, falling back to system Python."
  }
}

$py = if (Test-Path ".\.venv\Scripts\python.exe") { ".\.venv\Scripts\python" } else { "python" }

& $py -m pip install --upgrade pip
& $py -m pip install -r requirements.txt

if (-not (Test-Path ".env")) {
  Copy-Item .env.example .env
}

& $py manage.py makemigrations
& $py manage.py migrate
& $py manage.py runserver "$HostAddr`:$Port"
