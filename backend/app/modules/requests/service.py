from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import Select, func, or_, select, text
from sqlalchemy.orm import Session, selectinload

from app.core.dependencies import InternalPrincipal
from app.core.config import settings
from app.modules.audit.service import record_audit_log
from app.modules.companies.service import get_company
from app.modules.contacts.models import Contact
from app.modules.requests.models import Request
from app.modules.requests.schemas import ReviewRequest
from app.modules.visitor_access.models import VisitorAccessRequest
from app.modules.visitor_access.schemas import VisitorAccessCreate
from app.shared.enums import CompanyStatus, RequestStatus, RequestType, UserRole, VisitStatus
from app.shared.search import contains_pattern
from app.shared.time import site_today

def generate_request_number(db: Session) -> str:
    sequence_value = db.scalar(text("SELECT nextval('request_number_seq')"))
    return f"REQ-{site_today():%Y%m%d}-{sequence_value:05d}"


def get_request(db: Session, request_id: UUID) -> Request | None:
    return db.scalar(
        select(Request)
        .options(selectinload(Request.visitor_accesses))
        .where(Request.id == request_id)
    )


def get_request_for_update(db: Session, request_id: UUID) -> Request | None:
    # All workflow writers lock the parent before any visitor rows.
    return db.scalar(
        select(Request)
        .options(selectinload(Request.visitor_accesses))
        .where(Request.id == request_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )


def list_requests(
    db: Session,
    q: str | None = None,
    status: str | None = None,
    request_type: str | None = None,
    company_id: UUID | None = None,
    page: int = 1,
    page_size: int = 20,
) -> tuple[list[Request], int]:
    stmt: Select[tuple[Request]] = select(Request).outerjoin(VisitorAccessRequest).options(selectinload(Request.visitor_accesses)).distinct()
    count_stmt = select(func.count(func.distinct(Request.id))).select_from(Request).outerjoin(VisitorAccessRequest)
    filters = []

    if q:
        pattern = contains_pattern(q)
        filters.append(
            or_(
                Request.request_number.ilike(pattern, escape="\\"),
                Request.title.ilike(pattern, escape="\\"),
                VisitorAccessRequest.visitor_full_name.ilike(pattern, escape="\\"),
                VisitorAccessRequest.visitor_id_number.ilike(pattern, escape="\\"),
                VisitorAccessRequest.visitor_phone.ilike(pattern, escape="\\"),
            )
        )
    if status:
        filters.append(Request.status == status)
    if request_type:
        filters.append(Request.request_type == request_type)
    if company_id:
        filters.append(Request.company_id == company_id)
    for condition in filters:
        stmt = stmt.where(condition)
        count_stmt = count_stmt.where(condition)

    total = db.scalar(count_stmt) or 0
    requests = db.scalars(
        stmt.order_by(Request.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    ).unique().all()
    return list(requests), total


def create_visitor_access_request(
    db: Session,
    payload: VisitorAccessCreate,
    actor: InternalPrincipal,
) -> Request:
    company = get_company(db, payload.company_id)
    if not company:
        raise ValueError("Company not found")
    if company.status != CompanyStatus.ACTIVE.value:
        raise ValueError("Company must be active to create visitor requests")
    if payload.visit_date < site_today():
        raise ValueError("Visit date cannot be in the past")
    roles = {role.name for role in actor.roles}
    if not roles.intersection({"ADMIN", "OPS"}):
        raise PermissionError("Only ADMIN and OPS can create visitor requests")
    host_contact_name = payload.host_contact_name.strip() if payload.host_contact_name else ""
    if not host_contact_name:
        raise ValueError("Host/contact name is required")
    host_contact_exists = db.scalar(
        select(func.count())
        .select_from(Contact)
        .where(Contact.company_id == payload.company_id)
        .where(Contact.status == "ACTIVE")
        .where(Contact.full_name == host_contact_name)
    )
    if not host_contact_exists:
        raise ValueError("Host/contact name must be an active contact for the selected company")

    first_visitor = payload.visitors[0]
    visitor_count = len(payload.visitors)
    request = Request(
        request_number=generate_request_number(db),
        company_id=payload.company_id,
        request_type=RequestType.VISITOR_ACCESS.value,
        title=f"Visitor access for {first_visitor.visitor_full_name}" if visitor_count == 1 else f"Visitor access for {visitor_count} visitors",
        description=payload.visit_reason,
        status=RequestStatus.SUBMITTED.value,
        submitted_at=datetime.now(timezone.utc),
    )
    db.add(request)
    db.flush()

    for visitor in payload.visitors:
        visitor_access = VisitorAccessRequest(
            request_id=request.id,
            visit_date=payload.visit_date,
            expected_arrival_time=payload.expected_arrival_time,
            expected_departure_time=payload.expected_departure_time,
            site_location=settings.site_location,
            host_contact_name=host_contact_name,
            visitor_full_name=visitor.visitor_full_name,
            visitor_id_number=visitor.visitor_id_number,
            visitor_phone=visitor.visitor_phone,
            visitor_email=str(visitor.visitor_email) if visitor.visitor_email else None,
            visitor_address=visitor.visitor_address,
            visitor_company=visitor.visitor_company,
            vehicle_registration=visitor.vehicle_registration,
            equipment_carried=visitor.equipment_carried,
            special_instructions=visitor.special_instructions,
            visit_status=VisitStatus.PENDING_ARRIVAL.value,
        )
        db.add(visitor_access)
    record_audit_log(
        db,
        actor=actor,
        action="REQUEST_SUBMITTED",
        entity_type="request",
        entity_id=request.id,
        summary=f"Visitor access request {request.request_number} submitted for {visitor_count} visitor{'s' if visitor_count != 1 else ''}",
        metadata={
            "visitor_count": visitor_count,
            "visitor_full_names": [visitor.visitor_full_name for visitor in payload.visitors],
            "company_id": str(payload.company_id),
        },
    )
    db.commit()
    return get_request(db, request.id) or request


def approve_request(db: Session, request: Request, payload: ReviewRequest, actor: InternalPrincipal) -> Request:
    if UserRole.ADMIN.value not in {role.name for role in actor.roles}:
        raise PermissionError("Only ADMIN users can approve requests")
    if request.status != RequestStatus.SUBMITTED.value:
        raise ValueError("Only submitted requests can be approved")
    request.status = RequestStatus.APPROVED.value
    request.reviewed_at = datetime.now(timezone.utc)
    request.review_notes = payload.review_notes
    record_audit_log(
        db,
        actor=actor,
        action="REQUEST_APPROVED",
        entity_type="request",
        entity_id=request.id,
        summary=f"Request {request.request_number} approved",
        metadata={"review_notes": payload.review_notes},
    )
    db.commit()
    return get_request(db, request.id) or request


def reject_request(db: Session, request: Request, payload: ReviewRequest, actor: InternalPrincipal) -> Request:
    if request.status != RequestStatus.SUBMITTED.value:
        raise ValueError("Only submitted requests can be rejected")
    request.status = RequestStatus.REJECTED.value
    request.reviewed_at = datetime.now(timezone.utc)
    request.review_notes = payload.review_notes
    record_audit_log(
        db,
        actor=actor,
        action="REQUEST_REJECTED",
        entity_type="request",
        entity_id=request.id,
        summary=f"Request {request.request_number} rejected",
        metadata={"review_notes": payload.review_notes},
    )
    db.commit()
    return get_request(db, request.id) or request


def cancel_request(db: Session, request: Request, actor: InternalPrincipal) -> Request:
    if request.status not in {RequestStatus.SUBMITTED.value, RequestStatus.APPROVED.value}:
        raise ValueError("Only submitted or approved requests can be cancelled")
    request.status = RequestStatus.CANCELLED.value
    record_audit_log(
        db,
        actor=actor,
        action="REQUEST_CANCELLED",
        entity_type="request",
        entity_id=request.id,
        summary=f"Request {request.request_number} cancelled",
    )
    db.commit()
    return get_request(db, request.id) or request
