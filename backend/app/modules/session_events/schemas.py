from uuid import UUID
from typing import Literal

from pydantic import BaseModel


class UserSessionStartResponse(BaseModel):
    session_id: UUID
    idle_remaining_seconds: float
    idle_timeout_seconds: int = 900
    idle_warning_seconds: int = 120


class UserSessionEndResponse(BaseModel):
    session_id: UUID


class UserSessionEndRequest(BaseModel):
    reason: Literal["USER_SIGNED_OUT", "SESSION_TIMED_OUT"] = "USER_SIGNED_OUT"
