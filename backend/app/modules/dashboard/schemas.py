from pydantic import BaseModel


class AdminSummaryResponse(BaseModel):
    total_active_customers: int
    pending_requests: int
    approved_visits_today: int
    checked_in_visitors: int


class SecuritySummaryResponse(BaseModel):
    approved_visitors_today: int
    currently_checked_in: int
    upcoming_visits: int
    recently_checked_out: int


class CustomerSummaryResponse(BaseModel):
    my_submitted_requests: int
    approved_upcoming_visits: int
    rejected_requests: int
