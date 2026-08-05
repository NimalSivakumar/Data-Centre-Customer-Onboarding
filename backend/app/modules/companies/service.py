from uuid import UUID
import secrets

from sqlalchemy import Select, func, or_, select
from sqlalchemy.orm import Session

from app.core.security import get_password_hash
from app.modules.audit.service import record_audit_log
from app.modules.companies.models import Company, CompanyUser
from app.modules.companies.schemas import CompanyCreate, CompanyUpdate
from app.modules.contacts.models import Contact
from app.modules.users.models import User
from app.modules.users.service import get_role_by_name, get_user_by_email
from app.shared.enums import UserRole


def get_company(db: Session, company_id: UUID) -> Company | None:
    return db.get(Company, company_id)


def list_companies(
    db: Session,
    q: str | None = None,
    status: str | None = None,
    user_id: UUID | None = None,
    page: int = 1,
    page_size: int = 20,
) -> tuple[list[Company], int]:
    stmt: Select[tuple[Company]] = select(Company)
    count_stmt = select(func.count()).select_from(Company)
    filters = []

    if user_id:
        stmt = stmt.join(CompanyUser, CompanyUser.company_id == Company.id)
        count_stmt = count_stmt.join(CompanyUser, CompanyUser.company_id == Company.id)
        filters.append(CompanyUser.user_id == user_id)
        filters.append(CompanyUser.status == "ACTIVE")

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


def create_company(db: Session, payload: CompanyCreate, actor: User) -> Company:
    company_data = payload.model_dump(mode="json")
    company = Company(
        **company_data,
        created_by_id=actor.id,
        updated_by_id=actor.id,
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


def update_company(db: Session, company: Company, payload: CompanyUpdate, actor: User) -> Company:
    changes = payload.model_dump(exclude_unset=True, mode="json")
    changes = {field: value for field, value in changes.items() if getattr(company, field) != value}
    before = {field: getattr(company, field) for field in changes}
    for field, value in changes.items():
        setattr(company, field, value)
    company.updated_by_id = actor.id
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


def user_has_company_access(db: Session, user_id: UUID, company_id: UUID) -> bool:
    return db.scalar(
        select(func.count())
        .select_from(CompanyUser)
        .where(CompanyUser.user_id == user_id)
        .where(CompanyUser.company_id == company_id)
        .where(CompanyUser.status == "ACTIVE")
    ) > 0


def list_company_users(db: Session, company_id: UUID) -> list[tuple[CompanyUser, User]]:
    return list(
        db.execute(
            select(CompanyUser, User)
            .join(User, User.id == CompanyUser.user_id)
            .where(CompanyUser.company_id == company_id)
            .order_by(CompanyUser.created_at.desc())
        ).all()
    )


def assign_company_user(
    db: Session,
    company_id: UUID,
    *,
    contact_id: UUID | None,
    full_name: str | None,
    email: str | None,
    phone: str | None,
    job_title: str | None,
    contact_type: str,
    role_name: str,
    is_primary: bool,
    status: str = "ACTIVE",
    actor: User | None = None,
) -> tuple[CompanyUser, User, str | None]:
    if role_name not in {UserRole.CUSTOMER_ADMIN.value, UserRole.CUSTOMER_USER.value}:
        raise ValueError("Role must be CUSTOMER_ADMIN or CUSTOMER_USER")

    role = get_role_by_name(db, role_name)
    if not role:
        raise ValueError(f"Role not found: {role_name}")

    if contact_id:
        contact = db.get(Contact, contact_id)
        if not contact or contact.company_id != company_id:
            raise ValueError("Contact not found for selected company")
        if contact.user_id:
            raise ValueError("Selected contact already has a user account")
        if not contact.email:
            raise ValueError("Selected contact must have an email before login access can be created")
        user_email = contact.email
        user_full_name = contact.full_name
    else:
        if not full_name or not email:
            raise ValueError("Full name and email are required when creating a new contact and user")
        duplicate_contact = db.scalar(
            select(Contact)
            .where(Contact.company_id == company_id)
            .where(func.lower(Contact.email) == email.lower())
        )
        if duplicate_contact:
            raise ValueError("A contact with this email already exists. Select the existing contact instead.")
        user_email = email
        user_full_name = full_name
        contact = Contact(
            company_id=company_id,
            full_name=full_name,
            email=email.lower(),
            phone=phone,
            job_title=job_title,
            contact_type=contact_type,
            is_primary=is_primary,
            is_authorised_requester=False,
            status="ACTIVE" if status == "ACTIVE" else "INACTIVE",
        )
        db.add(contact)
        db.flush()

    temporary_password = None
    user = get_user_by_email(db, user_email)
    if not user:
        temporary_password = secrets.token_urlsafe(12)
        user = User(
            email=user_email.lower(),
            full_name=user_full_name,
            hashed_password=get_password_hash(temporary_password),
            auth_provider="local",
            must_change_password=True,
        )
        db.add(user)
        db.flush()
        record_audit_log(
            db,
            actor=actor,
            action="CUSTOMER_USER_CREATED",
            entity_type="user",
            entity_id=user.id,
            summary=f"Customer login created: {user.email}",
            metadata={"email": user.email, "full_name": user.full_name, "role": role_name, "status": status},
        )

    if role not in user.roles:
        user.roles.append(role)

    linked_contact = db.scalar(select(Contact).where(Contact.user_id == user.id))
    if linked_contact and linked_contact.id != contact.id:
        raise ValueError("This user account is already linked to another contact")
    contact.user_id = user.id
    contact.status = "ACTIVE" if status == "ACTIVE" else "INACTIVE"

    existing = db.scalar(
        select(CompanyUser)
        .where(CompanyUser.company_id == company_id)
        .where(CompanyUser.user_id == user.id)
    )
    if existing:
        existing.status = status
        mapping = existing
    else:
        mapping = CompanyUser(company_id=company_id, user_id=user.id, status=status)
        db.add(mapping)

    db.commit()
    db.refresh(mapping)
    return mapping, user, temporary_password
