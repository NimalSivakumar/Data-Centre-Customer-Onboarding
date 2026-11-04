from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field, ValidationInfo, field_validator

from app.shared.validation import normalize_business_string
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
    normalize_strings = field_validator("name", "customer_code", "main_phone", mode="before")(normalize_business_string)

    customer_code: str = Field(min_length=1, max_length=100)
    main_email: EmailStr
    main_phone: str = Field(min_length=1, max_length=50)


class CompanyUpdate(BaseModel):
    normalize_strings = field_validator("name", "customer_code", "main_phone", mode="before")(normalize_business_string)

    name: str | None = Field(default=None, min_length=1, max_length=255)
    customer_code: str | None = Field(default=None, max_length=100)
    registration_number: str | None = Field(default=None, max_length=100)
    address: str | None = None
    main_email: EmailStr | None = None
    main_phone: str | None = Field(default=None, max_length=50)
    status: CompanyStatus | None = None
    notes: str | None = None

    @field_validator("name", "status", mode="before")
    @classmethod
    def reject_required_null(cls, value, info: ValidationInfo):
        if value is None:
            raise ValueError(f"{info.field_name} must not be null")
        return value


class CompanyResponse(CompanyBase):
    id: UUID
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
