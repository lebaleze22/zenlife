#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

if [ ! -d .venv ]; then
  python -m venv .venv
fi

. .venv/Scripts/activate 2>/dev/null || . .venv/bin/activate
python -m pip install --upgrade pip
pip install -r requirements.txt

if [ ! -f .env ]; then
  cp .env.example .env
fi

python manage.py makemigrations
python manage.py migrate
python manage.py runserver 0.0.0.0:8000
