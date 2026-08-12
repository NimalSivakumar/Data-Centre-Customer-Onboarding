from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.modules.audit.router import router as audit_router
from app.modules.auth.router import router as auth_router
from app.modules.companies.router import router as companies_router
from app.modules.contacts.router import router as contacts_router
from app.modules.dashboard.router import router as dashboard_router
from app.modules.requests.router import router as requests_router
from app.modules.security_portal.router import router as security_portal_router
from app.modules.users.router import router as users_router
from app.modules.visitor_access.router import router as visitor_access_router

app = FastAPI(title=settings.app_name)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health_check() -> dict[str, str]:
    return {"status": "ok", "app": settings.app_name}


@app.get("/health/ready")
def readiness_check() -> dict[str, str]:
    return {"status": "ready", "app": settings.app_name}


app.include_router(auth_router, prefix="/api/v1/auth", tags=["auth"])
app.include_router(companies_router, prefix="/api/v1")
app.include_router(contacts_router, prefix="/api/v1")
app.include_router(requests_router, prefix="/api/v1")
app.include_router(visitor_access_router, prefix="/api/v1")
app.include_router(security_portal_router, prefix="/api/v1")
app.include_router(users_router, prefix="/api/v1")
app.include_router(audit_router, prefix="/api/v1")
app.include_router(dashboard_router, prefix="/api/v1")
