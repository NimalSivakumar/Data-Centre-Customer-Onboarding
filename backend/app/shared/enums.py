from enum import StrEnum


class UserRole(StrEnum):
    ADMIN = "ADMIN"
    OPS = "OPS"
    SECURITY = "SECURITY"
    CUSTOMER_ADMIN = "CUSTOMER_ADMIN"
    CUSTOMER_USER = "CUSTOMER_USER"


class CompanyStatus(StrEnum):
    ACTIVE = "ACTIVE"
    PENDING = "PENDING"
    SUSPENDED = "SUSPENDED"
    CLOSED = "CLOSED"


class ContactStatus(StrEnum):
    ACTIVE = "ACTIVE"
    INACTIVE = "INACTIVE"


class ContactType(StrEnum):
    TECHNICAL = "TECHNICAL"
    FINANCE = "FINANCE"
    EMERGENCY = "EMERGENCY"
    MANAGEMENT = "MANAGEMENT"
    OTHER = "OTHER"


class RequestType(StrEnum):
    VISITOR_ACCESS = "VISITOR_ACCESS"


class RequestStatus(StrEnum):
    DRAFT = "DRAFT"
    SUBMITTED = "SUBMITTED"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"
    CANCELLED = "CANCELLED"
    EXPIRED = "EXPIRED"


class VisitStatus(StrEnum):
    PENDING_ARRIVAL = "PENDING_ARRIVAL"
    CHECKED_IN = "CHECKED_IN"
    CHECKED_OUT = "CHECKED_OUT"
    NO_SHOW = "NO_SHOW"
    DENIED_ENTRY = "DENIED_ENTRY"
