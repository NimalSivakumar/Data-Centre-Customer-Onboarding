from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field

from app.shared.enums import CompanyStatus


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
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
