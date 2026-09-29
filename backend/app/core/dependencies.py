from collections.abc import Generator
from dataclasses import dataclass
from datetime import datetime, timezone
import logging
from typing import Literal

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.security import decode_entra_token
from app.db.session import SessionLocal
from app.shared.enums import UserRole

bearer_scheme = HTTPBearer(auto_error=False)
INTERNAL_ROLES = {UserRole.ADMIN.value, UserRole.OPS.value, UserRole.SECURITY.value}
logger = logging.getLogger("uvicorn.error")


@dataclass(frozen=True)
class PrincipalRole:
    name: str


@dataclass(frozen=True)
class InternalPrincipal:
    provider: Literal["entra"]
    tenant_id: str
    object_id: str
    subject: str
    email: str | None
    full_name: str
    roles: frozenset[PrincipalRole]
    access_token_expires_at: datetime | None


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_current_principal(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> InternalPrincipal:
    if not credentials:
        logger.warning("Auth request missing bearer token")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing bearer token",
        )

    claims = decode_entra_token(credentials.credentials)
    token_roles = claims.get("roles") if isinstance(claims.get("roles"), list) else []
    app_roles = frozenset(str(role) for role in token_roles if str(role) in INTERNAL_ROLES)
    if not app_roles:
        logger.warning("Entra token has no allowed app roles: roles=%s", token_roles)
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Microsoft account is not authorised for this app",
        )

    tenant_id = str(claims["tid"])
    object_id = str(claims["oid"])
    email = claims.get("preferred_username") or claims.get("email") or claims.get("upn")
    display_name = claims.get("name") or email or object_id
    exp = claims.get("exp")
    return InternalPrincipal(
        provider="entra",
        tenant_id=tenant_id,
        object_id=object_id,
        subject=f"entra:{tenant_id}:{object_id}",
        email=str(email) if email else None,
        full_name=str(display_name),
        roles=frozenset(PrincipalRole(name=role) for role in app_roles),
        access_token_expires_at=datetime.fromtimestamp(exp, tz=timezone.utc) if isinstance(exp, int) else None,
    )


get_current_user = get_current_principal


def require_roles(*required_roles: str):
    def dependency(current_user: InternalPrincipal = Depends(get_current_principal)) -> InternalPrincipal:
        user_roles = {role.name for role in current_user.roles}
        if not user_roles.intersection(required_roles):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions",
            )
        return current_user

    return dependency
