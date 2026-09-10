from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.dependencies import get_db, require_roles
from app.modules.audit.schemas import AuditLogResponse
from app.modules.audit.service import list_audit_logs
from app.modules.users.models import User
from app.shared.enums import UserRole

router = APIRouter(prefix="/audit-logs", tags=["audit logs"])


@router.get("", response_model=dict)
def get_audit_logs(
    entity_type: str | None = None,
    entity_id: UUID | None = None,
    actor_user_id: UUID | None = None,
    action: str | None = None,
    from_date: datetime | None = None,
    to_date: datetime | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=100),
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(UserRole.ADMIN.value, UserRole.OPS.value)),
) -> dict:
    logs, total = list_audit_logs(
        db,
        entity_type=entity_type,
        entity_id=entity_id,
        actor_user_id=actor_user_id,
        action=action,
        from_date=from_date,
        to_date=to_date,
        page=page,
        page_size=page_size,
    )
    actor_ids = {log.actor_user_id for log in logs if log.actor_user_id}
    actors = {
        user.id: user
        for user in db.scalars(select(User).where(User.id.in_(actor_ids))).all()
    } if actor_ids else {}
    return {
        "items": [
            AuditLogResponse(
                id=log.id,
                actor_user_id=log.actor_user_id,
                actor_email=actors[log.actor_user_id].email if log.actor_user_id in actors else None,
                actor_full_name=actors[log.actor_user_id].full_name if log.actor_user_id in actors else None,
                action=log.action,
                entity_type=log.entity_type,
                entity_id=log.entity_id,
                summary=log.summary,
                metadata_json=log.metadata_json,
                created_at=log.created_at,
            )
            for log in logs
        ],
        "total": total,
        "page": page,
        "page_size": page_size,
    }

