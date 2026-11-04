from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field, ValidationInfo, field_validator

from app.shared.validation import normalize_business_string
from app.shared.enums import ContactStatus, ContactType


class ContactBase(BaseModel):
    full_name: str = Field(min_length=1, max_length=255)
    email: EmailStr | None = None
    phone: str | None = Field(default=None, max_length=50)
    job_title: str | None = Field(default=None, max_length=100)
    contact_type: ContactType = ContactType.OTHER
    is_primary: bool = False
    status: ContactStatus = ContactStatus.ACTIVE


class ContactCreate(ContactBase):
    normalize_strings = field_validator("full_name", "phone", mode="before")(normalize_business_string)

    email: EmailStr
    phone: str = Field(min_length=1, max_length=50)


class ContactUpdate(BaseModel):
    normalize_strings = field_validator("full_name", "phone", mode="before")(normalize_business_string)

    full_name: str | None = Field(default=None, min_length=1, max_length=255)
    email: EmailStr | None = None
    phone: str | None = Field(default=None, max_length=50)
    job_title: str | None = Field(default=None, max_length=100)
    contact_type: ContactType | None = None
    is_primary: bool | None = None
    status: ContactStatus | None = None

    @field_validator("full_name", "contact_type", "is_primary", "status", mode="before")
    @classmethod
    def reject_required_null(cls, value, info: ValidationInfo):
        if value is None:
            raise ValueError(f"{info.field_name} must not be null")
        return value


class ContactResponse(ContactBase):
    id: UUID
    company_id: UUID
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
