# Backend

FastAPI backend for the Data Centre Customer Onboarding application.

## Setup

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env
```

Update `.env` with your database password.

## Database

Apply the required migrations only with approval for the target database. The command below is a reference, not evidence that any environment has been upgraded:

```powershell
alembic upgrade head
```

## Run

```powershell
uvicorn app.main:app --reload
```

## Useful Endpoints

- `GET /health`
- `GET /api/v1/auth/me`
