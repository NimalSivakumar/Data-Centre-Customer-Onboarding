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


class SessionAuditingTests(TestCase):
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

    def test_start_adds_actor_audit_before_commit(self):
        events = []
        self.db.commit.side_effect = lambda: events.append("commit")
        self.db.add.side_effect = lambda item: events.append(getattr(item, "action", "session"))
        with patch.object(service, "expire_inactive_sessions"), patch.object(service, "local_now", return_value=self.now):
            service.start_user_session(self.db, actor=self.actor)
        self.assertLess(events.index("SESSION_STARTED"), events.index("commit"))
        log = self.db.add.call_args.args[0]
        self.assertEqual(log.actor_subject, self.actor.subject)
        self.db.flush.assert_called_once()

    def test_heartbeat_adds_audit_and_commits_with_write(self):
        with patch.object(service, "expire_inactive_sessions"), patch.object(
            service, "get_actor_session", return_value=self.session,
        ), patch.object(service, "local_now", return_value=self.now):
            service.heartbeat_user_session(self.db, actor=self.actor, session_id=self.session.id)
        self.assertEqual(self.session.last_seen_at, self.now)
        self.assertEqual(self.db.add.call_args.args[0].action, "SESSION_HEARTBEAT")
        self.db.commit.assert_called_once()

    def test_end_adds_audit_and_is_idempotent(self):
        with patch.object(service, "expire_inactive_sessions"), patch.object(
            service, "get_actor_session", return_value=self.session,
        ), patch.object(service, "local_now", return_value=self.now):
            service.end_user_session(self.db, actor=self.actor, session_id=self.session.id)
            service.end_user_session(self.db, actor=self.actor, session_id=self.session.id)
        self.assertEqual(self.session.reason, "USER_SIGNED_OUT")
        self.assertEqual(self.db.add.call_args.args[0].action, "SESSION_ENDED")
        self.db.commit.assert_called_once()

    def test_timeout_locks_stale_sessions_and_audits_each_in_same_transaction(self):
        self.db.scalars.return_value.all.return_value = [self.session]
        self.assertEqual(service.expire_inactive_sessions(self.db, now=self.now), 1)
        statement = self.db.scalars.call_args.args[0]
        sql = str(statement.compile(dialect=postgresql.dialect(), compile_kwargs={"literal_binds": True}))
        self.assertIn("FOR UPDATE SKIP LOCKED", sql)
        self.assertIn("ended_at IS NULL", sql)
        self.assertIn("last_seen_at <", sql)
        self.assertEqual(self.session.ended_at, self.now)
        self.assertEqual(self.session.reason, "SESSION_TIMED_OUT")
        log = self.db.add.call_args.args[0]
        self.assertEqual(log.action, "SESSION_TIMED_OUT")
        self.assertIsNone(log.actor_subject)
        self.assertEqual(log.entity_id, self.session.id)
        self.db.commit.assert_called_once()

    def test_actor_session_lookup_locks_and_refreshes_state(self):
        service.get_actor_session(self.db, actor=self.actor, session_id=self.session.id)
        statement = self.db.scalars.call_args.args[0]
        self.assertIn("FOR UPDATE", str(statement.compile(dialect=postgresql.dialect())))
        self.assertTrue(statement.get_execution_options()["populate_existing"])

    def test_audit_failure_prevents_committing_session_write(self):
        with patch.object(service, "expire_inactive_sessions"), patch.object(
            service, "get_actor_session", return_value=self.session,
        ), patch.object(service, "record_audit_log", side_effect=RuntimeError("Audit unavailable")):
            with self.assertRaises(RuntimeError):
                service.heartbeat_user_session(self.db, actor=self.actor, session_id=self.session.id)
        self.db.commit.assert_not_called()

    def test_expired_or_missing_session_heartbeat_does_not_write(self):
        for session in (None, SimpleNamespace(ended_at=self.now)):
            with patch.object(service, "expire_inactive_sessions"), patch.object(service, "get_actor_session", return_value=session):
                self.assertIsNone(service.heartbeat_user_session(self.db, actor=self.actor, session_id=uuid4()))
        self.db.add.assert_not_called()
        self.db.commit.assert_not_called()
