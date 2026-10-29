from datetime import datetime, timedelta, timezone
from threading import Event, Thread
from uuid import UUID
from zoneinfo import ZoneInfo

import logging

from sqlalchemy import and_, or_, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.dependencies import InternalPrincipal
from app.db.session import SessionLocal
from app.modules.session_events.models import UserSessionEvent

EXPLICIT_LOGOUT_REASON = "USER_SIGNED_OUT"
INACTIVITY_TIMEOUT_REASON = "SESSION_TIMED_OUT"
SESSION_TIMEOUT = timedelta(minutes=15)
SESSION_WARNING_SECONDS = 120
TIMEOUT_SWEEP_INTERVAL_SECONDS = 60

_timeout_worker_stop = Event()
_timeout_worker_started = False
logger = logging.getLogger(__name__)


def local_now() -> datetime:
    return datetime.now(ZoneInfo(settings.site_timezone)).replace(tzinfo=None)


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def mark_session_timed_out(session: UserSessionEvent, *, now: datetime) -> None:
    session.ended_at = now.astimezone(ZoneInfo(settings.site_timezone)).replace(tzinfo=None)
    session.reason = INACTIVITY_TIMEOUT_REASON


def expire_inactive_sessions(db: Session, *, now: datetime | None = None) -> int:
    current_time = now or utc_now()
    if current_time.tzinfo is None:
        current_time = current_time.replace(tzinfo=ZoneInfo(settings.site_timezone))
    cutoff = current_time - SESSION_TIMEOUT
    legacy_cutoff = cutoff.astimezone(ZoneInfo(settings.site_timezone)).replace(tzinfo=None)
    sessions = db.scalars(
        select(UserSessionEvent)
        .where(UserSessionEvent.ended_at.is_(None))
        .where(or_(
            UserSessionEvent.last_activity_at <= cutoff,
            and_(UserSessionEvent.last_activity_at.is_(None), UserSessionEvent.last_seen_at <= legacy_cutoff),
        ))
        .order_by(UserSessionEvent.id)
        .with_for_update(skip_locked=True)
        .execution_options(populate_existing=True)
    ).all()
    for session in sessions:
        mark_session_timed_out(session, now=current_time)
    db.commit()
    return len(sessions)


def start_user_session(db: Session, *, actor: InternalPrincipal) -> UserSessionEvent:
    expire_inactive_sessions(db)
    current_time = local_now()
    session = UserSessionEvent(
        name=actor.full_name,
        email=actor.email,
        actor_subject=actor.subject,
        last_activity_at=utc_now(),
        login_at=current_time,
        last_seen_at=current_time,
    )
    db.add(session)
    db.flush()
    db.commit()
    db.refresh(session)
    return session


def get_actor_session(db: Session, *, actor: InternalPrincipal, session_id: UUID) -> UserSessionEvent | None:
    return db.scalars(
        select(UserSessionEvent).where(
            UserSessionEvent.id == session_id,
            UserSessionEvent.actor_subject == actor.subject,
        )
        .with_for_update()
        .execution_options(populate_existing=True)
    ).first()


def require_active_session(db: Session, *, actor: InternalPrincipal, session_id: UUID) -> UserSessionEvent:
    session = get_actor_session(db, actor=actor, session_id=session_id)
    if not session or session.ended_at is not None or session.last_activity_at is None:
        raise PermissionError("Application session expired; sign in again")
    now = utc_now()
    if now >= session.last_activity_at + SESSION_TIMEOUT:
        mark_session_timed_out(session, now=now)
        db.commit()
        raise PermissionError("Application session expired; sign in again")
    return session


def record_user_activity(db: Session, *, actor: InternalPrincipal, session_id: UUID) -> UserSessionEvent:
    session = require_active_session(db, actor=actor, session_id=session_id)
    session.last_activity_at = utc_now()
    session.last_seen_at = local_now()
    db.commit()
    db.refresh(session)
    return session


def heartbeat_user_session(
    db: Session,
    *,
    actor: InternalPrincipal,
    session_id: UUID,
) -> UserSessionEvent | None:
    try:
        session = require_active_session(db, actor=actor, session_id=session_id)
    except PermissionError:
        return None
    # A heartbeat records connectivity, never user activity.
    session.last_seen_at = local_now()
    db.commit()
    db.refresh(session)
    return session


def end_user_session(
    db: Session,
    *,
    actor: InternalPrincipal,
    session_id: UUID,
    end_reason: str = EXPLICIT_LOGOUT_REASON,
) -> UserSessionEvent | None:
    expire_inactive_sessions(db)
    session = get_actor_session(db, actor=actor, session_id=session_id)
    if not session:
        return None
    if session.ended_at is None:
        current_time = local_now()
        session.last_seen_at = current_time
        session.ended_at = current_time
        session.reason = end_reason
        db.commit()
        db.refresh(session)
    return session


def start_session_timeout_worker() -> None:
    global _timeout_worker_started
    if _timeout_worker_started:
        return
    _timeout_worker_started = True

    def run() -> None:
        while not _timeout_worker_stop.wait(TIMEOUT_SWEEP_INTERVAL_SECONDS):
            db = SessionLocal()
            try:
                expire_inactive_sessions(db)
            except Exception:
                db.rollback()
                logger.error("Session timeout sweep failed; rolled back and will retry")
            finally:
                db.close()

    Thread(target=run, name="session-timeout-worker", daemon=True).start()


def stop_session_timeout_worker() -> None:
    _timeout_worker_stop.set()
