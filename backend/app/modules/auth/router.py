from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.dependencies import InternalPrincipal, get_current_principal, get_db
from app.modules.auth.schemas import UserResponse
from app.modules.session_events.schemas import UserSessionEndResponse, UserSessionStartResponse
from app.modules.session_events.service import end_user_session, heartbeat_user_session, start_user_session

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
def me(current_user: InternalPrincipal = Depends(get_current_principal)) -> UserResponse:
    return to_user_response(current_user)


@router.post("/sessions", response_model=UserSessionStartResponse)
def create_session(
    db: Session = Depends(get_db),
    current_user: InternalPrincipal = Depends(get_current_principal),
) -> UserSessionStartResponse:
    session = start_user_session(db, actor=current_user)
    return UserSessionStartResponse(session_id=session.id)


@router.post("/sessions/{session_id}/heartbeat", status_code=204)
def heartbeat_session(
    session_id: UUID,
    db: Session = Depends(get_db),
    current_user: InternalPrincipal = Depends(get_current_principal),
) -> None:
    session = heartbeat_user_session(db, actor=current_user, session_id=session_id)
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Active session not found")


@router.post("/sessions/{session_id}/end", response_model=UserSessionEndResponse)
def end_session(
    session_id: UUID,
    db: Session = Depends(get_db),
    current_user: InternalPrincipal = Depends(get_current_principal),
) -> UserSessionEndResponse:
    session = end_user_session(db, actor=current_user, session_id=session_id)
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    return UserSessionEndResponse(session_id=session.id)
