# Backend

FastAPI backend for the Data Centre Customer Onboarding MVP.

## Setup

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env
```

Update `.env` with your database password.

## Database

Run the initial migration:

```powershell
alembic upgrade head
```

Seed local development users:

```powershell
python -m app.scripts.seed_dev_data
```

## Run

```powershell
uvicorn app.main:app --reload
```

## Useful Endpoints

- `GET /health`
- `POST /api/v1/auth/login`
- `GET /api/v1/auth/me`
