# Data Centre Customer Onboarding

MVP application for data centre customer onboarding and visitor access tracking.

This initial build contains the Phase 1 backend foundation:

- FastAPI application structure
- PostgreSQL connection configuration
- SQLAlchemy models for users and roles
- Alembic migration setup
- Local development login with JWT
- Role-based access dependency foundation
- Seed script for initial roles and test users

## Backend Quick Start

```powershell
cd "Data Centre Customer Onboarding\backend"
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env
```

Edit `.env` and set your PostgreSQL password in `DATABASE_URL`.

Run migrations:

```powershell
alembic upgrade head
```

Seed local roles and users:

```powershell
python -m app.scripts.seed_dev_data
```

Start the API:

```powershell
uvicorn app.main:app --reload
```

Open:

```text
http://localhost:8000/docs
```

## Frontend Quick Start

In a second terminal, keep the backend running and start the React frontend:

```powershell
cd "Data Centre Customer Onboarding\frontend"
npm.cmd install
npm.cmd run dev
```

Open:

```text
http://localhost:5173
```

The frontend calls the backend using:

```env
VITE_API_BASE_URL="http://localhost:8000/api/v1"
```

## Test Users

The seed script creates local development users with password:

```text
password
```

Users:

- `admin@example.com`
- `ops@example.com`
- `security@example.com`
- `customer.admin@example.com`
- `customer.user@example.com`
