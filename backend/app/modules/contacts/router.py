from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user, get_db, require_roles
from app.modules.companies.service import get_company, user_has_company_access
from app.modules.contacts.models import Contact
from app.modules.contacts.schemas import ContactCreate, ContactResponse, ContactUpdate
from app.modules.contacts.service import create_contact, get_contact, list_contacts_for_company, update_contact
from app.modules.users.models import User
from app.shared.enums import UserRole
from app.shared.exceptions import not_found

router = APIRouter(tags=["contacts"])


def is_internal(user: User) -> bool:
    return bool({role.name for role in user.roles}.intersection({UserRole.ADMIN.value, UserRole.OPS.value}))


def contact_response(contact: Contact) -> ContactResponse:
    user_status = "NO_USER"
    user_role = None
    if contact.user:
        user_status = "ACTIVE_USER" if contact.user.is_active else "INACTIVE_USER"
        user_role = next((role.name for role in contact.user.roles if role.name in {UserRole.CUSTOMER_ADMIN.value, UserRole.CUSTOMER_USER.value}), None)
    return ContactResponse(
        id=contact.id,
        company_id=contact.company_id,
        user_id=contact.user_id,
        full_name=contact.full_name,
        email=contact.email,
        phone=contact.phone,
        job_title=contact.job_title,
        contact_type=contact.contact_type,
        is_primary=contact.is_primary,
        status=contact.status,
        user_account_status=user_status,
        user_role=user_role,
        created_at=contact.created_at,
        updated_at=contact.updated_at,
    )


@router.get("/companies/{company_id}/contacts", response_model=list[ContactResponse])
def get_company_contacts(
    company_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[ContactResponse]:
    roles = {role.name for role in current_user.roles}
    if UserRole.SECURITY.value in roles and not is_internal(current_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")
    if not is_internal(current_user) and not user_has_company_access(db, current_user.id, company_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")
    if not get_company(db, company_id):
        raise not_found("Company not found")
    return [contact_response(contact) for contact in list_contacts_for_company(db, company_id)]


@router.post("/companies/{company_id}/contacts", response_model=ContactResponse)
def post_company_contact(
    company_id: UUID,
    payload: ContactCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.ADMIN.value, UserRole.OPS.value)),
) -> ContactResponse:
    if not get_company(db, company_id):
        raise not_found("Company not found")
    try:
        return contact_response(create_contact(db, company_id, payload, current_user))
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.patch("/contacts/{contact_id}", response_model=ContactResponse)
def patch_contact(
    contact_id: UUID,
    payload: ContactUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.ADMIN.value, UserRole.OPS.value)),
) -> ContactResponse:
    contact = get_contact(db, contact_id)
    if not contact:
        raise not_found("Contact not found")
    return contact_response(update_contact(db, contact, payload, current_user))
