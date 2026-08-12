# Docker Local Development

This Docker setup is for local development only. It does not replace the current Ubuntu production deployment.

## Requirements

- Docker Desktop on Windows, macOS, or Linux
- Project source code cloned locally

You do not need to install PostgreSQL, Python packages, or Node packages directly on the machine. Docker runs them inside containers.

## Start The App

Docker Compose reads these local environment files:

```text
.env
backend/.env
frontend/.env
```

These files are ignored by Git and should not be pushed.

Root `.env` for the PostgreSQL container:

```env
POSTGRES_DB=dc_onboarding
POSTGRES_USER=dc_user
POSTGRES_PASSWORD=dconboarding
POSTGRES_PORT=5433
```

Backend `.env` for Docker local development:

```env
APP_NAME="DC Onboarding MVP"
APP_ENV="development"
DATABASE_URL="postgresql+psycopg://dc_user:dconboarding@postgres:5432/dc_onboarding"
SECRET_KEY="local-docker-development-secret-change-for-production"
ACCESS_TOKEN_EXPIRE_MINUTES=480
CORS_ORIGINS="http://localhost:5173,http://127.0.0.1:5173"
AUTH_MODE="local"
```

Frontend `.env` for Docker local development:

```env
VITE_API_BASE_URL="http://localhost:8000/api/v1"
VITE_BASE_PATH="/"
```

From the project root:

```bash
docker compose up --build
```

Open:

```text
http://localhost:5173
```

Backend health check:

```text
http://localhost:8000/health
```

API docs:

```text
http://localhost:8000/docs
```

## Services

```text
frontend  -> http://localhost:5173
backend   -> http://localhost:8000
postgres  -> localhost:5433
```

The backend container connects to PostgreSQL using Docker's internal service name:

```text
postgres:5432
```

## Seed Local Users

After the containers are running, seed development roles and users:

```bash
docker compose exec backend python -m app.scripts.seed_dev_data
```

Default seeded users use password:

```text
password
```

Example admin:

```text
admin@example.com
```

## Stop The App

```bash
docker compose down
```

Stop and remove the local database volume:

```bash
docker compose down -v
```

Only use `-v` when you want to delete local Docker database data.

## Local Database Connection

From pgAdmin on your local machine:

```text
Host: localhost
Port: 5433
Database: dc_onboarding
Username: dc_user
Password: dconboarding
```

## Production Subpath Build

For the company server path deployment, build the frontend with:

```env
VITE_BASE_PATH="/dc-onboarding/"
VITE_API_BASE_URL="http://test-ussd.cwsey.com/dc-onboarding-api/v1"
```

For local Docker development, keep:

```env
VITE_BASE_PATH="/"
VITE_API_BASE_URL="http://localhost:8000/api/v1"
```
