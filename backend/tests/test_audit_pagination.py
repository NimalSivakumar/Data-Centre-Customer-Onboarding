from datetime import date, datetime, timedelta, timezone
from unittest import TestCase
from unittest.mock import MagicMock, patch
from uuid import uuid4

from fastapi import HTTPException
from sqlalchemy.dialects import postgresql

from app.modules.audit.router import get_audit_logs
from app.modules.audit.service import list_audit_logs


class AuditPaginationTests(TestCase):
    def setUp(self):
        self.db = MagicMock()
        self.db.scalar.return_value = 125
        self.db.scalars.return_value.all.return_value = []

    def queries(self):
        return (
            self.db.scalar.call_args.args[0].compile(dialect=postgresql.dialect()),
            self.db.scalars.call_args.args[0].compile(dialect=postgresql.dialect()),
        )

    def test_second_page_has_stable_timestamp_and_id_order(self):
        _, total = list_audit_logs(self.db, page=2, page_size=50)
        self.assertEqual(total, 125)
        _, query = self.queries()
        self.assertEqual(str(query).split("ORDER BY ")[1].split(" LIMIT")[0].strip(), "audit_logs.created_at DESC, audit_logs.id DESC")
        self.assertEqual(query.params["param_1"], 50)
        self.assertEqual(query.params["param_2"], 50)
        self.db.commit.assert_not_called()

    def test_day_filters_are_site_midnight_to_exclusive_next_midnight(self):
        with patch("app.modules.audit.service.settings.site_timezone", "Indian/Mahe"):
            list_audit_logs(self.db, from_day=date(2026, 10, 29), to_day=date(2026, 10, 29))
        for query in self.queries():
            bounds = [value for value in query.params.values() if isinstance(value, datetime)]
            self.assertEqual(len(bounds), 2)
            self.assertEqual(bounds[0].astimezone(timezone.utc), datetime(2026, 10, 28, 20, tzinfo=timezone.utc))
            self.assertEqual(bounds[1].astimezone(timezone.utc), datetime(2026, 10, 29, 20, tzinfo=timezone.utc))
            self.assertEqual(bounds[1].utcoffset(), timedelta(hours=4))
            self.assertIn("audit_logs.created_at < ", str(query))

    def test_day_filter_uses_configured_timezone_and_handles_year_rollover(self):
        with patch("app.modules.audit.service.settings.site_timezone", "UTC"):
            list_audit_logs(self.db, to_day=date(2026, 12, 31))
        _, query = self.queries()
        self.assertIn(datetime(2027, 1, 1, tzinfo=timezone.utc), query.params.values())

    def test_cursor_uses_timestamp_and_id_without_restricting_total(self):
        timestamp = datetime(2026, 10, 29, 12, tzinfo=timezone.utc)
        cursor_id = uuid4()
        list_audit_logs(self.db, before_created_at=timestamp, before_id=cursor_id)
        count_query, query = self.queries()
        self.assertIn(timestamp, query.params.values())
        self.assertIn(cursor_id, query.params.values())
        self.assertIn("audit_logs.id < ", str(query))
        self.assertIn(" OR ", str(query))
        self.assertNotIn(timestamp, count_query.params.values())

    def test_invalid_range_or_incomplete_cursor_is_rejected_before_query(self):
        cases = (
            {"from_day": date(2026, 10, 30), "to_day": date(2026, 10, 29)},
            {"before_id": uuid4()},
            {"before_created_at": datetime(2026, 10, 29, tzinfo=timezone.utc)},
            {"before_created_at": datetime(2026, 10, 29), "before_id": uuid4()},
            {"to_day": date.max},
        )
        for kwargs in cases:
            with self.subTest(kwargs=kwargs), self.assertRaises(ValueError):
                list_audit_logs(self.db, **kwargs)
        self.db.scalar.assert_not_called()
        self.db.scalars.assert_not_called()

    def test_route_maps_invalid_range_to_readable_400(self):
        with self.assertRaises(HTTPException) as caught:
            get_audit_logs(
                db=self.db, _=object(), page=1, page_size=50,
                from_day=date(2026, 10, 30), to_day=date(2026, 10, 29),
            )
        self.assertEqual(caught.exception.status_code, 400)
        self.assertEqual(caught.exception.detail, "From date must be on or before the to date")

    def test_legacy_timestamp_filters_are_preserved(self):
        start = datetime(2026, 10, 28, tzinfo=timezone.utc)
        end = datetime(2026, 10, 29, tzinfo=timezone.utc)
        list_audit_logs(self.db, from_date=start, to_date=end)
        for query in self.queries():
            self.assertIn(start, query.params.values())
            self.assertIn(end, query.params.values())
            self.assertIn("audit_logs.created_at <= ", str(query))

    def test_session_exclusion_applies_to_both_records_and_total_before_pagination(self):
        list_audit_logs(self.db, exclude_session_events=True, page=2)
        for query in self.queries():
            self.assertIn("audit_logs.entity_type !=", str(query))
            self.assertIn("user_session", query.params.values())

    def test_default_queries_keep_session_events_for_full_exports(self):
        list_audit_logs(self.db)
        for query in self.queries():
            self.assertNotIn("audit_logs.entity_type !=", str(query))
            self.assertNotIn("user_session", query.params.values())

    def test_route_passes_session_exclusion_to_service(self):
        with patch("app.modules.audit.router.list_audit_logs", return_value=([], 0)) as load:
            response = get_audit_logs(db=self.db, _=object(), page=1, page_size=50, exclude_session_events=True)
        self.assertTrue(load.call_args.kwargs["exclude_session_events"])
        self.assertEqual(response["total"], 0)
