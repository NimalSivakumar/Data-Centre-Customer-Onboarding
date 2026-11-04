from datetime import date, datetime, timezone
from types import SimpleNamespace
from unittest import TestCase
from unittest.mock import MagicMock, patch
from uuid import uuid4

from sqlalchemy.dialects import postgresql

from app.modules.companies.models import Company  # noqa: F401
from app.modules.contacts.models import Contact  # noqa: F401
from app.modules.requests.expiry import expire_past_visits
from app.modules.requests.schemas import RequestResponse
from app.modules.requests.service import list_requests


class RequestDecisionStatusTests(TestCase):
    def test_legacy_auto_expired_approval_is_reported_as_approved_and_rejection_is_preserved(self):
        now = datetime(2026, 11, 3, tzinfo=timezone.utc)
        data = dict(id=uuid4(), request_number="TEST", company_id=uuid4(), request_type="VISITOR_ACCESS",
                    title="Synthetic request", description=None, submitted_at=now, reviewed_at=now,
                    review_notes=None, created_at=now, updated_at=now)
        self.assertEqual(RequestResponse(**data, status="EXPIRED").status.value, "APPROVED")
        self.assertEqual(RequestResponse(**data, status="REJECTED").status.value, "REJECTED")
        self.assertEqual(RequestResponse(**data, status="APPROVED").status.value, "APPROVED")

    def test_no_show_updates_attendance_without_replacing_the_approval_decision(self):
        request = SimpleNamespace(id=uuid4(), request_number="TEST", status="APPROVED")
        visitor = SimpleNamespace(id=uuid4(), visitor_full_name="Synthetic visitor", visit_date=date(2026, 11, 2), visit_status="PENDING_ARRIVAL")
        db = MagicMock()
        db.scalars.side_effect = [SimpleNamespace(all=lambda: [request]), SimpleNamespace(all=lambda: [visitor])]
        with patch("app.modules.requests.expiry.site_today", return_value=date(2026, 11, 3)), patch("app.modules.requests.expiry.record_audit_log") as audit:
            expire_past_visits(db)
        self.assertEqual(request.status, "APPROVED")
        self.assertEqual(visitor.visit_status, "NO_SHOW")
        self.assertEqual([call.kwargs["action"] for call in audit.call_args_list], ["VISITOR_NO_SHOW"])
        db.delete.assert_not_called()

    def test_approved_filter_and_total_include_legacy_auto_expired_approvals(self):
        db = MagicMock()
        db.scalar.return_value = 0
        db.scalars.return_value.unique.return_value.all.return_value = []
        list_requests(db, status="APPROVED")
        for statement in (db.scalar.call_args.args[0], db.scalars.call_args.args[0]):
            self.assertIn("EXPIRED", repr(statement.compile(dialect=postgresql.dialect()).params))
