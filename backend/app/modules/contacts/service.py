from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.modules.audit.service import record_audit_log
from app.modules.companies.models import CompanyUser
from app.modules.contacts.models import Contact
from app.modules.contacts.schemas import ContactCreate, ContactUpdate
from app.modules.users.models import User
from app.modules.users.service import get_role_by_name
from app.shared.enums import UserRole


def get_contact(db: Session, contact_id: UUID) -> Contact | None:
    return db.get(Contact, contact_id)


def list_contacts_for_company(db: Session, company_id: UUID) -> list[Contact]:
    return list(
        db.scalars(
            select(Contact).where(Contact.company_id == company_id).order_by(Contact.is_primary.desc(), Contact.created_at.asc())
        ).all()
    )


def create_contact(db: Session, company_id: UUID, payload: ContactCreate, actor: User) -> Contact:
    contact_data = payload.model_dump(mode="json")
    if contact_data.get("email"):
        existing = db.scalar(
            select(Contact)
            .where(Contact.company_id == company_id)
            .where(func.lower(Contact.email) == contact_data["email"].lower())
        )
        if existing:
            raise ValueError("A contact with this email already exists for this company")
    contact = Contact(company_id=company_id, **contact_data)
    db.add(contact)
    db.flush()

    record_audit_log(
        db,
        actor=actor,
        action="CONTACT_CREATED",
        entity_type="contact",
        entity_id=contact.id,
        summary=f"Contact created: {contact.full_name}",
        metadata={"company_id": str(company_id), "contact": contact_data},
    )

    db.commit()
    db.refresh(contact)
    return contact


def update_contact(db: Session, contact: Contact, payload: ContactUpdate, actor: User) -> Contact:
    changes = payload.model_dump(exclude_unset=True, exclude={"user_role", "user_status"}, mode="json")
    user_changes = payload.model_dump(exclude_unset=True, include={"user_role", "user_status"}, mode="json")
    changes = {field: value for field, value in changes.items() if getattr(contact, field) != value}
    if changes.get("email"):
        existing = db.scalar(
            select(Contact)
            .where(Contact.company_id == contact.company_id)
            .where(Contact.id != contact.id)
            .where(func.lower(Contact.email) == changes["email"].lower())
        )
        if existing:
            raise ValueError("A contact with this email already exists for this company")
    before = {field: getattr(contact, field) for field in changes}
    for field, value in changes.items():
        setattr(contact, field, value)
    if user_changes and not contact.user:
        raise ValueError("This contact does not have a linked user account")
    actual_user_changes = {}
    if contact.user and user_changes.get("user_role"):
        role_name = user_changes["user_role"]
        if role_name not in {UserRole.CUSTOMER_ADMIN.value, UserRole.CUSTOMER_USER.value}:
            raise ValueError("User role must be CUSTOMER_ADMIN or CUSTOMER_USER")
        current_role = next((role.name for role in contact.user.roles if role.name in {UserRole.CUSTOMER_ADMIN.value, UserRole.CUSTOMER_USER.value}), None)
        if current_role != role_name:
            role = get_role_by_name(db, role_name)
            if not role:
                raise ValueError(f"Role not found: {role_name}")
            contact.user.roles = [r for r in contact.user.roles if r.name not in {UserRole.CUSTOMER_ADMIN.value, UserRole.CUSTOMER_USER.value}]
            contact.user.roles.append(role)
            actual_user_changes["user_role"] = {"from": current_role, "to": role_name}
    if contact.user and user_changes.get("user_status"):
        user_status = user_changes["user_status"]
        if user_status not in {"ACTIVE", "INACTIVE"}:
            raise ValueError("User status must be ACTIVE or INACTIVE")
        current_status = "ACTIVE" if contact.user.is_active else "INACTIVE"
        if current_status != user_status:
            contact.user.is_active = user_status == "ACTIVE"
            mapping = db.scalar(
                select(CompanyUser)
                .where(CompanyUser.company_id == contact.company_id)
                .where(CompanyUser.user_id == contact.user.id)
            )
            if mapping:
                mapping.status = user_status
            actual_user_changes["user_status"] = {"from": current_status, "to": user_status}
    audit_changes = {
        field: {"from": before[field], "to": value}
        for field, value in changes.items()
    }
    audit_changes.update(actual_user_changes)
    if audit_changes:
        record_audit_log(
            db,
            actor=actor,
            action="CONTACT_UPDATED",
            entity_type="contact",
            entity_id=contact.id,
            summary=f"Contact updated: {contact.full_name}",
            metadata={
                "target": {
                    "contact_name": contact.full_name,
                    "contact_email": contact.email,
                    "account_email": contact.user.email if contact.user else None,
                    "company_id": str(contact.company_id),
                },
                "changes": audit_changes,
            },
        )
    db.commit()
    db.refresh(contact)
    return contact
