from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status as http_status
from sqlalchemy.orm import Session

from app.core.dependencies import InternalPrincipal, get_current_user, get_db, require_roles
from app.modules.companies.schemas import CompanyCreate, CompanyResponse, CompanyUpdate
from app.modules.companies.service import create_company, get_company, list_companies, update_company
from app.shared.enums import CompanyStatus, UserRole
from app.shared.exceptions import not_found

router = APIRouter(prefix="/companies", tags=["companies"])


def role_names(user: InternalPrincipal) -> set[str]:
    return {role.name for role in user.roles}


def is_internal(user: InternalPrincipal) -> bool:
    return bool(role_names(user).intersection({UserRole.ADMIN.value, UserRole.OPS.value}))


@router.get("", response_model=dict)
def get_companies(
    q: str | None = None,
    status: CompanyStatus | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: InternalPrincipal = Depends(get_current_user),
) -> dict:
    roles = role_names(current_user)
    if UserRole.SECURITY.value in roles and not is_internal(current_user):
        raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")
    companies, total = list_companies(
        db,
        q=q,
        status=status.value if status else None,
        page=page,
        page_size=page_size,
    )
    return {
        "items": [CompanyResponse.model_validate(company) for company in companies],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.post("", response_model=CompanyResponse)
def post_company(
    payload: CompanyCreate,
    db: Session = Depends(get_db),
    current_user: InternalPrincipal = Depends(require_roles(UserRole.ADMIN.value, UserRole.OPS.value)),
) -> CompanyResponse:
    try:
        return CompanyResponse.model_validate(create_company(db, payload, current_user))
    except ValueError as exc:
        raise HTTPException(status_code=http_status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.get("/{company_id}", response_model=CompanyResponse)
def get_company_detail(
    company_id: UUID,
    db: Session = Depends(get_db),
    current_user: InternalPrincipal = Depends(get_current_user),
) -> CompanyResponse:
    roles = role_names(current_user)
    if UserRole.SECURITY.value in roles and not is_internal(current_user):
        raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")
    company = get_company(db, company_id)
    if not company:
        raise not_found("Company not found")
    return CompanyResponse.model_validate(company)


@router.patch("/{company_id}", response_model=CompanyResponse)
def patch_company(
    company_id: UUID,
    payload: CompanyUpdate,
    db: Session = Depends(get_db),
    current_user: InternalPrincipal = Depends(require_roles(UserRole.ADMIN.value, UserRole.OPS.value)),
) -> CompanyResponse:
    company = get_company(db, company_id)
    if not company:
        raise not_found("Company not found")
    return CompanyResponse.model_validate(update_company(db, company, payload, current_user))
