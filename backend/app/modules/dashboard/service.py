from datetime import date

from sqlalchemy import and_, func, select
from sqlalchemy.orm import Session

from app.modules.companies.models import Company
from app.modules.dashboard.schemas import (
    AdminSummaryResponse,
    CustomerSummaryResponse,
    SecuritySummaryResponse,
)
from app.modules.requests.models import Request
from app.modules.users.models import User
from app.modules.visitor_access.models import VisitorAccessRequest
from app.shared.enums import CompanyStatus, RequestStatus, VisitStatus


def get_admin_summary(db: Session, today: date) -> AdminSummaryResponse:
    total_active_customers = db.scalar(
        select(func.count()).select_from(Company).where(Company.status == CompanyStatus.ACTIVE.value)
    ) or 0
    pending_requests = db.scalar(
        select(func.count()).select_from(Request).where(Request.status == RequestStatus.SUBMITTED.value)
    ) or 0
    approved_visits_today = db.scalar(
        select(func.count())
        .select_from(VisitorAccessRequest)
        .join(Request, Request.id == VisitorAccessRequest.request_id)
        .where(Request.status == RequestStatus.APPROVED.value)
        .where(VisitorAccessRequest.visit_date == today)
    ) or 0
    checked_in_visitors = db.scalar(
        select(func.count())
        .select_from(VisitorAccessRequest)
        .where(VisitorAccessRequest.visit_status == VisitStatus.CHECKED_IN.value)
    ) or 0
    return AdminSummaryResponse(
        total_active_customers=total_active_customers,
        pending_requests=pending_requests,
        approved_visits_today=approved_visits_today,
        checked_in_visitors=checked_in_visitors,
    )


def get_security_summary(db: Session, today: date) -> SecuritySummaryResponse:
    approved_visitors_today = db.scalar(
        select(func.count())
        .select_from(VisitorAccessRequest)
        .join(Request, Request.id == VisitorAccessRequest.request_id)
        .where(Request.status == RequestStatus.APPROVED.value)
        .where(VisitorAccessRequest.visit_date == today)
    ) or 0
    currently_checked_in = db.scalar(
        select(func.count())
        .select_from(VisitorAccessRequest)
        .where(VisitorAccessRequest.visit_status == VisitStatus.CHECKED_IN.value)
    ) or 0
    upcoming_visits = db.scalar(
        select(func.count())
        .select_from(VisitorAccessRequest)
        .join(Request, Request.id == VisitorAccessRequest.request_id)
        .where(Request.status == RequestStatus.APPROVED.value)
        .where(VisitorAccessRequest.visit_date > today)
    ) or 0
    recently_checked_out = db.scalar(
        select(func.count())
        .select_from(VisitorAccessRequest)
        .where(VisitorAccessRequest.visit_status == VisitStatus.CHECKED_OUT.value)
    ) or 0
    return SecuritySummaryResponse(
        approved_visitors_today=approved_visitors_today,
        currently_checked_in=currently_checked_in,
        upcoming_visits=upcoming_visits,
        recently_checked_out=recently_checked_out,
    )


def get_customer_summary(db: Session, current_user: User, today: date) -> CustomerSummaryResponse:
    my_submitted_requests = db.scalar(
        select(func.count())
        .select_from(Request)
        .where(and_(Request.requested_by_id == current_user.id, Request.status == RequestStatus.SUBMITTED.value))
    ) or 0
    approved_upcoming_visits = db.scalar(
        select(func.count())
        .select_from(Request)
        .join(VisitorAccessRequest, VisitorAccessRequest.request_id == Request.id)
        .where(Request.requested_by_id == current_user.id)
        .where(Request.status == RequestStatus.APPROVED.value)
        .where(VisitorAccessRequest.visit_date >= today)
    ) or 0
    rejected_requests = db.scalar(
        select(func.count())
        .select_from(Request)
        .where(and_(Request.requested_by_id == current_user.id, Request.status == RequestStatus.REJECTED.value))
    ) or 0
    return CustomerSummaryResponse(
        my_submitted_requests=my_submitted_requests,
        approved_upcoming_visits=approved_upcoming_visits,
        rejected_requests=rejected_requests,
    )
