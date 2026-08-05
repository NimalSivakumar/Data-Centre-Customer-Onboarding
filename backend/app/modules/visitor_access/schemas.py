from datetime import date, datetime, time
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field, model_validator

from app.shared.enums import VisitStatus


class VisitorCreate(BaseModel):
    visitor_full_name: str = Field(min_length=1, max_length=255)
    visitor_id_number: str = Field(min_length=1, max_length=100)
    visitor_phone: str | None = Field(default=None, max_length=50)
    visitor_email: EmailStr | None = None
    visitor_address: str | None = None
    visitor_company: str | None = Field(default=None, max_length=255)
    vehicle_registration: str | None = Field(default=None, max_length=100)
    equipment_carried: str | None = None
    special_instructions: str | None = None


class VisitorAccessCreate(BaseModel):
    company_id: UUID
    visit_date: date
    expected_arrival_time: time
    expected_departure_time: time
    site_location: str | None = Field(default=None, max_length=255)
    visit_reason: str = Field(min_length=1)
    host_contact_name: str | None = Field(default=None, max_length=255)
    visitors: list[VisitorCreate] = Field(min_length=1)

    @model_validator(mode="after")
    def validate_times(self) -> "VisitorAccessCreate":
        if self.expected_departure_time <= self.expected_arrival_time:
            raise ValueError("expected_departure_time must be after expected_arrival_time")
        return self


class VisitorAccessResponse(BaseModel):
    id: UUID
    request_id: UUID
    visit_date: date
    expected_arrival_time: time
    expected_departure_time: time
    site_location: str | None
    host_contact_name: str | None
    visitor_full_name: str
    visitor_id_number: str
    visitor_phone: str | None
    visitor_email: EmailStr | None
    visitor_address: str | None
    visitor_company: str | None
    vehicle_registration: str | None
    equipment_carried: str | None
    special_instructions: str | None
    visit_status: VisitStatus
    checked_in_at: datetime | None
    checked_in_by_id: UUID | None
    checked_out_at: datetime | None
    checked_out_by_id: UUID | None
    security_notes: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
