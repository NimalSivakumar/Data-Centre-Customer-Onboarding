from sqlalchemy.orm import Session

from app.core.security import get_password_hash
from app.db.session import SessionLocal
from app.modules.companies.models import Company
from app.modules.companies.service import assign_company_user
from app.modules.contacts import models as contact_models  # noqa: F401
from app.modules.contacts.models import Contact
from app.modules.users.models import Role, User
from app.modules.users.service import get_role_by_name, get_user_by_email
from app.shared.enums import UserRole
from sqlalchemy import select

ROLE_DESCRIPTIONS = {
    UserRole.ADMIN: "Full administrative access",
    UserRole.OPS: "Operations user for companies and request approvals",
    UserRole.SECURITY: "Security portal user for visitor verification",
    UserRole.CUSTOMER_ADMIN: "Customer administrator",
    UserRole.CUSTOMER_USER: "Customer user",
}

USERS = [
    ("admin@example.com", "Admin User", UserRole.ADMIN),
    ("ops@example.com", "Ops User", UserRole.OPS),
    ("security@example.com", "Security User", UserRole.SECURITY),
    ("customer.admin@example.com", "Customer Admin", UserRole.CUSTOMER_ADMIN),
    ("customer.user@example.com", "Customer User", UserRole.CUSTOMER_USER),
]


def seed_roles(db: Session) -> dict[UserRole, Role]:
    roles: dict[UserRole, Role] = {}
    for role_name, description in ROLE_DESCRIPTIONS.items():
        role = get_role_by_name(db, role_name.value)
        if role is None:
            role = Role(name=role_name.value, description=description)
            db.add(role)
        roles[role_name] = role
    db.flush()
    return roles


def seed_users(db: Session, roles: dict[UserRole, Role]) -> None:
    for email, full_name, role_name in USERS:
        user = get_user_by_email(db, email)
        if user is None:
            user = User(
                email=email,
                full_name=full_name,
                hashed_password=get_password_hash("password"),
                auth_provider="local",
            )
            db.add(user)
        if roles[role_name] not in user.roles:
            user.roles.append(roles[role_name])


def seed_company_user_mapping(db: Session) -> None:
    company = db.scalar(select(Company).order_by(Company.created_at.asc()))
    if not company:
        return
    admin_contact = db.scalar(select(Contact).where(Contact.company_id == company.id).where(Contact.email == "customer.admin@example.com"))
    user_contact = db.scalar(select(Contact).where(Contact.company_id == company.id).where(Contact.email == "customer.user@example.com"))
    assign_company_user(
        db,
        company.id,
        contact_id=admin_contact.id if admin_contact else None,
        full_name="Customer Admin",
        email="customer.admin@example.com",
        phone=None,
        job_title=None,
        contact_type="MANAGEMENT",
        role_name=UserRole.CUSTOMER_ADMIN.value,
        is_primary=True,
    )
    assign_company_user(
        db,
        company.id,
        contact_id=user_contact.id if user_contact else None,
        full_name="Customer User",
        email="customer.user@example.com",
        phone=None,
        job_title=None,
        contact_type="OTHER",
        role_name=UserRole.CUSTOMER_USER.value,
        is_primary=False,
    )


def main() -> None:
    db = SessionLocal()
    try:
        roles = seed_roles(db)
        seed_users(db, roles)
        db.commit()
        seed_company_user_mapping(db)
        print("Seeded development roles and users.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
