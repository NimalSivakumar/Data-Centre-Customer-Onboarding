from datetime import date
from types import SimpleNamespace
from unittest import TestCase
from unittest.mock import MagicMock, patch
from uuid import uuid4

from fastapi import HTTPException
from sqlalchemy.dialects import postgresql

from app.modules.requests import router as request_routes
from app.modules.requests import service as requests
from app.modules.requests.schemas import ReviewRequest
from app.modules.security_portal import router as security_routes
from app.modules.security_portal import service as security


def sql(statement):
    return str(statement.compile(dialect=postgresql.dialect(), compile_kwargs={"literal_binds": True}))


class WorkflowLockingTests(TestCase):
    def test_request_mutation_loader_locks_and_refreshes_existing_objects(self):
        db = MagicMock()
        requests.get_request_for_update(db, uuid4())
        statement = db.scalar.call_args.args[0]
        self.assertIn("FOR UPDATE", sql(statement))
        self.assertTrue(statement.get_execution_options()["populate_existing"])

    def test_all_review_routes_use_locked_loader_before_transition(self):
        for endpoint in (request_routes.post_approve_request, request_routes.post_reject_request, request_routes.post_cancel_request):
            with self.subTest(endpoint=endpoint.__name__), patch.object(
                request_routes, "get_request_for_update", return_value=None,
            ) as locked, patch.object(request_routes, "get_request") as unlocked:
                request_id = uuid4()
                args = [request_id] if endpoint == request_routes.post_cancel_request else [request_id, ReviewRequest()]
                with self.assertRaises(HTTPException) as caught:
                    endpoint(*args, db=MagicMock(), current_user=object())
                self.assertEqual(caught.exception.status_code, 404)
                locked.assert_called_once()
                unlocked.assert_not_called()

    def test_security_writer_locks_parent_before_visitor_and_refreshes_both(self):
        db = MagicMock()
        request_id, visitor_id = uuid4(), uuid4()
        visitor = object()
        db.scalar.side_effect = [request_id, object(), visitor]
        self.assertIs(security.get_security_visitor_for_update(db, visitor_id), visitor)
        statements = [call.args[0] for call in db.scalar.call_args_list]
        self.assertNotIn("FOR UPDATE", sql(statements[0]))
        self.assertIn("FROM requests", sql(statements[1]))
        self.assertIn("FOR UPDATE", sql(statements[1]))
        self.assertIn("FROM visitor_access_requests", sql(statements[2]))
        self.assertIn("FOR UPDATE", sql(statements[2]))
        for statement in statements[1:]:
            self.assertTrue(statement.get_execution_options()["populate_existing"])

    def test_missing_visitor_does_not_attempt_parent_or_visitor_locks(self):
        db = MagicMock()
        db.scalar.return_value = None
        self.assertIsNone(security.get_security_visitor_for_update(db, uuid4()))
        self.assertEqual(db.scalar.call_count, 1)

    def test_missing_parent_does_not_attempt_visitor_lock(self):
        db = MagicMock()
        db.scalar.side_effect = [uuid4(), None]
        self.assertIsNone(security.get_security_visitor_for_update(db, uuid4()))
        self.assertEqual(db.scalar.call_count, 2)

    def test_list_and_detail_apply_identical_visibility_condition(self):
        db = MagicMock()
        with patch.object(security, "site_today", return_value=date(2026, 10, 29)):
            security.get_visible_security_visitor(db, uuid4())
            detail = sql(db.scalar.call_args.args[0])
            security.list_security_visitors(db, date(2026, 10, 28))
            listing = sql(db.scalars.call_args.args[0])
            visibility = sql(security.security_visibility_filter())
        self.assertIn(visibility, detail)
        self.assertIn(visibility, listing)
        self.assertIn("'APPROVED'", visibility)
        self.assertIn("'EXPIRED'", visibility)
        self.assertIn("visit_date < '2026-10-29'", visibility)
        for status in ("SUBMITTED", "REJECTED", "CANCELLED"):
            self.assertNotIn(status, visibility)

    def test_invisible_detail_returns_not_found(self):
        with patch.object(security_routes, "get_visible_security_visitor", return_value=None):
            with self.assertRaises(HTTPException) as caught:
                security_routes.get_visitor_detail(uuid4(), db=MagicMock(), _=object())
        self.assertEqual(caught.exception.status_code, 404)

    def test_cancelled_parent_blocks_check_in_and_denial_before_writes(self):
        visitor = SimpleNamespace(request=SimpleNamespace(status="CANCELLED"), visit_status="PENDING_ARRIVAL")
        for transition in (security.check_in_visitor, security.deny_visitor_entry):
            db = MagicMock()
            with self.subTest(transition=transition.__name__), self.assertRaisesRegex(ValueError, "Only approved"):
                transition(db, visitor, object(), object())
            db.add.assert_not_called()
            db.commit.assert_not_called()
