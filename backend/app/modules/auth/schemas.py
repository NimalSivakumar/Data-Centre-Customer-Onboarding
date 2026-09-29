from pydantic import BaseModel, EmailStr


class UserResponse(BaseModel):
    provider: str
    subject: str
    email: EmailStr | None
    full_name: str
    roles: list[str]
