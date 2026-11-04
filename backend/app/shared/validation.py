from typing import Any

from pydantic import ValidationInfo


def normalize_business_string(value: Any, info: ValidationInfo) -> Any:
    """Normalize incoming business strings, not stored response/history values."""
    if isinstance(value, str):
        value = value.strip()
        if not value:
            message = "Host/contact name is required" if info.field_name == "host_contact_name" else f"{info.field_name} must not be blank"
            raise ValueError(message)
    return value
