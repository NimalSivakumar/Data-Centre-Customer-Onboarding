from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest import TestCase
from unittest.mock import MagicMock, patch
from uuid import uuid4

from fastapi import HTTPException
from sqlalchemy.dialects import postgresql

from app.core.dependencies import InternalPrincipal, PrincipalRole
from app.modules.auth.router import router
from app.modules.session_events import service
from app.modules.session_events.models import UserSessionEvent


class SessionTrackingTests(TestCase):
    def setUp(self):
        self.db = MagicMock()
        self.now = datetime(2026, 10, 29, 12)
        self.actor = InternalPrincipal(
            provider="entra", tenant_id="test", object_id="actor", subject="entra:test:actor",
            email="test@example.com", full_name="Test staff",
            roles=frozenset({PrincipalRole(name="OPS")}), access_token_expires_at=None,
        )
        self.session = SimpleNamespace(
            id=uuid4(), last_seen_at=self.now - timedelta(minutes=6), ended_at=None, reason=None,
            last_activity_at=self.now.replace(tzinfo=timezone.utc) - timedelta(minutes=6),
        )
        clock = patch.object(service, "utc_now", return_value=self.now.replace(tzinfo=timezone.utc))
        clock.start()
        self.addCleanup(clock.stop)

    def test_session_mutation_routes_require_an_internal_role(self):
        for route in router.routes:
            if "POST" not in route.methods:
                continue
            check = next(item.call for item in route.dependant.dependencies if item.name == "current_user")
            for role in ("ADMIN", "OPS", "SECURITY"):
                actor = SimpleNamespace(roles={PrincipalRole(name=role)})
                self.assertIs(check(current_user=actor), actor)
            with self.assertRaises(HTTPException) as caught:
                check(current_user=SimpleNamespace(roles=set()))
            self.assertEqual(caught.exception.status_code, 403)

    def test_start_only_creates_session_tracking_record(self):
        with patch.object(service, "expire_inactive_sessions"), patch.object(service, "local_now", return_value=self.now):
            result = service.start_user_session(self.db, actor=self.actor)
        self.db.add.assert_called_once_with(result)
        self.assertIsInstance(result, UserSessionEvent)
        self.assertEqual(result.actor_subject, self.actor.subject)
        self.db.commit.assert_called_once()
        self.db.flush.assert_called_once()

    def test_heartbeat_only_updates_tracking_without_audit(self):
        with patch.object(service, "expire_inactive_sessions"), patch.object(
            service, "get_actor_session", return_value=self.session,
        ), patch.object(service, "local_now", return_value=self.now):
            service.heartbeat_user_session(self.db, actor=self.actor, session_id=self.session.id)
        self.assertEqual(self.session.last_seen_at, self.now)
        self.db.add.assert_not_called()
        self.db.commit.assert_called_once()

    def test_end_only_updates_tracking_and_is_idempotent(self):
        with patch.object(service, "expire_inactive_sessions"), patch.object(
            service, "get_actor_session", return_value=self.session,
        ), patch.object(service, "local_now", return_value=self.now):
            service.end_user_session(self.db, actor=self.actor, session_id=self.session.id)
            service.end_user_session(self.db, actor=self.actor, session_id=self.session.id)
        self.assertEqual(self.session.reason, "USER_SIGNED_OUT")
        self.db.add.assert_not_called()
        self.db.commit.assert_called_once()

    def test_timeout_locks_and_updates_stale_sessions_without_audit(self):
        self.db.scalars.return_value.all.return_value = [self.session]
        self.assertEqual(service.expire_inactive_sessions(self.db, now=self.now), 1)
        statement = self.db.scalars.call_args.args[0]
        sql = str(statement.compile(dialect=postgresql.dialect(), compile_kwargs={"literal_binds": True}))
        self.assertIn("FOR UPDATE SKIP LOCKED", sql)
        self.assertIn("ended_at IS NULL", sql)
        self.assertIn("last_seen_at <", sql)
        self.assertEqual(self.session.ended_at, self.now)
        self.assertEqual(self.session.reason, "SESSION_TIMED_OUT")
        self.db.add.assert_not_called()
        self.db.commit.assert_called_once()

    def test_actor_session_lookup_locks_and_refreshes_state(self):
        service.get_actor_session(self.db, actor=self.actor, session_id=self.session.id)
        statement = self.db.scalars.call_args.args[0]
        self.assertIn("FOR UPDATE", str(statement.compile(dialect=postgresql.dialect())))
        self.assertTrue(statement.get_execution_options()["populate_existing"])

    def test_activity_only_updates_session_tracking_fields(self):
        with patch.object(service, "expire_inactive_sessions"), patch.object(
            service, "get_actor_session", return_value=self.session,
        ), patch.object(service, "local_now", return_value=self.now):
            service.record_user_activity(self.db, actor=self.actor, session_id=self.session.id)
        self.assertEqual(self.session.last_activity_at, self.now.replace(tzinfo=timezone.utc))
        self.assertEqual(self.session.last_seen_at, self.now)
        self.db.add.assert_not_called()
        self.db.commit.assert_called_once()

    def test_expired_or_missing_session_heartbeat_does_not_write(self):
        for session in (None, SimpleNamespace(ended_at=self.now)):
            with patch.object(service, "expire_inactive_sessions"), patch.object(service, "get_actor_session", return_value=session):
                self.assertIsNone(service.heartbeat_user_session(self.db, actor=self.actor, session_id=uuid4()))
        self.db.add.assert_not_called()
        self.db.commit.assert_not_called()
