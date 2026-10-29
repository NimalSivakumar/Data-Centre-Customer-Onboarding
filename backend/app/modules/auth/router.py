from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.dependencies import InternalPrincipal, get_entra_principal, get_db, require_roles
from app.shared.enums import UserRole
from app.modules.auth.schemas import SiteSettingsResponse, UserResponse
from app.core.config import settings
from app.modules.session_events.schemas import UserSessionEndRequest, UserSessionEndResponse, UserSessionStartResponse
from app.modules.session_events.service import (
    SESSION_TIMEOUT, SESSION_WARNING_SECONDS, end_user_session, heartbeat_user_session,
    record_user_activity, start_user_session, utc_now,
)

router = APIRouter()


def to_user_response(user: InternalPrincipal) -> UserResponse:
    return UserResponse(
        provider=user.provider,
        subject=user.subject,
        email=user.email,
        full_name=user.full_name,
        roles=[role.name for role in user.roles],
    )


@router.get("/me", response_model=UserResponse)
def me(current_user: InternalPrincipal = Depends(get_entra_principal)) -> UserResponse:
    return to_user_response(current_user)


@router.get("/site-settings", response_model=SiteSettingsResponse)
def get_site_settings(
    _: InternalPrincipal = Depends(get_entra_principal),
) -> SiteSettingsResponse:
    # Explicit allowlist: never serialize the application Settings object.
    return SiteSettingsResponse(site_timezone=settings.site_timezone, site_location=settings.site_location)


def session_response(session) -> UserSessionStartResponse:
    remaining = max(0, (session.last_activity_at + SESSION_TIMEOUT - utc_now()).total_seconds())
    return UserSessionStartResponse(
        session_id=session.id, idle_remaining_seconds=remaining,
        idle_timeout_seconds=int(SESSION_TIMEOUT.total_seconds()), idle_warning_seconds=SESSION_WARNING_SECONDS,
    )


@router.post("/sessions", response_model=UserSessionStartResponse)
def create_session(
    db: Session = Depends(get_db),
    current_user: InternalPrincipal = Depends(require_roles(UserRole.ADMIN.value, UserRole.OPS.value, UserRole.SECURITY.value, require_session=False)),
) -> UserSessionStartResponse:
    session = start_user_session(db, actor=current_user)
    return session_response(session)


@router.post("/sessions/{session_id}/heartbeat", response_model=UserSessionStartResponse)
def heartbeat_session(
    session_id: UUID,
    db: Session = Depends(get_db),
    current_user: InternalPrincipal = Depends(require_roles(UserRole.ADMIN.value, UserRole.OPS.value, UserRole.SECURITY.value, require_session=False)),
) -> UserSessionStartResponse:
    session = heartbeat_user_session(db, actor=current_user, session_id=session_id)
    if not session:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Application session expired; sign in again")
    return session_response(session)


@router.post("/sessions/{session_id}/activity", response_model=UserSessionStartResponse)
def post_session_activity(
    session_id: UUID,
    db: Session = Depends(get_db),
    current_user: InternalPrincipal = Depends(require_roles(UserRole.ADMIN.value, UserRole.OPS.value, UserRole.SECURITY.value, require_session=False)),
) -> UserSessionStartResponse:
    try:
        session = record_user_activity(db, actor=current_user, session_id=session_id)
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc)) from exc
    return session_response(session)


@router.post("/sessions/{session_id}/end", response_model=UserSessionEndResponse)
def end_session(
    session_id: UUID,
    payload: UserSessionEndRequest | None = None,
    db: Session = Depends(get_db),
    current_user: InternalPrincipal = Depends(require_roles(UserRole.ADMIN.value, UserRole.OPS.value, UserRole.SECURITY.value, require_session=False)),
) -> UserSessionEndResponse:
    session = end_user_session(db, actor=current_user, session_id=session_id, end_reason=payload.reason if payload else "USER_SIGNED_OUT")
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    return UserSessionEndResponse(session_id=session.id)
