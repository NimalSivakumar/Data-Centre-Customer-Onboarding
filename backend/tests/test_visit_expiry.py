from datetime import date
from types import SimpleNamespace
from unittest import TestCase
from unittest.mock import MagicMock, patch
from uuid import uuid4

from sqlalchemy.dialects import postgresql

from app.modules.companies.models import Company  # noqa: F401
from app.modules.contacts.models import Contact  # noqa: F401
from app.modules.requests.expiry import expire_past_visits


class VisitExpiryTests(TestCase):
    today = date(2026, 10, 15)
    yesterday = date(2026, 10, 14)

    def visitor(self, status, visit_date=None):
        return SimpleNamespace(
            id=uuid4(), visitor_full_name="Test visitor",
            visit_date=visit_date or self.yesterday, visit_status=status,
        )

    def run_sweep(self, visitors):
        request = SimpleNamespace(id=uuid4(), request_number="REQ-TEST", status="APPROVED")
        db = MagicMock()
        db.scalars.side_effect = [
            SimpleNamespace(all=lambda: [request]),
            SimpleNamespace(all=lambda: visitors),
        ]
        with patch("app.modules.requests.expiry.site_today", return_value=self.today), patch(
            "app.modules.requests.expiry.record_audit_log"
        ) as audit:
            expire_past_visits(db)
        db.commit.assert_called_once()
        return request, db, audit

    def test_past_pending_visitor_becomes_no_show_and_request_expires(self):
        visitor = self.visitor("PENDING_ARRIVAL")
        request, _, audit = self.run_sweep([visitor])
        self.assertEqual(visitor.visit_status, "NO_SHOW")
        self.assertEqual(request.status, "EXPIRED")
        self.assertEqual([call.kwargs["action"] for call in audit.call_args_list], [
            "VISITOR_NO_SHOW", "REQUEST_EXPIRED",
        ])
        self.assertTrue(all(call.kwargs["actor"] is None for call in audit.call_args_list))

    def test_all_past_final_visitors_expire_request(self):
        visitors = [self.visitor(status) for status in ("CHECKED_OUT", "DENIED_ENTRY", "NO_SHOW")]
        request, _, audit = self.run_sweep(visitors)
        self.assertEqual(request.status, "EXPIRED")
        self.assertEqual(audit.call_args.kwargs["action"], "REQUEST_EXPIRED")
        audit.assert_called_once()

    def test_checked_in_visitor_stays_unresolved(self):
        checked_in = self.visitor("CHECKED_IN")
        pending = self.visitor("PENDING_ARRIVAL")
        request, _, audit = self.run_sweep([checked_in, pending])
        self.assertEqual(checked_in.visit_status, "CHECKED_IN")
        self.assertEqual(pending.visit_status, "NO_SHOW")
        self.assertEqual(request.status, "APPROVED")
        audit.assert_called_once()

    def test_current_and_future_visits_are_unchanged(self):
        for visit_date in (self.today, date(2026, 10, 16)):
            with self.subTest(visit_date=visit_date):
                visitor = self.visitor("PENDING_ARRIVAL", visit_date)
                request, _, audit = self.run_sweep([visitor])
                self.assertEqual(visitor.visit_status, "PENDING_ARRIVAL")
                self.assertEqual(request.status, "APPROVED")
                audit.assert_not_called()

    def test_future_final_visit_still_prevents_expiry(self):
        request, _, audit = self.run_sweep([
            self.visitor("NO_SHOW"), self.visitor("DENIED_ENTRY", date(2026, 10, 16)),
        ])
        self.assertEqual(request.status, "APPROVED")
        audit.assert_not_called()

    def test_empty_request_does_not_expire(self):
        request, _, audit = self.run_sweep([])
        self.assertEqual(request.status, "APPROVED")
        audit.assert_not_called()

    def test_repeat_sweep_does_not_repeat_no_show_audit(self):
        visitors = [self.visitor("PENDING_ARRIVAL"), self.visitor("CHECKED_IN")]
        self.run_sweep(visitors)
        _, _, audit = self.run_sweep(visitors)
        audit.assert_not_called()

    def test_query_only_selects_approved_past_visits_and_locks_rows(self):
        _, db, _ = self.run_sweep([self.visitor("CHECKED_IN")])
        request_query = db.scalars.call_args_list[0].args[0].compile(dialect=postgresql.dialect())
        self.assertIn("APPROVED", request_query.params.values())
        self.assertIn(self.today, request_query.params.values())
        self.assertIn("FOR UPDATE SKIP LOCKED", str(request_query))
        visitor_query = db.scalars.call_args_list[1].args[0].compile(dialect=postgresql.dialect())
        self.assertIn("FOR UPDATE", str(visitor_query))

    def test_no_candidates_produces_no_audit(self):
        db = MagicMock()
        db.scalars.return_value.all.return_value = []
        with patch("app.modules.requests.expiry.site_today", return_value=self.today), patch(
            "app.modules.requests.expiry.record_audit_log"
        ) as audit:
            expire_past_visits(db)
        audit.assert_not_called()
        db.commit.assert_called_once()
