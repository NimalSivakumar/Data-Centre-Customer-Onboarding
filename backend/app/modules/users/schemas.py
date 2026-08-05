from uuid import UUID

from pydantic import BaseModel, EmailStr, Field


class InternalUserCreate(BaseModel):
    email: EmailStr
    full_name: str = Field(min_length=1, max_length=255)
    role: str
    status: str = "ACTIVE"


class InternalUserUpdate(BaseModel):
    full_name: str | None = Field(default=None, min_length=1, max_length=255)
    role: str | None = None
    status: str | None = None


class InternalUserResponse(BaseModel):
    id: UUID
    email: EmailStr
    full_name: str
    role: str
    status: str
    temporary_password: str | None = None
