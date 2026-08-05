import secrets

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import get_password_hash
from app.modules.audit.service import record_audit_log
from app.modules.users.schemas import InternalUserCreate, InternalUserUpdate
from app.modules.users.models import Role, User
from app.shared.enums import UserRole


def get_user_by_email(db: Session, email: str) -> User | None:
    return db.scalar(select(User).where(User.email == email.lower()))


def get_role_by_name(db: Session, name: str) -> Role | None:
    return db.scalar(select(Role).where(Role.name == name))


def create_internal_user(db: Session, payload: InternalUserCreate, actor: User) -> tuple[User, str]:
    if payload.role not in {UserRole.OPS.value, UserRole.SECURITY.value}:
        raise ValueError("Role must be OPS or SECURITY")
    if payload.status not in {"ACTIVE", "INACTIVE"}:
        raise ValueError("Status must be ACTIVE or INACTIVE")
    if get_user_by_email(db, str(payload.email)):
        raise ValueError("A user with this email already exists")
    role = get_role_by_name(db, payload.role)
    if not role:
        raise ValueError(f"Role not found: {payload.role}")

    temporary_password = secrets.token_urlsafe(12)
    user = User(
        email=str(payload.email).lower(),
        full_name=payload.full_name,
        hashed_password=get_password_hash(temporary_password),
        auth_provider="local",
        is_active=payload.status == "ACTIVE",
        must_change_password=True,
    )
    user.roles.append(role)
    db.add(user)
    db.flush()
    record_audit_log(
        db,
        actor=actor,
        action="INTERNAL_USER_CREATED",
        entity_type="user",
        entity_id=user.id,
        summary=f"Internal user created: {user.email}",
        metadata={"email": user.email, "full_name": user.full_name, "role": payload.role, "status": payload.status},
    )
    db.commit()
    db.refresh(user)
    return user, temporary_password


def list_internal_users(db: Session) -> list[User]:
    return list(
        db.scalars(
            select(User)
            .join(User.roles)
            .where(Role.name.in_([UserRole.OPS.value, UserRole.SECURITY.value]))
            .order_by(User.created_at.desc())
        )
        .unique()
        .all()
    )


def update_internal_user(db: Session, user: User, payload: InternalUserUpdate, actor: User) -> User:
    changes = payload.model_dump(exclude_unset=True)
    if "role" in changes and changes["role"] not in {UserRole.OPS.value, UserRole.SECURITY.value}:
        raise ValueError("Role must be OPS or SECURITY")
    if "status" in changes and changes["status"] not in {"ACTIVE", "INACTIVE"}:
        raise ValueError("Status must be ACTIVE or INACTIVE")

    before = {
        "full_name": user.full_name,
        "role": next((role.name for role in user.roles if role.name in {UserRole.OPS.value, UserRole.SECURITY.value}), None),
        "status": "ACTIVE" if user.is_active else "INACTIVE",
    }

    if "full_name" in changes and changes["full_name"] is not None:
        user.full_name = changes["full_name"]
    if "status" in changes and changes["status"] is not None:
        user.is_active = changes["status"] == "ACTIVE"
    if "role" in changes and changes["role"] is not None and changes["role"] != before["role"]:
        role = get_role_by_name(db, changes["role"])
        if not role:
            raise ValueError(f"Role not found: {changes['role']}")
        user.roles = [existing for existing in user.roles if existing.name not in {UserRole.OPS.value, UserRole.SECURITY.value}]
        user.roles.append(role)

    after = {
        "full_name": user.full_name,
        "role": next((role.name for role in user.roles if role.name in {UserRole.OPS.value, UserRole.SECURITY.value}), None),
        "status": "ACTIVE" if user.is_active else "INACTIVE",
    }
    changed = {key: after[key] for key in after if before[key] != after[key]}
    if changed:
        record_audit_log(
            db,
            actor=actor,
            action="INTERNAL_USER_UPDATED",
            entity_type="user",
            entity_id=user.id,
            summary=f"Internal user updated: {user.email}",
            metadata={"target": {"full_name": user.full_name, "email": user.email}, "before": before, "after": after},
        )
    db.commit()
    db.refresh(user)
    return user
