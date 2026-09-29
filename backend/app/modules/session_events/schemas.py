from uuid import UUID

from pydantic import BaseModel


class UserSessionStartResponse(BaseModel):
    session_id: UUID


class UserSessionEndResponse(BaseModel):
    session_id: UUID
