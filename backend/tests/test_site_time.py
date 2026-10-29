from contextlib import contextmanager
from datetime import date, datetime, time, timedelta, timezone
from types import SimpleNamespace
from unittest import TestCase
from unittest.mock import MagicMock, patch

from app.modules.dashboard import router as dashboard
from app.modules.requests.service import generate_request_number
from app.modules.security_portal import service as security
from app.modules.session_events import service as sessions
from app.shared import time as site_time


class FrozenDateTime(datetime):
    instant = datetime(2026, 10, 28, 20, tzinfo=timezone.utc)

    @classmethod
    def now(cls, tz=None):
        if tz is None:
            return cls.instant.replace(tzinfo=None)
        return cls.instant.astimezone(tz)


@contextmanager
def frozen_clock(instant, site_timezone="Indian/Mahe"):
    with (
        patch.object(FrozenDateTime, "instant", instant),
        patch.object(site_time.settings, "site_timezone", site_timezone),
        patch.object(site_time, "datetime", FrozenDateTime),
        patch.object(sessions, "datetime", FrozenDateTime),
        patch.object(security, "datetime", FrozenDateTime),
    ):
        yield


class SiteTimeTests(TestCase):
    def test_site_today_handles_midnight_month_and_year_boundaries(self):
        cases = (
            (datetime(2026, 10, 28, 19, 59, 59, tzinfo=timezone.utc), date(2026, 10, 28)),
            (datetime(2026, 10, 28, 20, tzinfo=timezone.utc), date(2026, 10, 29)),
            (datetime(2026, 10, 28, 21, tzinfo=timezone.utc), date(2026, 10, 29)),
            (datetime(2026, 10, 31, 20, tzinfo=timezone.utc), date(2026, 11, 1)),
            (datetime(2026, 12, 31, 20, tzinfo=timezone.utc), date(2027, 1, 1)),
        )
        for instant, expected_date in cases:
            with self.subTest(instant=instant), frozen_clock(instant):
                self.assertEqual(site_time.site_today(), expected_date)

    def test_site_now_is_timezone_aware_and_uses_configured_zone(self):
        instant = datetime(2026, 10, 28, 21, tzinfo=timezone.utc)
        with frozen_clock(instant):
            now = site_time.site_now()
            self.assertEqual(now.date(), date(2026, 10, 29))
            self.assertEqual(now.hour, 1)
            self.assertEqual(now.utcoffset(), timedelta(hours=4))
        with frozen_clock(instant, site_timezone="UTC"):
            self.assertEqual(site_time.site_today(), date(2026, 10, 28))
            self.assertEqual(site_time.site_now().utcoffset(), timedelta(0))

    def test_both_dashboard_endpoints_pass_site_date_to_summary(self):
        instant = datetime(2026, 10, 28, 21, tzinfo=timezone.utc)
        db = MagicMock()
        cases = (
            (dashboard.admin_summary, "get_admin_summary"),
            (dashboard.security_summary, "get_security_summary"),
        )
        for endpoint, helper in cases:
            with self.subTest(endpoint=helper), frozen_clock(instant), patch.object(dashboard, helper) as summary:
                endpoint(db=db, _=object())
                summary.assert_called_once_with(db, date(2026, 10, 29))

    def test_session_timestamp_remains_naive_but_uses_site_time(self):
        instant = datetime(2026, 12, 31, 20, tzinfo=timezone.utc)
        with frozen_clock(instant):
            now = sessions.local_now()
            self.assertEqual(now, datetime(2027, 1, 1))
            self.assertIsNone(now.tzinfo)
        with frozen_clock(instant, site_timezone="UTC"):
            self.assertEqual(sessions.local_now(), datetime(2026, 12, 31, 20))

    def test_request_number_uses_site_date_not_utc_date(self):
        db = MagicMock()
        db.scalar.return_value = 7
        with frozen_clock(datetime(2026, 10, 28, 20, tzinfo=timezone.utc)):
            self.assertEqual(generate_request_number(db), "REQ-20261029-00007")
        self.assertIn("nextval('request_number_seq')", str(db.scalar.call_args.args[0]))

    def test_security_clock_uses_configured_site_zone(self):
        instant = datetime(2026, 10, 28, 21, tzinfo=timezone.utc)
        with frozen_clock(instant):
            self.assertEqual(security.get_site_now().date(), date(2026, 10, 29))
            self.assertEqual(security.get_site_now().utcoffset(), timedelta(hours=4))
        with frozen_clock(instant, site_timezone="UTC"):
            self.assertEqual(security.get_site_now().date(), date(2026, 10, 28))

    def test_check_in_date_validation_changes_at_site_midnight(self):
        visitor = SimpleNamespace(
            visit_date=date(2026, 10, 29),
            expected_arrival_time=time(0), expected_departure_time=time(23, 59),
        )
        with frozen_clock(datetime(2026, 10, 28, 19, 59, 59, tzinfo=timezone.utc)):
            with self.assertRaisesRegex(ValueError, "scheduled visit date"):
                security.validate_check_in_window(visitor)
        with frozen_clock(datetime(2026, 10, 28, 20, tzinfo=timezone.utc)):
            security.validate_check_in_window(visitor)
            security.validate_visit_date(visitor)
        with frozen_clock(datetime(2026, 10, 29, 20, tzinfo=timezone.utc)):
            with self.assertRaisesRegex(ValueError, "scheduled visit date"):
                security.validate_visit_date(visitor)
