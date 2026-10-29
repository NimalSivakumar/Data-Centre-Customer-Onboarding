from types import SimpleNamespace
from unittest import TestCase
from unittest.mock import MagicMock, patch
from uuid import uuid4

from fastapi import HTTPException

from app.core.dependencies import InternalPrincipal, PrincipalRole
from app.modules.requests.router import post_approve_request, router
from app.modules.requests.schemas import ReviewRequest
from app.modules.requests.service import approve_request


class RequestApprovalTests(TestCase):
    def setUp(self):
        self.db = MagicMock()
        self.request = SimpleNamespace(
            id=uuid4(), request_number="REQ-TEST", status="SUBMITTED",
            reviewed_at=None, review_notes=None,
        )
        self.payload = ReviewRequest(review_notes="Approved for maintenance")

    def principal(self, *roles):
        return InternalPrincipal(
            provider="entra", tenant_id="test-tenant", object_id="test-actor",
            subject="entra:test-tenant:test-actor", email="staff@example.com",
            full_name="Test staff", roles=frozenset(PrincipalRole(name=role) for role in roles),
            access_token_expires_at=None,
        )

    def role_check(self, suffix):
        route = next(route for route in router.routes if route.path == f"/requests/{{request_id}}/{suffix}")
        return next(dependency.call for dependency in route.dependant.dependencies if dependency.name == "current_user")

    def test_approval_route_dependency_allows_admin(self):
        actor = self.principal("ADMIN")
        self.assertIs(self.role_check("approve")(current_user=actor), actor)

    def test_approval_route_dependency_rejects_ops_and_security(self):
        for roles in (("OPS",), ("SECURITY",), ("OPS", "SECURITY"), ()):
            with self.subTest(roles=roles), self.assertRaises(HTTPException) as caught:
                self.role_check("approve")(current_user=self.principal(*roles))
            self.assertEqual(caught.exception.status_code, 403)

    def test_service_denies_non_admin_before_any_write(self):
        for role in ("OPS", "SECURITY"):
            with self.subTest(role=role), self.assertRaisesRegex(PermissionError, "Only ADMIN users can approve requests"):
                approve_request(self.db, self.request, self.payload, self.principal(role))
        self.assertEqual(self.request.status, "SUBMITTED")
        self.assertIsNone(self.request.reviewed_at)
        self.db.add.assert_not_called()
        self.db.commit.assert_not_called()

    def test_admin_approval_preserves_audit_and_commit(self):
        actor = self.principal("ADMIN")
        with patch("app.modules.requests.service.get_request", return_value=self.request):
            result = approve_request(self.db, self.request, self.payload, actor)
        self.assertIs(result, self.request)
        self.assertEqual(result.status, "APPROVED")
        self.assertEqual(result.review_notes, self.payload.review_notes)
        self.assertIsNotNone(result.reviewed_at)
        log = self.db.add.call_args.args[0]
        self.assertEqual(log.action, "REQUEST_APPROVED")
        self.assertEqual(log.actor_subject, actor.subject)
        self.assertEqual(log.actor_roles_snapshot, ["ADMIN"])
        self.db.commit.assert_called_once()

    def test_admin_ops_combined_role_still_allows_approval(self):
        actor = self.principal("ADMIN", "OPS")
        self.assertIs(self.role_check("approve")(current_user=actor), actor)
        with patch("app.modules.requests.service.get_request", return_value=self.request):
            approve_request(self.db, self.request, self.payload, actor)
        self.assertEqual(self.request.status, "APPROVED")

    def test_admin_cannot_approve_non_submitted_states(self):
        for status in ("APPROVED", "REJECTED", "CANCELLED", "EXPIRED"):
            self.request.status = status
            with self.subTest(status=status), self.assertRaisesRegex(ValueError, "Only submitted requests"):
                approve_request(self.db, self.request, self.payload, self.principal("ADMIN"))
            self.assertEqual(self.request.status, status)
        self.db.add.assert_not_called()
        self.db.commit.assert_not_called()

    def test_direct_route_service_permission_error_becomes_readable_403(self):
        with patch("app.modules.requests.router.get_request_for_update", return_value=self.request):
            with self.assertRaises(HTTPException) as caught:
                post_approve_request(
                    self.request.id, self.payload, db=self.db, current_user=self.principal("OPS"),
                )
        self.assertEqual(caught.exception.status_code, 403)
        self.assertEqual(caught.exception.detail, "Only ADMIN users can approve requests")
        self.db.commit.assert_not_called()

    def test_reject_and_cancel_role_dependencies_are_unchanged(self):
        for suffix in ("reject", "cancel"):
            for role in ("ADMIN", "OPS"):
                with self.subTest(suffix=suffix, role=role):
                    actor = self.principal(role)
                    self.assertIs(self.role_check(suffix)(current_user=actor), actor)
