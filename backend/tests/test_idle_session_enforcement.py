from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest import TestCase
from unittest.mock import MagicMock, patch
from uuid import uuid4

from fastapi import HTTPException
from sqlalchemy.dialects import postgresql

from app.core.dependencies import InternalPrincipal, PrincipalRole, get_current_principal, get_entra_principal
from app.modules.auth import router as routes
from app.modules.session_events import service
from app.modules.session_events.models import UserSessionEvent


class IdleSessionEnforcementTests(TestCase):
    def setUp(self):
        self.db = MagicMock()
        self.now = datetime(2026, 10, 29, 8, tzinfo=timezone.utc)
        self.actor = InternalPrincipal(
            provider="entra", tenant_id="test", object_id="actor", subject="entra:test:actor",
            email="staff@example.com", full_name="Test staff", roles=frozenset({PrincipalRole(name="OPS")}),
            access_token_expires_at=self.now + timedelta(hours=1),
        )
        self.session = SimpleNamespace(
            id=uuid4(), actor_subject=self.actor.subject, last_activity_at=self.now - timedelta(minutes=14),
            last_seen_at=datetime(2026, 10, 29, 12), ended_at=None, reason=None,
        )
        self.clock = patch.object(service, "utc_now", return_value=self.now)
        self.clock.start()
        self.addCleanup(self.clock.stop)
        self.lookup = patch.object(service, "get_actor_session", return_value=self.session)
        self.lookup.start()
        self.addCleanup(self.lookup.stop)

    def test_active_session_allows_protected_api_without_extending_activity(self):
        before = self.session.last_activity_at
        result = get_current_principal(actor=self.actor, session_id=self.session.id, db=self.db)
        self.assertIs(result, self.actor)
        self.assertEqual(self.session.last_activity_at, before)
        self.db.commit.assert_not_called()

    def test_missing_application_session_is_401_even_with_valid_entra_token(self):
        with self.assertRaises(HTTPException) as caught:
            get_current_principal(actor=self.actor, session_id=None, db=self.db)
        self.assertEqual(caught.exception.status_code, 401)

    def test_exact_15_minute_boundary_expires_audits_and_denies_access(self):
        self.session.last_activity_at = self.now - timedelta(minutes=15)
        with self.assertRaises(HTTPException) as caught:
            get_current_principal(actor=self.actor, session_id=self.session.id, db=self.db)
        self.assertEqual(caught.exception.status_code, 401)
        self.assertEqual(self.session.reason, "SESSION_TIMED_OUT")
        self.assertIsNotNone(self.session.ended_at)
        self.assertEqual(self.db.add.call_args.args[0].action, "SESSION_TIMED_OUT")
        self.db.commit.assert_called_once()

    def test_heartbeat_never_advances_activity(self):
        before = self.session.last_activity_at
        service.heartbeat_user_session(self.db, actor=self.actor, session_id=self.session.id)
        self.assertEqual(self.session.last_activity_at, before)
        self.assertEqual(self.db.add.call_args.args[0].action, "SESSION_HEARTBEAT")

    def test_real_activity_advances_activity_and_is_audited_before_commit(self):
        service.record_user_activity(self.db, actor=self.actor, session_id=self.session.id)
        self.assertEqual(self.session.last_activity_at, self.now)
        self.assertEqual(self.db.add.call_args.args[0].action, "SESSION_ACTIVITY")
        self.db.commit.assert_called_once()

    def test_activity_cannot_revive_expired_session(self):
        self.session.last_activity_at = self.now - timedelta(minutes=15)
        with self.assertRaises(PermissionError):
            service.record_user_activity(self.db, actor=self.actor, session_id=self.session.id)
        self.assertEqual(self.session.last_activity_at, self.now - timedelta(minutes=15))
        self.assertEqual(self.db.add.call_args.args[0].action, "SESSION_TIMED_OUT")

    def test_legacy_or_ended_sessions_are_denied_without_repeated_audit(self):
        for session in (None, SimpleNamespace(ended_at=self.now), SimpleNamespace(ended_at=None, last_activity_at=None)):
            with self.subTest(session=session), patch.object(service, "get_actor_session", return_value=session):
                with self.assertRaises(PermissionError):
                    service.require_active_session(self.db, actor=self.actor, session_id=uuid4())
        self.db.add.assert_not_called()

    def test_session_ownership_uses_stable_subject_not_email(self):
        self.lookup.stop()
        service.get_actor_session(self.db, actor=self.actor, session_id=uuid4())
        statement = self.db.scalars.call_args.args[0].compile(dialect=postgresql.dialect())
        where = str(statement).split("WHERE")[1]
        self.assertIn("actor_subject", where)
        self.assertNotIn("email", where)
        self.assertIn(self.actor.subject, statement.params.values())
        self.assertIn("FOR UPDATE", where)

    def test_foreign_subject_session_is_denied(self):
        with patch.object(service, "get_actor_session", return_value=None):
            with self.assertRaises(PermissionError):
                service.require_active_session(self.db, actor=self.actor, session_id=uuid4())

    def test_new_session_stores_stable_identity_and_utc_activity(self):
        with patch.object(service, "expire_inactive_sessions"):
            session = service.start_user_session(self.db, actor=self.actor)
        self.assertIsInstance(session, UserSessionEvent)
        self.assertEqual(session.actor_subject, self.actor.subject)
        self.assertEqual(session.last_activity_at, self.now)

    def test_protected_route_graphs_require_application_session(self):
        from app.main import app

        def dependencies(dependant):
            for child in dependant.dependencies:
                yield child.call
                yield from dependencies(child)

        protected = [route for route in app.routes if getattr(route, "path", "").startswith("/api/v1/") and not route.path.startswith("/api/v1/auth/")]
        self.assertTrue(protected)
        for route in protected:
            with self.subTest(route=route.path):
                self.assertIn(get_current_principal, list(dependencies(route.dependant)))

    def test_auth_bootstrap_uses_entra_without_application_session(self):
        for route in routes.router.routes:
            calls = [child.call for child in route.dependant.dependencies]
            if route.path in ("/me", "/site-settings"):
                self.assertIn(get_entra_principal, calls)

    def test_activity_endpoint_maps_expiry_to_401(self):
        with patch.object(routes, "record_user_activity", side_effect=PermissionError("Expired")):
            with self.assertRaises(HTTPException) as caught:
                routes.post_session_activity(uuid4(), db=self.db, current_user=self.actor)
        self.assertEqual(caught.exception.status_code, 401)

    def test_activity_audit_failure_prevents_commit(self):
        with patch.object(service, "record_audit_log", side_effect=RuntimeError("Audit unavailable")):
            with self.assertRaises(RuntimeError):
                service.record_user_activity(self.db, actor=self.actor, session_id=self.session.id)
        self.db.commit.assert_not_called()
