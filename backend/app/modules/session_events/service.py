from datetime import datetime, timedelta
from threading import Event, Thread
from uuid import UUID
from zoneinfo import ZoneInfo

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.core.dependencies import InternalPrincipal
from app.db.session import SessionLocal
from app.modules.session_events.models import UserSessionEvent

EXPLICIT_LOGOUT_REASON = "USER_SIGNED_OUT"
INACTIVITY_TIMEOUT_REASON = "SESSION_TIMED_OUT"
SESSION_TIMEOUT = timedelta(minutes=5)
TIMEOUT_SWEEP_INTERVAL_SECONDS = 60
SITE_TIMEZONE = ZoneInfo("Indian/Mahe")

_timeout_worker_stop = Event()
_timeout_worker_started = False


def local_now() -> datetime:
    return datetime.now(SITE_TIMEZONE).replace(tzinfo=None)


def expire_inactive_sessions(db: Session, *, now: datetime | None = None) -> int:
    current_time = now or local_now()
    cutoff = current_time - SESSION_TIMEOUT
    result = db.execute(
        update(UserSessionEvent)
        .where(UserSessionEvent.ended_at.is_(None), UserSessionEvent.last_seen_at < cutoff)
        .values(
            ended_at=UserSessionEvent.last_seen_at,
            reason=INACTIVITY_TIMEOUT_REASON,
        )
    )
    db.commit()
    return result.rowcount or 0


def start_user_session(db: Session, *, actor: InternalPrincipal) -> UserSessionEvent:
    expire_inactive_sessions(db)
    current_time = local_now()
    session = UserSessionEvent(
        name=actor.full_name,
        email=actor.email,
        login_at=current_time,
        last_seen_at=current_time,
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return session


def get_actor_session(db: Session, *, actor: InternalPrincipal, session_id: UUID) -> UserSessionEvent | None:
    return db.scalars(
        select(UserSessionEvent).where(
            UserSessionEvent.id == session_id,
            UserSessionEvent.email == actor.email,
        )
    ).first()


def heartbeat_user_session(
    db: Session,
    *,
    actor: InternalPrincipal,
    session_id: UUID,
) -> UserSessionEvent | None:
    expire_inactive_sessions(db)
    session = get_actor_session(db, actor=actor, session_id=session_id)
    if not session or session.ended_at is not None:
        return None
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
            finally:
                db.close()

    Thread(target=run, name="session-timeout-worker", daemon=True).start()


def stop_session_timeout_worker() -> None:
    _timeout_worker_stop.set()
