import uuid
from datetime import datetime

from sqlalchemy import DateTime, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class UserSessionEvent(Base):
    __tablename__ = "user_session_events"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255))
    email: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    login_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), index=True)
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), index=True)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=False), nullable=True, index=True)
    reason: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
