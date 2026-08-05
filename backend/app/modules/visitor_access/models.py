import uuid
from datetime import date, datetime, time

from sqlalchemy import Date, DateTime, ForeignKey, String, Text, Time, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.shared.enums import VisitStatus


class VisitorAccessRequest(Base):
    __tablename__ = "visitor_access_requests"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    request_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("requests.id", ondelete="CASCADE"), index=True
    )
    visit_date: Mapped[date] = mapped_column(Date)
    expected_arrival_time: Mapped[time] = mapped_column(Time)
    expected_departure_time: Mapped[time] = mapped_column(Time)
    site_location: Mapped[str | None] = mapped_column(String(255), nullable=True)
    host_contact_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    visitor_full_name: Mapped[str] = mapped_column(String(255))
    visitor_id_number: Mapped[str] = mapped_column(String(100))
    visitor_phone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    visitor_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    visitor_address: Mapped[str | None] = mapped_column(Text, nullable=True)
    visitor_company: Mapped[str | None] = mapped_column(String(255), nullable=True)
    vehicle_registration: Mapped[str | None] = mapped_column(String(100), nullable=True)
    equipment_carried: Mapped[str | None] = mapped_column(Text, nullable=True)
    special_instructions: Mapped[str | None] = mapped_column(Text, nullable=True)
    visit_status: Mapped[str] = mapped_column(String(50), default=VisitStatus.PENDING_ARRIVAL.value)
    checked_in_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    checked_in_by_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    checked_out_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    checked_out_by_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    security_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    request: Mapped["Request"] = relationship(back_populates="visitor_accesses")
