from datetime import date, datetime, timezone
from uuid import UUID
from zoneinfo import ZoneInfo

from sqlalchemy import Select, or_, select
from sqlalchemy.orm import Session, selectinload

from app.core.config import settings
from app.modules.audit.service import record_audit_log
from app.modules.requests.models import Request
from app.modules.security_portal.schemas import CheckInRequest, SecurityActionRequest, SecurityVisitorResponse
from app.modules.users.models import User
from app.modules.visitor_access.models import VisitorAccessRequest
from app.shared.enums import RequestStatus, VisitStatus


def get_site_now() -> datetime:
    return datetime.now(ZoneInfo(settings.site_timezone))


def validate_check_in_window(visitor: VisitorAccessRequest) -> None:
    now = get_site_now()
    visit_start = datetime.combine(visitor.visit_date, visitor.expected_arrival_time, tzinfo=now.tzinfo)
    visit_end = datetime.combine(visitor.visit_date, visitor.expected_departure_time, tzinfo=now.tzinfo)

    if now.date() != visitor.visit_date:
        raise ValueError("Visitor can only be checked in on the scheduled visit date")
    if now < visit_start:
        raise ValueError("Visitor cannot be checked in before the expected arrival time")
    if now > visit_end:
        raise ValueError("Visitor cannot be checked in after the expected departure time")


def validate_visit_date(visitor: VisitorAccessRequest) -> None:
    if get_site_now().date() != visitor.visit_date:
        raise ValueError("Visitor action is only allowed on the scheduled visit date")


def to_security_visitor_response(visitor: VisitorAccessRequest) -> SecurityVisitorResponse:
    request = visitor.request
    return SecurityVisitorResponse(
        visitor_access_id=visitor.id,
        request_id=request.id,
        request_number=request.request_number,
        request_status=RequestStatus(request.status),
        request_description=request.description,
        company_id=request.company_id,
        visit_date=visitor.visit_date,
        expected_arrival_time=visitor.expected_arrival_time,
        expected_departure_time=visitor.expected_departure_time,
        site_location=visitor.site_location,
        host_contact_name=visitor.host_contact_name,
        visitor_full_name=visitor.visitor_full_name,
        visitor_id_number=visitor.visitor_id_number,
        visitor_phone=visitor.visitor_phone,
        visitor_email=visitor.visitor_email,
        visitor_address=visitor.visitor_address,
        visitor_company=visitor.visitor_company,
        vehicle_registration=visitor.vehicle_registration,
        equipment_carried=visitor.equipment_carried,
        special_instructions=visitor.special_instructions,
        visit_status=VisitStatus(visitor.visit_status),
        checked_in_at=visitor.checked_in_at,
        checked_out_at=visitor.checked_out_at,
        security_notes=visitor.security_notes,
    )


def get_security_visitor(db: Session, visitor_access_id: UUID) -> VisitorAccessRequest | None:
    return db.scalar(
        select(VisitorAccessRequest)
        .options(selectinload(VisitorAccessRequest.request))
        .where(VisitorAccessRequest.id == visitor_access_id)
    )


def list_security_visitors(
    db: Session,
    visit_date: date,
    status: str | None = None,
    q: str | None = None,
) -> list[VisitorAccessRequest]:
    stmt: Select[tuple[VisitorAccessRequest]] = (
        select(VisitorAccessRequest)
        .join(Request, Request.id == VisitorAccessRequest.request_id)
        .options(selectinload(VisitorAccessRequest.request))
        .where(Request.status == RequestStatus.APPROVED.value)
        .where(VisitorAccessRequest.visit_date == visit_date)
    )

    if status:
        stmt = stmt.where(VisitorAccessRequest.visit_status == status)

    if q:
        pattern = f"%{q}%"
        stmt = stmt.where(
            or_(
                VisitorAccessRequest.visitor_full_name.ilike(pattern),
                VisitorAccessRequest.visitor_id_number.ilike(pattern),
                VisitorAccessRequest.visitor_company.ilike(pattern),
            )
        )

    return list(
        db.scalars(
            stmt.order_by(VisitorAccessRequest.expected_arrival_time.asc(), VisitorAccessRequest.created_at.desc())
        ).all()
    )


def check_in_visitor(
    db: Session,
    visitor: VisitorAccessRequest,
    payload: CheckInRequest,
    actor: User,
) -> VisitorAccessRequest:
    if visitor.request.status != RequestStatus.APPROVED.value:
        raise ValueError("Only approved requests can be checked in")
    if visitor.visit_status != VisitStatus.PENDING_ARRIVAL.value:
        raise ValueError("Visitor can only be checked in from pending arrival status")
    if not payload.identity_verified:
        raise ValueError("Visitor identity must be verified before check-in")
    validate_check_in_window(visitor)

    visitor.visit_status = VisitStatus.CHECKED_IN.value
    visitor.checked_in_at = datetime.now(timezone.utc)
    visitor.checked_in_by_id = actor.id
    visitor.security_notes = payload.security_notes
    record_audit_log(
        db,
        actor=actor,
        action="VISITOR_CHECKED_IN",
        entity_type="visitor_access",
        entity_id=visitor.id,
        summary=f"Visitor {visitor.visitor_full_name} checked in",
        metadata={"request_id": str(visitor.request_id), "security_notes": payload.security_notes},
    )
    db.commit()
    db.refresh(visitor)
    return get_security_visitor(db, visitor.id) or visitor


def check_out_visitor(
    db: Session,
    visitor: VisitorAccessRequest,
    payload: SecurityActionRequest,
    actor: User,
) -> VisitorAccessRequest:
    if visitor.visit_status != VisitStatus.CHECKED_IN.value:
        raise ValueError("Visitor can only be checked out after check-in")
    if get_site_now().date() < visitor.visit_date:
        raise ValueError("Visitor cannot be checked out before the scheduled visit date")

    visitor.visit_status = VisitStatus.CHECKED_OUT.value
    visitor.checked_out_at = datetime.now(timezone.utc)
    visitor.checked_out_by_id = actor.id
    visitor.security_notes = payload.security_notes or visitor.security_notes
    record_audit_log(
        db,
        actor=actor,
        action="VISITOR_CHECKED_OUT",
        entity_type="visitor_access",
        entity_id=visitor.id,
        summary=f"Visitor {visitor.visitor_full_name} checked out",
        metadata={"request_id": str(visitor.request_id), "security_notes": payload.security_notes},
    )
    db.commit()
    db.refresh(visitor)
    return get_security_visitor(db, visitor.id) or visitor


def deny_visitor_entry(
    db: Session,
    visitor: VisitorAccessRequest,
    payload: SecurityActionRequest,
    actor: User,
) -> VisitorAccessRequest:
    if visitor.visit_status != VisitStatus.PENDING_ARRIVAL.value:
        raise ValueError("Only pending visitors can be denied entry")
    validate_visit_date(visitor)

    visitor.visit_status = VisitStatus.DENIED_ENTRY.value
    visitor.security_notes = payload.security_notes
    record_audit_log(
        db,
        actor=actor,
        action="VISITOR_ENTRY_DENIED",
        entity_type="visitor_access",
        entity_id=visitor.id,
        summary=f"Visitor {visitor.visitor_full_name} denied entry",
        metadata={"request_id": str(visitor.request_id), "security_notes": payload.security_notes},
    )
    db.commit()
    db.refresh(visitor)
    return get_security_visitor(db, visitor.id) or visitor
