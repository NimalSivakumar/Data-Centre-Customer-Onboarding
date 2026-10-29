from datetime import date, datetime, time, timedelta
from typing import Any
from uuid import UUID
from zoneinfo import ZoneInfo

from sqlalchemy import Select, and_, func, or_, select
from sqlalchemy.orm import Session

from app.modules.audit.models import AuditLog
from app.core.dependencies import InternalPrincipal
from app.core.config import settings


def get_actor_snapshot(actor: object | None) -> dict[str, Any]:
    if not actor:
        return {}

    roles = sorted(
        role.name
        for role in getattr(actor, "roles", [])
        if isinstance(getattr(role, "name", None), str)
    )

    if isinstance(actor, InternalPrincipal):
        return {
            "actor_subject": actor.subject,
            "actor_tenant_id": actor.tenant_id,
            "actor_email_snapshot": actor.email,
            "actor_name_snapshot": actor.full_name,
            "actor_roles_snapshot": roles,
        }

    actor_id = getattr(actor, "id", None)
    return {
        "actor_subject": f"legacy-user:{actor_id}" if actor_id else None,
        "actor_tenant_id": None,
        "actor_email_snapshot": getattr(actor, "email", None),
        "actor_name_snapshot": getattr(actor, "full_name", None),
        "actor_roles_snapshot": roles or None,
    }


def record_audit_log(
    db: Session,
    *,
    actor: object | None,
    action: str,
    entity_type: str,
    entity_id: UUID | None,
    summary: str,
    metadata: dict[str, Any] | None = None,
) -> AuditLog:
    log = AuditLog(
        **get_actor_snapshot(actor),
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        summary=summary,
        metadata_json=metadata,
    )
    db.add(log)
    return log


def list_audit_logs(
    db: Session,
    *,
    entity_type: str | None = None,
    entity_id: UUID | None = None,
    actor_subject: str | None = None,
    actor_tenant_id: str | None = None,
    action: str | None = None,
    from_date: datetime | None = None,
    to_date: datetime | None = None,
    page: int = 1,
    page_size: int = 50,
    from_day: date | None = None,
    to_day: date | None = None,
    before_created_at: datetime | None = None,
    before_id: UUID | None = None,
    exclude_session_events: bool = True,
) -> tuple[list[AuditLog], int]:
    if from_day and to_day and from_day > to_day:
        raise ValueError("From date must be on or before the to date")
    if to_day == date.max:
        raise ValueError("To date must be before 9999-12-31")
    if (before_created_at is None) != (before_id is None):
        raise ValueError("Both audit cursor fields must be provided")
    if before_created_at is not None and before_created_at.utcoffset() is None:
        raise ValueError("Audit cursor timestamp must include a timezone offset")
    stmt: Select[tuple[AuditLog]] = select(AuditLog)
    count_stmt = select(func.count()).select_from(AuditLog)
    filters = []

    if exclude_session_events:
        filters.append(AuditLog.entity_type != "user_session")

    if entity_type:
        filters.append(AuditLog.entity_type == entity_type)
    if entity_id:
        filters.append(AuditLog.entity_id == entity_id)
    if actor_subject:
        filters.append(AuditLog.actor_subject == actor_subject)
    if actor_tenant_id:
        filters.append(AuditLog.actor_tenant_id == actor_tenant_id)
    if action:
        filters.append(AuditLog.action == action)
    if from_date:
        filters.append(AuditLog.created_at >= from_date)
    if to_date:
        filters.append(AuditLog.created_at <= to_date)
    if from_day:
        filters.append(AuditLog.created_at >= datetime.combine(from_day, time.min, tzinfo=ZoneInfo(settings.site_timezone)))
    if to_day:
        filters.append(AuditLog.created_at < datetime.combine(to_day + timedelta(days=1), time.min, tzinfo=ZoneInfo(settings.site_timezone)))

    for condition in filters:
        stmt = stmt.where(condition)
        count_stmt = count_stmt.where(condition)

    total = db.scalar(count_stmt) or 0
    if before_created_at is not None and before_id is not None:
        stmt = stmt.where(or_(
            AuditLog.created_at < before_created_at,
            and_(AuditLog.created_at == before_created_at, AuditLog.id < before_id),
        ))
    logs = db.scalars(
        stmt.order_by(AuditLog.created_at.desc(), AuditLog.id.desc()).offset((page - 1) * page_size).limit(page_size)
    ).all()
    return list(logs), total
