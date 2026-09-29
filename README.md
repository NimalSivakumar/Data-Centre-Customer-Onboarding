# Data Centre Customer Onboarding

MVP application for data centre customer onboarding and visitor access tracking.

This build contains the Entra-only onboarding foundation:

- FastAPI application structure
- PostgreSQL connection configuration
- SQLAlchemy business models for companies, contacts, requests, visitor access, and audit logs
- Alembic migration setup
- Microsoft Entra ID authentication and app-role authorization
- Audit actor snapshots from validated Entra claims

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

## Local Microsoft Entra Login

The app uses Microsoft Entra ID only. Local username/password login and customer login accounts are not supported.

For localhost testing, the Entra app registration must include this SPA redirect URI:

```text
http://localhost:5173
```

Add the Entra values to your real `frontend/.env` file:

```env
VITE_ENTRA_TENANT_ID="97df7dc2-f178-4ce4-b55e-bcafc144485e"
VITE_ENTRA_CLIENT_ID="304a3bcf-af30-4104-9ebb-a256a201cb43"
VITE_ENTRA_REDIRECT_URI="http://localhost:5173"
```

Add the Entra values to your real `backend/.env` file:

```env
ENTRA_TENANT_ID="97df7dc2-f178-4ce4-b55e-bcafc144485e"
ENTRA_CLIENT_ID="304a3bcf-af30-4104-9ebb-a256a201cb43"
```

The backend maps the signed-in Microsoft account to an existing local `users` record and only allows internal roles: `ADMIN`, `OPS`, or `SECURITY`.

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
