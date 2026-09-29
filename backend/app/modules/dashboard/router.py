from datetime import date

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.dependencies import get_db, require_roles
from app.modules.dashboard.schemas import AdminSummaryResponse, SecuritySummaryResponse
from app.modules.dashboard.service import get_admin_summary, get_security_summary
from app.shared.enums import UserRole

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/admin-summary", response_model=AdminSummaryResponse)
def admin_summary(
    db: Session = Depends(get_db),
    _: object = Depends(require_roles(UserRole.ADMIN.value, UserRole.OPS.value)),
) -> AdminSummaryResponse:
    return get_admin_summary(db, date.today())


@router.get("/security-summary", response_model=SecuritySummaryResponse)
def security_summary(
    db: Session = Depends(get_db),
    _: object = Depends(require_roles(UserRole.SECURITY.value, UserRole.ADMIN.value, UserRole.OPS.value)),
) -> SecuritySummaryResponse:
    return get_security_summary(db, date.today())
