from datetime import date
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.dependencies import get_db, require_roles
from app.modules.security_portal.schemas import CheckInRequest, SecurityActionRequest, SecurityVisitorResponse
from app.modules.security_portal.service import (
    check_in_visitor,
    check_out_visitor,
    deny_visitor_entry,
    get_security_visitor,
    list_security_visitors,
    to_security_visitor_response,
)
from app.modules.users.models import User
from app.shared.enums import UserRole, VisitStatus
from app.shared.exceptions import not_found

router = APIRouter(prefix="/security/visitors", tags=["security portal"])


@router.get("", response_model=list[SecurityVisitorResponse])
def get_visitors(
    date_filter: date = Query(alias="date"),
    status_filter: VisitStatus | None = Query(default=None, alias="status"),
    q: str | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(UserRole.SECURITY.value, UserRole.ADMIN.value, UserRole.OPS.value)),
) -> list[SecurityVisitorResponse]:
    visitors = list_security_visitors(
        db,
        visit_date=date_filter,
        status=status_filter.value if status_filter else None,
        q=q,
    )
    return [to_security_visitor_response(visitor) for visitor in visitors]


@router.get("/{visitor_access_id}", response_model=SecurityVisitorResponse)
def get_visitor_detail(
    visitor_access_id: UUID,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(UserRole.SECURITY.value, UserRole.ADMIN.value, UserRole.OPS.value)),
) -> SecurityVisitorResponse:
    visitor = get_security_visitor(db, visitor_access_id)
    if not visitor:
        raise not_found("Visitor access record not found")
    return to_security_visitor_response(visitor)


@router.post("/{visitor_access_id}/check-in", response_model=SecurityVisitorResponse)
def post_check_in(
    visitor_access_id: UUID,
    payload: CheckInRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.SECURITY.value)),
) -> SecurityVisitorResponse:
    visitor = get_security_visitor(db, visitor_access_id)
    if not visitor:
        raise not_found("Visitor access record not found")
    try:
        return to_security_visitor_response(check_in_visitor(db, visitor, payload, current_user))
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.post("/{visitor_access_id}/check-out", response_model=SecurityVisitorResponse)
def post_check_out(
    visitor_access_id: UUID,
    payload: SecurityActionRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.SECURITY.value)),
) -> SecurityVisitorResponse:
    visitor = get_security_visitor(db, visitor_access_id)
    if not visitor:
        raise not_found("Visitor access record not found")
    try:
        return to_security_visitor_response(check_out_visitor(db, visitor, payload, current_user))
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.post("/{visitor_access_id}/deny-entry", response_model=SecurityVisitorResponse)
def post_deny_entry(
    visitor_access_id: UUID,
    payload: SecurityActionRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.SECURITY.value)),
) -> SecurityVisitorResponse:
    visitor = get_security_visitor(db, visitor_access_id)
    if not visitor:
        raise not_found("Visitor access record not found")
    try:
        return to_security_visitor_response(deny_visitor_entry(db, visitor, payload, current_user))
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
