from datetime import datetime
from typing import Any
from uuid import UUID

from sqlalchemy import Select, func, select
from sqlalchemy.orm import Session

from app.modules.audit.models import AuditLog
from app.core.dependencies import InternalPrincipal


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
) -> tuple[list[AuditLog], int]:
    stmt: Select[tuple[AuditLog]] = select(AuditLog)
    count_stmt = select(func.count()).select_from(AuditLog)
    filters = []

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

    for condition in filters:
        stmt = stmt.where(condition)
        count_stmt = count_stmt.where(condition)

    total = db.scalar(count_stmt) or 0
    logs = db.scalars(
        stmt.order_by(AuditLog.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    ).all()
    return list(logs), total
