import logging
from threading import Event, Thread

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.modules.audit.service import record_audit_log
from app.modules.requests.models import Request
from app.modules.visitor_access.models import VisitorAccessRequest
from app.shared.enums import RequestStatus, VisitStatus
from app.shared.time import site_today

logger = logging.getLogger(__name__)
SWEEP_INTERVAL_SECONDS = 60
FINAL_VISIT_STATUSES = {
    VisitStatus.CHECKED_OUT.value,
    VisitStatus.DENIED_ENTRY.value,
    VisitStatus.NO_SHOW.value,
}
_stop = Event()
_worker: Thread | None = None


def expire_past_visits(db: Session) -> None:
    today = site_today()
    requests = db.scalars(
        select(Request)
        .where(Request.status == RequestStatus.APPROVED.value)
        .where(Request.visitor_accesses.any(VisitorAccessRequest.visit_date < today))
        .order_by(Request.id)
        .with_for_update(skip_locked=True)
        .execution_options(populate_existing=True)
    ).all()
    for request in requests:
        visitors = db.scalars(
            select(VisitorAccessRequest)
            .where(VisitorAccessRequest.request_id == request.id)
            .order_by(VisitorAccessRequest.id)
            .with_for_update()
            .execution_options(populate_existing=True)
        ).all()
        for visitor in visitors:
            if visitor.visit_date < today and visitor.visit_status == VisitStatus.PENDING_ARRIVAL.value:
                visitor.visit_status = VisitStatus.NO_SHOW.value
                record_audit_log(
                    db,
                    actor=None,
                    action="VISITOR_NO_SHOW",
                    entity_type="visitor_access",
                    entity_id=visitor.id,
                    summary=f"Visitor {visitor.visitor_full_name} marked as no-show after the visit date passed",
                    metadata={
                        "source": "automatic_visit_expiry",
                        "request_id": str(request.id),
                        "visit_date": visitor.visit_date.isoformat(),
                        "changes": {"visit_status": {"from": VisitStatus.PENDING_ARRIVAL.value, "to": VisitStatus.NO_SHOW.value}},
                    },
                )
        if visitors and all(
            visitor.visit_date < today and visitor.visit_status in FINAL_VISIT_STATUSES
            for visitor in visitors
        ):
            request.status = RequestStatus.EXPIRED.value
            record_audit_log(
                db,
                actor=None,
                action="REQUEST_EXPIRED",
                entity_type="request",
                entity_id=request.id,
                summary=f"Request {request.request_number} expired after all visits finished",
                metadata={
                    "source": "automatic_visit_expiry",
                    "changes": {"status": {"from": RequestStatus.APPROVED.value, "to": RequestStatus.EXPIRED.value}},
                },
            )
    db.commit()


def start_visit_expiry_worker() -> None:
    global _worker
    if _worker is not None and _worker.is_alive():
        return
    _stop.clear()

    def run() -> None:
        while not _stop.is_set():
            with SessionLocal() as db:
                try:
                    expire_past_visits(db)
                except Exception:
                    db.rollback()
                    # Do not log exception details: database errors may contain visitor data.
                    logger.error("Automatic visit expiry failed; rolled back and will retry")
            if _stop.wait(SWEEP_INTERVAL_SECONDS):
                break

    _worker = Thread(target=run, name="visit-expiry-worker", daemon=True)
    _worker.start()


def stop_visit_expiry_worker() -> None:
    _stop.set()
    if _worker is not None:
        _worker.join(timeout=5)
