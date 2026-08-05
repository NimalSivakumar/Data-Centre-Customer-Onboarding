from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field, model_validator

from app.shared.enums import CompanyStatus, ContactType, UserRole


class CompanyBase(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    customer_code: str | None = Field(default=None, max_length=100)
    registration_number: str | None = Field(default=None, max_length=100)
    address: str | None = None
    main_email: EmailStr | None = None
    main_phone: str | None = Field(default=None, max_length=50)
    status: CompanyStatus = CompanyStatus.ACTIVE
    notes: str | None = None


class CompanyCreate(CompanyBase):
    customer_code: str = Field(min_length=1, max_length=100)
    main_email: EmailStr
    main_phone: str = Field(min_length=1, max_length=50)


class CompanyUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    customer_code: str | None = Field(default=None, max_length=100)
    registration_number: str | None = Field(default=None, max_length=100)
    address: str | None = None
    main_email: EmailStr | None = None
    main_phone: str | None = Field(default=None, max_length=50)
    status: CompanyStatus | None = None
    notes: str | None = None


class CompanyResponse(CompanyBase):
    id: UUID
    created_by_id: UUID | None
    updated_by_id: UUID | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class CompanyUserCreate(BaseModel):
    contact_id: UUID | None = None
    full_name: str | None = Field(default=None, min_length=1, max_length=255)
    email: EmailStr | None = None
    phone: str | None = Field(default=None, max_length=50)
    job_title: str | None = Field(default=None, max_length=100)
    contact_type: ContactType = ContactType.OTHER
    role: UserRole = UserRole.CUSTOMER_USER
    is_primary: bool = False
    status: str = "ACTIVE"

    @model_validator(mode="after")
    def validate_user_source(self) -> "CompanyUserCreate":
        if self.contact_id:
            return self
        if not self.full_name or not self.email:
            raise ValueError("Full name and email are required when creating a new customer user")
        return self


class CompanyUserResponse(BaseModel):
    id: UUID
    company_id: UUID
    user_id: UUID
    contact_id: UUID | None = None
    email: EmailStr
    full_name: str
    role: str | None = None
    status: str
    temporary_password: str | None = None
    created_at: datetime
