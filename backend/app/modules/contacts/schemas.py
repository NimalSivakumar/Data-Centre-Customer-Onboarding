from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field

from app.shared.enums import ContactStatus, ContactType, UserRole


class ContactBase(BaseModel):
    full_name: str = Field(min_length=1, max_length=255)
    email: EmailStr | None = None
    phone: str | None = Field(default=None, max_length=50)
    job_title: str | None = Field(default=None, max_length=100)
    contact_type: ContactType = ContactType.OTHER
    is_primary: bool = False
    status: ContactStatus = ContactStatus.ACTIVE


class ContactCreate(ContactBase):
    email: EmailStr
    phone: str = Field(min_length=1, max_length=50)


class ContactUpdate(BaseModel):
    full_name: str | None = Field(default=None, min_length=1, max_length=255)
    email: EmailStr | None = None
    phone: str | None = Field(default=None, max_length=50)
    job_title: str | None = Field(default=None, max_length=100)
    contact_type: ContactType | None = None
    is_primary: bool | None = None
    status: ContactStatus | None = None
    user_role: UserRole | None = None
    user_status: str | None = None


class ContactResponse(ContactBase):
    id: UUID
    company_id: UUID
    user_id: UUID | None = None
    user_account_status: str = "NO_USER"
    user_role: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
