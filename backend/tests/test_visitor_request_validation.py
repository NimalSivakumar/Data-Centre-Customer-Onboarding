from datetime import date, time
from types import SimpleNamespace
from unittest import TestCase
from unittest.mock import MagicMock, patch
from uuid import uuid4

from fastapi import HTTPException
from pydantic import ValidationError

from app.core.dependencies import InternalPrincipal, PrincipalRole
from app.modules.audit.models import AuditLog
from app.modules.requests.models import Request
from app.modules.requests.service import create_visitor_access_request
from app.modules.visitor_access.models import VisitorAccessRequest
from app.modules.visitor_access.router import post_visitor_access_request, router
from app.modules.visitor_access.schemas import VisitorAccessCreate


class VisitorRequestValidationTests(TestCase):
    def setUp(self):
        self.today = date(2026, 10, 29)
        self.company = SimpleNamespace(id=uuid4(), status="ACTIVE")
        self.db = MagicMock()
        self.db.scalar.return_value = 1  # Matching active host contact.
        self.actor = self.principal("OPS")
        self.data = {
            "company_id": self.company.id,
            "visit_date": self.today,
            "expected_arrival_time": time(9),
            "expected_departure_time": time(17),
            "visit_reason": "Equipment maintenance",
            "host_contact_name": "Test host",
            "visitors": [{"visitor_full_name": "Test visitor", "visitor_id_number": "TEST-ID"}],
        }
        for target, value in (
            ("get_company", self.company),
            ("site_today", self.today),
            ("generate_request_number", "REQ-20261029-00001"),
            ("get_request", None),
        ):
            patcher = patch(f"app.modules.requests.service.{target}", return_value=value)
            setattr(self, target, patcher.start())
            self.addCleanup(patcher.stop)

    def principal(self, role):
        return InternalPrincipal(
            provider="entra", tenant_id="test-tenant", object_id="test-actor",
            subject="entra:test-tenant:test-actor", email="staff@example.com",
            full_name="Test staff", roles=frozenset({PrincipalRole(name=role)}),
            access_token_expires_at=None,
        )

    def payload(self, **changes):
        return VisitorAccessCreate(**(self.data | changes))

    def assert_no_write(self):
        self.db.add.assert_not_called()
        self.db.flush.assert_not_called()
        self.db.commit.assert_not_called()
        self.generate_request_number.assert_not_called()

    def test_missing_company_is_rejected_without_writes(self):
        self.get_company.return_value = None
        with self.assertRaisesRegex(ValueError, "Company not found"):
            create_visitor_access_request(self.db, self.payload(), self.actor)
        self.assert_no_write()

    def test_every_non_active_company_status_is_rejected_without_writes(self):
        for status in ("PENDING", "SUSPENDED", "CLOSED"):
            with self.subTest(status=status):
                self.company.status = status
                with self.assertRaisesRegex(ValueError, "Company must be active"):
                    create_visitor_access_request(self.db, self.payload(), self.actor)
                self.assert_no_write()

    def test_past_date_is_rejected_without_writes(self):
        with self.assertRaisesRegex(ValueError, "Visit date cannot be in the past"):
            create_visitor_access_request(self.db, self.payload(visit_date=date(2026, 10, 28)), self.actor)
        self.assert_no_write()

    def test_today_is_accepted_with_submitted_request_pending_visitor_and_audit(self):
        request = create_visitor_access_request(self.db, self.payload(), self.actor)
        self.assertIsInstance(request, Request)
        self.assertEqual(request.status, "SUBMITTED")
        self.assertEqual(request.company_id, self.company.id)
        added = [call.args[0] for call in self.db.add.call_args_list]
        visitor = next(row for row in added if isinstance(row, VisitorAccessRequest))
        self.assertEqual(visitor.visit_date, self.today)
        self.assertEqual(visitor.visit_status, "PENDING_ARRIVAL")
        log = next(row for row in added if isinstance(row, AuditLog))
        self.assertEqual(log.action, "REQUEST_SUBMITTED")
        self.assertEqual(log.actor_subject, self.actor.subject)
        self.assertEqual(log.metadata_json["visitor_count"], 1)
        self.assertEqual(log.metadata_json["visitor_full_names"], ["Test visitor"])
        self.assertNotIn("first_visitor_full_name", log.metadata_json)
        self.db.commit.assert_called_once()
        self.assertLess(
            max(index for index, call in enumerate(self.db.method_calls) if call[0] == "add"),
            next(index for index, call in enumerate(self.db.method_calls) if call[0] == "commit"),
        )

    def test_future_date_is_accepted(self):
        create_visitor_access_request(self.db, self.payload(visit_date=date(2026, 10, 30)), self.actor)
        self.db.commit.assert_called_once()

    def test_every_visitor_is_stored_and_named_in_submission_audit(self):
        visitors = [
            {"visitor_full_name": name, "visitor_id_number": f"TEST-{index}"}
            for index, name in enumerate(("Visitor Alpha", "Visitor Beta", "Visitor Alpha"))
        ]
        create_visitor_access_request(self.db, self.payload(visitors=visitors), self.actor)
        added = [call.args[0] for call in self.db.add.call_args_list]
        stored = [row for row in added if isinstance(row, VisitorAccessRequest)]
        log = next(row for row in added if isinstance(row, AuditLog))
        self.assertEqual([row.visitor_full_name for row in stored], [row["visitor_full_name"] for row in visitors])
        self.assertEqual(log.metadata_json["visitor_full_names"], [row["visitor_full_name"] for row in visitors])
        self.assertEqual(log.metadata_json["visitor_count"], 3)
        self.assertIn("3 visitors", log.summary)
        self.assertNotIn("first_visitor_full_name", log.metadata_json)

    def test_site_location_uses_server_configuration_not_client_override(self):
        with patch("app.modules.requests.service.settings.site_location", "Configured test site"):
            create_visitor_access_request(self.db, self.payload(site_location="Client override"), self.actor)
        added = [call.args[0] for call in self.db.add.call_args_list]
        visitor = next(row for row in added if isinstance(row, VisitorAccessRequest))
        self.assertEqual(visitor.site_location, "Configured test site")

    def test_non_matching_or_inactive_host_is_rejected(self):
        self.db.scalar.return_value = 0
        with self.assertRaisesRegex(ValueError, "must be an active contact"):
            create_visitor_access_request(self.db, self.payload(), self.actor)
        self.assert_no_write()

    def test_blank_host_is_rejected(self):
        for host in (None, "", "   "):
            with self.subTest(host=host):
                with self.assertRaisesRegex(ValueError, "Host/contact name is required"):
                    create_visitor_access_request(self.db, self.payload(host_contact_name=host), self.actor)
                self.assert_no_write()

    def test_security_role_cannot_create_requests(self):
        with self.assertRaisesRegex(PermissionError, "Only ADMIN and OPS"):
            create_visitor_access_request(self.db, self.payload(), self.principal("SECURITY"))
        self.assert_no_write()

    def test_invalid_time_order_is_rejected_by_schema(self):
        for departure in (time(9), time(8)):
            with self.subTest(departure=departure):
                with self.assertRaises(ValidationError):
                    self.payload(expected_departure_time=departure)
        self.assert_no_write()

    def test_empty_visitor_list_is_rejected_by_schema(self):
        with self.assertRaises(ValidationError):
            self.payload(visitors=[])
        self.assert_no_write()

    def test_route_returns_readable_errors_for_invalid_company_and_date(self):
        cases = (
            (None, self.today, 404, "Company not found"),
            (SimpleNamespace(status="SUSPENDED"), self.today, 400, "Company must be active to create visitor requests"),
            (self.company, date(2026, 10, 28), 400, "Visit date cannot be in the past"),
        )
        for company, visit_date, status, message in cases:
            with self.subTest(message=message):
                self.get_company.return_value = company
                with self.assertRaises(HTTPException) as caught:
                    post_visitor_access_request(
                        self.payload(visit_date=visit_date), db=self.db, current_user=self.actor,
                    )
                self.assertEqual(caught.exception.status_code, status)
                self.assertEqual(caught.exception.detail, message)
                self.assert_no_write()

    def test_audit_failure_prevents_commit(self):
        with patch("app.modules.requests.service.record_audit_log", side_effect=RuntimeError("Audit failed")):
            with self.assertRaises(RuntimeError):
                create_visitor_access_request(self.db, self.payload(), self.actor)
        self.db.commit.assert_not_called()

    def test_create_route_role_dependency_allows_admin_ops_not_security(self):
        route = next(route for route in router.routes if route.path == "/visitor-access-requests")
        role_check = next(dependency.call for dependency in route.dependant.dependencies if dependency.name == "current_user")
        for role in ("ADMIN", "OPS"):
            with self.subTest(role=role):
                actor = self.principal(role)
                self.assertIs(role_check(current_user=actor), actor)
        with self.assertRaises(HTTPException) as caught:
            role_check(current_user=self.principal("SECURITY"))
        self.assertEqual(caught.exception.status_code, 403)
