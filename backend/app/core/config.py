from functools import cached_property
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "DC Onboarding MVP"
    app_env: str = "development"
    database_url: str
    cors_origins: str = "http://localhost:5173,http://localhost:3000"
    entra_tenant_id: str
    entra_client_id: str
    entra_audience: str | None = None
    entra_required_scope: str = "access_as_user"
    entra_allowed_client_ids: str = ""
    entra_token_version: str | None = "2.0"
    site_timezone: str = "Indian/Mahe"
    site_location: str = Field(default="Cable & Wireless, Victoria", min_length=1, max_length=255)

    @field_validator("site_timezone")
    @classmethod
    def validate_site_timezone(cls, value: str) -> str:
        try:
            ZoneInfo(value)
        except (ZoneInfoNotFoundError, ValueError) as exc:
            raise ValueError("site_timezone must be a valid IANA timezone") from exc
        return value

    @field_validator("site_location")
    @classmethod
    def validate_site_location(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("site_location must not be blank")
        return value.strip()

    @property
    def entra_issuer(self) -> str:
        return f"https://login.microsoftonline.com/{self.entra_tenant_id}/v2.0"

    @property
    def entra_allowed_issuers(self) -> set[str]:
        return {
            self.entra_issuer,
            f"https://sts.windows.net/{self.entra_tenant_id}/",
        }

    @property
    def entra_jwks_url(self) -> str:
        return f"https://login.microsoftonline.com/{self.entra_tenant_id}/discovery/v2.0/keys"

    @property
    def entra_expected_audience(self) -> str:
        return self.entra_audience or self.entra_client_id

    @property
    def entra_allowed_client_ids_set(self) -> set[str]:
        return {client_id.strip() for client_id in self.entra_allowed_client_ids.split(",") if client_id.strip()}

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    @cached_property
    def cors_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


settings = Settings()
