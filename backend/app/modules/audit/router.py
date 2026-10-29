from datetime import date, datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.dependencies import get_db, require_roles
from app.modules.audit.schemas import AuditLogResponse
from app.modules.audit.service import list_audit_logs
from app.shared.enums import UserRole

router = APIRouter(prefix="/audit-logs", tags=["audit logs"])


@router.get("", response_model=dict)
def get_audit_logs(
    entity_type: str | None = None,
    entity_id: UUID | None = None,
    actor_subject: str | None = None,
    actor_tenant_id: str | None = None,
    action: str | None = None,
    from_date: datetime | None = None,
    to_date: datetime | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=100),
    db: Session = Depends(get_db),
    _: object = Depends(require_roles(UserRole.ADMIN.value, UserRole.OPS.value)),
    from_day: date | None = None,
    to_day: date | None = None,
    before_created_at: datetime | None = None,
    before_id: UUID | None = None,
    exclude_session_events: bool = False,
) -> dict:
    try:
        logs, total = list_audit_logs(
            db,
            entity_type=entity_type,
            entity_id=entity_id,
            actor_subject=actor_subject,
            actor_tenant_id=actor_tenant_id,
            action=action,
            from_date=from_date,
            to_date=to_date,
            page=page,
            page_size=page_size,
            from_day=from_day,
            to_day=to_day,
            before_created_at=before_created_at,
            before_id=before_id,
            exclude_session_events=exclude_session_events,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return {
        "items": [
            AuditLogResponse(
                id=log.id,
                actor_subject=log.actor_subject,
                actor_tenant_id=log.actor_tenant_id,
                actor_email_snapshot=log.actor_email_snapshot,
                actor_name_snapshot=log.actor_name_snapshot,
                actor_roles_snapshot=log.actor_roles_snapshot,
                actor_email=log.actor_email_snapshot,
                actor_full_name=log.actor_name_snapshot,
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
