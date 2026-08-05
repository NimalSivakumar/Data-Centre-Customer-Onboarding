from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user, get_db, require_roles
from app.modules.requests.schemas import RequestResponse, ReviewRequest
from app.modules.requests.service import (
    approve_request,
    cancel_request,
    get_request,
    list_requests,
    reject_request,
)
from app.modules.users.models import User
from app.shared.enums import RequestStatus, RequestType, UserRole
from app.shared.exceptions import not_found

router = APIRouter(prefix="/requests", tags=["requests"])


def user_role_names(user: User) -> set[str]:
    return {role.name for role in user.roles}


def can_view_request(user: User, request_owner_id: UUID | None) -> bool:
    roles = user_role_names(user)
    if roles.intersection({UserRole.ADMIN.value, UserRole.OPS.value}):
        return True
    if UserRole.SECURITY.value in roles:
        return False
    return request_owner_id == user.id


@router.get("", response_model=dict)
def get_requests(
    q: str | None = None,
    status_filter: RequestStatus | None = Query(default=None, alias="status"),
    request_type: RequestType | None = None,
    company_id: UUID | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    roles = user_role_names(current_user)
    if UserRole.SECURITY.value in roles and not roles.intersection({UserRole.ADMIN.value, UserRole.OPS.value}):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")

    requested_by_id = None if roles.intersection({UserRole.ADMIN.value, UserRole.OPS.value}) else current_user.id
    requests, total = list_requests(
        db,
        q=q,
        status=status_filter.value if status_filter else None,
        request_type=request_type.value if request_type else None,
        company_id=company_id,
        requested_by_id=requested_by_id,
        page=page,
        page_size=page_size,
    )
    return {
        "items": [RequestResponse.model_validate(request) for request in requests],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.get("/{request_id}", response_model=RequestResponse)
def get_request_detail(
    request_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> RequestResponse:
    request = get_request(db, request_id)
    if not request:
        raise not_found("Request not found")
    if not can_view_request(current_user, request.requested_by_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")
    return RequestResponse.model_validate(request)


@router.post("/{request_id}/approve", response_model=RequestResponse)
def post_approve_request(
    request_id: UUID,
    payload: ReviewRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.ADMIN.value, UserRole.OPS.value)),
) -> RequestResponse:
    request = get_request(db, request_id)
    if not request:
        raise not_found("Request not found")
    try:
        return RequestResponse.model_validate(approve_request(db, request, payload, current_user))
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.post("/{request_id}/reject", response_model=RequestResponse)
def post_reject_request(
    request_id: UUID,
    payload: ReviewRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.ADMIN.value, UserRole.OPS.value)),
) -> RequestResponse:
    request = get_request(db, request_id)
    if not request:
        raise not_found("Request not found")
    try:
        return RequestResponse.model_validate(reject_request(db, request, payload, current_user))
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.post("/{request_id}/cancel", response_model=RequestResponse)
def post_cancel_request(
    request_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> RequestResponse:
    request = get_request(db, request_id)
    if not request:
        raise not_found("Request not found")
    try:
        return RequestResponse.model_validate(cancel_request(db, request, current_user))
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
