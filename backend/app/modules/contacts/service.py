from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.dependencies import InternalPrincipal
from app.modules.audit.service import record_audit_log
from app.modules.contacts.models import Contact
from app.modules.contacts.schemas import ContactCreate, ContactUpdate


def get_contact(db: Session, contact_id: UUID) -> Contact | None:
    return db.get(Contact, contact_id)


def list_contacts_for_company(db: Session, company_id: UUID) -> list[Contact]:
    return list(
        db.scalars(
            select(Contact).where(Contact.company_id == company_id).order_by(Contact.is_primary.desc(), Contact.created_at.asc())
        ).all()
    )


def create_contact(db: Session, company_id: UUID, payload: ContactCreate, actor: InternalPrincipal) -> Contact:
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


def update_contact(db: Session, contact: Contact, payload: ContactUpdate, actor: InternalPrincipal) -> Contact:
    changes = payload.model_dump(exclude_unset=True, mode="json")
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
    audit_changes = {
        field: {"from": before[field], "to": value}
        for field, value in changes.items()
    }
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
