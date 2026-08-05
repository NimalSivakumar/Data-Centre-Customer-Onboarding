from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.dependencies import get_db, require_roles
from app.modules.users.models import User
from app.modules.users.schemas import InternalUserCreate, InternalUserResponse, InternalUserUpdate
from app.modules.users.service import create_internal_user, list_internal_users, update_internal_user
from app.shared.enums import UserRole

router = APIRouter(prefix="/users", tags=["users"])


def to_internal_user_response(user: User, temporary_password: str | None = None) -> InternalUserResponse:
    role = next((role.name for role in user.roles if role.name in {UserRole.OPS.value, UserRole.SECURITY.value}), "")
    return InternalUserResponse(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        role=role,
        status="ACTIVE" if user.is_active else "INACTIVE",
        temporary_password=temporary_password,
    )


@router.get("/internal", response_model=list[InternalUserResponse])
def get_internal_staff_users(
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(UserRole.ADMIN.value)),
) -> list[InternalUserResponse]:
    return [to_internal_user_response(user) for user in list_internal_users(db)]


@router.post("/internal", response_model=InternalUserResponse, status_code=status.HTTP_201_CREATED)
def create_internal_staff_user(
    payload: InternalUserCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.ADMIN.value)),
) -> InternalUserResponse:
    try:
        user, temporary_password = create_internal_user(db, payload, current_user)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    return to_internal_user_response(user, temporary_password)


@router.patch("/internal/{user_id}", response_model=InternalUserResponse)
def patch_internal_staff_user(
    user_id: UUID,
    payload: InternalUserUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.ADMIN.value)),
) -> InternalUserResponse:
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Internal user not found")
    role_names = {role.name for role in user.roles}
    if not role_names.intersection({UserRole.OPS.value, UserRole.SECURITY.value}):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Internal user not found")
    try:
        return to_internal_user_response(update_internal_user(db, user, payload, current_user))
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
