from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status as http_status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user, get_db, require_roles
from app.modules.companies.schemas import CompanyCreate, CompanyResponse, CompanyUpdate, CompanyUserCreate, CompanyUserResponse
from app.modules.companies.service import assign_company_user, create_company, get_company, list_companies, list_company_users, update_company, user_has_company_access
from app.modules.contacts.models import Contact
from app.modules.users.models import User
from app.shared.enums import CompanyStatus, UserRole
from app.shared.exceptions import not_found

router = APIRouter(prefix="/companies", tags=["companies"])


def role_names(user: User) -> set[str]:
    return {role.name for role in user.roles}


def is_internal(user: User) -> bool:
    return bool(role_names(user).intersection({UserRole.ADMIN.value, UserRole.OPS.value}))


def company_user_response(db: Session, mapping, user: User, temporary_password: str | None = None) -> CompanyUserResponse:
    contact = db.scalar(select(Contact).where(Contact.user_id == user.id).where(Contact.company_id == mapping.company_id))
    login_role = next((role.name for role in user.roles if role.name in {UserRole.CUSTOMER_ADMIN.value, UserRole.CUSTOMER_USER.value}), None)
    return CompanyUserResponse(
        id=mapping.id,
        company_id=mapping.company_id,
        user_id=user.id,
        contact_id=contact.id if contact else None,
        email=user.email,
        full_name=user.full_name,
        role=login_role,
        status=mapping.status,
        temporary_password=temporary_password,
        created_at=mapping.created_at,
    )


@router.get("", response_model=dict)
def get_companies(
    q: str | None = None,
    status: CompanyStatus | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    roles = role_names(current_user)
    if UserRole.SECURITY.value in roles and not is_internal(current_user):
        raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")
    companies, total = list_companies(
        db,
        q=q,
        status=status.value if status else None,
        user_id=None if is_internal(current_user) else current_user.id,
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
    current_user: User = Depends(require_roles(UserRole.ADMIN.value, UserRole.OPS.value)),
) -> CompanyResponse:
    try:
        return CompanyResponse.model_validate(create_company(db, payload, current_user))
    except ValueError as exc:
        raise HTTPException(status_code=http_status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.get("/{company_id}", response_model=CompanyResponse)
def get_company_detail(
    company_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> CompanyResponse:
    roles = role_names(current_user)
    if UserRole.SECURITY.value in roles and not is_internal(current_user):
        raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")
    if not is_internal(current_user) and not user_has_company_access(db, current_user.id, company_id):
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
    current_user: User = Depends(require_roles(UserRole.ADMIN.value, UserRole.OPS.value)),
) -> CompanyResponse:
    company = get_company(db, company_id)
    if not company:
        raise not_found("Company not found")
    return CompanyResponse.model_validate(update_company(db, company, payload, current_user))


@router.get("/{company_id}/users", response_model=list[CompanyUserResponse])
def get_company_users(
    company_id: UUID,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(UserRole.ADMIN.value, UserRole.OPS.value)),
) -> list[CompanyUserResponse]:
    if not get_company(db, company_id):
        raise not_found("Company not found")
    return [company_user_response(db, mapping, user) for mapping, user in list_company_users(db, company_id)]


@router.post("/{company_id}/users", response_model=CompanyUserResponse)
def post_company_user(
    company_id: UUID,
    payload: CompanyUserCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.ADMIN.value, UserRole.OPS.value)),
) -> CompanyUserResponse:
    if not get_company(db, company_id):
        raise not_found("Company not found")
    try:
        mapping, user, temporary_password = assign_company_user(
            db,
            company_id,
            contact_id=payload.contact_id,
            full_name=payload.full_name,
            email=str(payload.email) if payload.email else None,
            phone=payload.phone,
            job_title=payload.job_title,
            contact_type=payload.contact_type.value,
            role_name=payload.role.value,
            is_primary=payload.is_primary,
            status=payload.status,
            actor=current_user,
        )
    except ValueError as exc:
        raise HTTPException(status_code=http_status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return company_user_response(db, mapping, user, temporary_password)
