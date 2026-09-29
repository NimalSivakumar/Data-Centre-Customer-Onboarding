from uuid import UUID

from sqlalchemy import Select, func, or_, select
from sqlalchemy.orm import Session

from app.core.dependencies import InternalPrincipal
from app.modules.audit.service import record_audit_log
from app.modules.companies.models import Company
from app.modules.companies.schemas import CompanyCreate, CompanyUpdate
from app.modules.contacts.models import Contact


def get_company(db: Session, company_id: UUID) -> Company | None:
    return db.get(Company, company_id)


def list_companies(
    db: Session,
    q: str | None = None,
    status: str | None = None,
    page: int = 1,
    page_size: int = 20,
) -> tuple[list[Company], int]:
    stmt: Select[tuple[Company]] = select(Company)
    count_stmt = select(func.count()).select_from(Company)
    filters = []

    if q:
        pattern = f"%{q}%"
        filters.append(
            or_(
                Company.name.ilike(pattern),
                Company.customer_code.ilike(pattern),
                Company.main_email.ilike(pattern),
            )
        )
    if status:
        filters.append(Company.status == status)

    for condition in filters:
        stmt = stmt.where(condition)
        count_stmt = count_stmt.where(condition)

    total = db.scalar(count_stmt) or 0
    companies = db.scalars(
        stmt.order_by(Company.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    ).all()
    return list(companies), total


def create_company(db: Session, payload: CompanyCreate, actor: InternalPrincipal) -> Company:
    company_data = payload.model_dump(mode="json")
    company = Company(
        **company_data,
    )
    db.add(company)
    db.flush()

    main_contact = Contact(
        company_id=company.id,
        full_name="Main company contact",
        email=str(payload.main_email).lower() if payload.main_email else None,
        phone=payload.main_phone,
        job_title="Main company contact",
        contact_type="MANAGEMENT",
        is_primary=True,
        is_authorised_requester=False,
        status="ACTIVE",
    )
    db.add(main_contact)
    db.flush()

    record_audit_log(
        db,
        actor=actor,
        action="COMPANY_CREATED",
        entity_type="company",
        entity_id=company.id,
        summary=f"Company created: {company.name}",
        metadata={"company": company_data},
    )
    record_audit_log(
        db,
        actor=actor,
        action="CONTACT_CREATED",
        entity_type="contact",
        entity_id=main_contact.id,
        summary=f"Main company contact created for: {company.name}",
        metadata={"company_id": str(company.id), "email": main_contact.email, "source": "company_create"},
    )
    db.commit()
    db.refresh(company)
    return company


def update_company(db: Session, company: Company, payload: CompanyUpdate, actor: InternalPrincipal) -> Company:
    changes = payload.model_dump(exclude_unset=True, mode="json")
    changes = {field: value for field, value in changes.items() if getattr(company, field) != value}
    before = {field: getattr(company, field) for field in changes}
    for field, value in changes.items():
        setattr(company, field, value)
    if changes:
        record_audit_log(
            db,
            actor=actor,
            action="COMPANY_UPDATED",
            entity_type="company",
            entity_id=company.id,
            summary=f"Company updated: {company.name}",
            metadata={"before": before, "after": changes},
        )
    db.commit()
    db.refresh(company)
    return company
