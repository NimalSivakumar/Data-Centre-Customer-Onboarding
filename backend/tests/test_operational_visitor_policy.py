"""Characterize the owner's operational entry/exit/no-show policy without a DB."""
from datetime import date, datetime, time
from types import SimpleNamespace
from unittest import TestCase
from unittest.mock import MagicMock, patch
from uuid import uuid4
from zoneinfo import ZoneInfo

from fastapi import HTTPException
from fastapi.routing import APIRoute

from app.core.dependencies import InternalPrincipal, PrincipalRole
from app.modules.requests.models import Request
from app.modules.visitor_access.models import VisitorAccessRequest
from app.modules.companies.models import Company  # noqa: F401
from app.modules.contacts.models import Contact  # noqa: F401
from app.modules.requests.expiry import expire_past_visits
from app.modules.security_portal import service
from app.modules.security_portal.router import router
from app.modules.security_portal.schemas import CheckInRequest, SecurityActionRequest


class OperationalVisitorPolicyTests(TestCase):
    def setUp(self):
        self.actor = InternalPrincipal(
            provider="entra", tenant_id="test", object_id="security", subject="entra:test:security",
            email="security@example.com", full_name="Synthetic security",
            roles=frozenset({PrincipalRole(name="SECURITY")}), access_token_expires_at=None,
        )

    def visitor(self, parent_status="APPROVED", status="PENDING_ARRIVAL") -> VisitorAccessRequest:
        parent = Request(id=uuid4(), status=parent_status)
        return VisitorAccessRequest(
            id=uuid4(), request_id=parent.id, visitor_full_name="Synthetic visitor",
            visitor_id_number="SYNTHETIC-ID", visit_status=status,
            visit_date=date(2026, 11, 3), expected_arrival_time=time(9), expected_departure_time=time(17),
            request=parent, security_notes=None,
            checked_in_at=None, checked_out_at=None,
        )

    def test_entry_requires_admin_approval_before_security_can_check_in(self):
        for status in ("SUBMITTED", "REJECTED", "CANCELLED", "EXPIRED"):
            with self.subTest(status=status):
                db = MagicMock()
                visitor = self.visitor(parent_status=status)
                with self.assertRaisesRegex(ValueError, "Only approved"):
                    service.check_in_visitor(db, visitor, CheckInRequest(identity_verified=True), self.actor)
                self.assertEqual(visitor.visit_status, "PENDING_ARRIVAL")
                db.commit.assert_not_called()

    def test_security_must_confirm_identity_even_after_admin_approval(self):
        db = MagicMock()
        visitor = self.visitor()
        with self.assertRaisesRegex(ValueError, "identity must be verified"):
            service.check_in_visitor(db, visitor, CheckInRequest(identity_verified=False), self.actor)
        db.commit.assert_not_called()

    def test_check_in_and_check_out_actions_require_security_role(self):
        for suffix in ("/check-in", "/check-out"):
            route = next(item for item in router.routes if isinstance(item, APIRoute) and item.path.endswith(suffix))
            guard = next(item.call for item in route.dependant.dependencies if item.name == "current_user")
            self.assertIsNotNone(guard)
            assert guard is not None
            security = SimpleNamespace(roles=frozenset({PrincipalRole(name="SECURITY")}))
            self.assertIs(guard(current_user=security), security)
            for role in ("ADMIN", "OPS"):
                with self.subTest(action=suffix, role=role), self.assertRaises(HTTPException) as error:
                    guard(current_user=SimpleNamespace(roles=frozenset({PrincipalRole(name=role)})))
                self.assertEqual(error.exception.status_code, 403)

    def test_security_records_entry_then_records_departure_without_deleting_history(self):
        db = MagicMock()
        visitor = self.visitor()
        now = datetime(2026, 11, 3, 12, tzinfo=ZoneInfo("Indian/Mahe"))
        with patch.object(service, "get_site_now", return_value=now), patch.object(
            service, "get_security_visitor", return_value=visitor
        ), patch.object(service, "record_audit_log") as audit:
            service.check_in_visitor(db, visitor, CheckInRequest(identity_verified=True), self.actor)
            self.assertEqual(visitor.visit_status, "CHECKED_IN")
            arrived = visitor.checked_in_at
            self.assertIsNotNone(arrived)
            service.check_out_visitor(db, visitor, SecurityActionRequest(), self.actor)
        self.assertEqual(visitor.visit_status, "CHECKED_OUT")
        self.assertEqual(visitor.checked_in_at, arrived)
        self.assertIsNotNone(visitor.checked_out_at)
        self.assertEqual([call.kwargs["action"] for call in audit.call_args_list], [
            "VISITOR_CHECKED_IN", "VISITOR_CHECKED_OUT",
        ])
        db.delete.assert_not_called()

    def test_after_site_midnight_no_show_preserves_approval_and_visitor_history(self):
        db = MagicMock()
        visitor = self.visitor()
        parent = SimpleNamespace(id=visitor.request_id, request_number="SYNTHETIC-REQUEST", status="APPROVED")
        db.scalars.side_effect = [SimpleNamespace(all=lambda: [parent]), SimpleNamespace(all=lambda: [visitor])]
        with patch("app.modules.requests.expiry.site_today", return_value=date(2026, 11, 4)), patch(
            "app.modules.requests.expiry.record_audit_log"
        ) as audit:
            expire_past_visits(db)
        self.assertEqual(visitor.visit_status, "NO_SHOW")
        self.assertEqual(parent.status, "APPROVED")
        self.assertEqual(visitor.visitor_id_number, "SYNTHETIC-ID")
        self.assertEqual([call.kwargs["action"] for call in audit.call_args_list], [
            "VISITOR_NO_SHOW",
        ])
        db.commit.assert_called_once()
        db.delete.assert_not_called()
