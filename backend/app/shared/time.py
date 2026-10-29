from datetime import date, datetime
from zoneinfo import ZoneInfo

from app.core.config import settings


def site_now() -> datetime:
    return datetime.now(ZoneInfo(settings.site_timezone))


def site_today() -> date:
    return site_now().date()
