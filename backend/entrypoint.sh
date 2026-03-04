#!/bin/sh
set -e

DB_HOST="${POSTGRES_HOST:-db}"
DB_PORT="${POSTGRES_PORT:-5432}"

echo "Waiting for PostgreSQL at ${DB_HOST}:${DB_PORT}..."
while ! nc -z "${DB_HOST}" "${DB_PORT}"; do
  sleep 1
done

echo "Applying migrations..."
python manage.py migrate --noinput

echo "Starting Gunicorn..."
exec gunicorn config.wsgi:application --bind 0.0.0.0:8000 --workers 3 --timeout 120
