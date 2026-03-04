# Backend quickstart

1. Create venv and install deps
   - `python -m venv .venv`
   - `.venv\\Scripts\\pip install -r requirements.txt`
2. Set env vars (or defaults)
   - `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_HOST`, `POSTGRES_PORT`
3. Run migrations
   - `.venv\\Scripts\\python manage.py makemigrations`
   - `.venv\\Scripts\\python manage.py migrate`
4. Start API
   - `.venv\\Scripts\\python manage.py runserver 0.0.0.0:8000`

Health endpoint: `GET /api/v1/health`
