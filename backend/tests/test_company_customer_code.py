from types import SimpleNamespace
from unittest import TestCase
from unittest.mock import MagicMock, patch
from uuid import uuid4

from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError

from app.modules.companies.router import patch_company, post_company
from app.modules.companies.schemas import CompanyCreate, CompanyUpdate
from app.modules.companies.service import create_company, update_company


class DatabaseError(Exception):
    def __init__(self, constraint_name="companies_customer_code_key", sqlstate="23505"):
        super().__init__("Simulated database error")
        self.sqlstate = sqlstate
        self.diag = SimpleNamespace(constraint_name=constraint_name)


class CompanyCustomerCodeTests(TestCase):
    def setUp(self):
        self.db = MagicMock()
        self.db.scalar.return_value = None
        self.actor = SimpleNamespace()
        self.payload = CompanyCreate(
            name="Test company", customer_code="TEST-001",
            main_email="contact@example.com", main_phone="1234567",
        )
        self.company = SimpleNamespace(
            id=uuid4(), name="Test company", customer_code="OLD-001",
        )
        self.audit_patch = patch("app.modules.companies.service.record_audit_log")
        self.audit = self.audit_patch.start()
        self.addCleanup(self.audit_patch.stop)

    def duplicate_error(self, **kwargs):
        return IntegrityError("Simulated write", {}, DatabaseError(**kwargs))

    def test_create_precheck_rejects_existing_code_before_writing(self):
        self.db.scalar.return_value = self.company
        with self.assertRaisesRegex(ValueError, "customer code already exists"):
            create_company(self.db, self.payload, self.actor)
        self.db.add.assert_not_called()
        self.db.commit.assert_not_called()
        self.audit.assert_not_called()

    def test_update_precheck_rejects_existing_code_before_changing_company(self):
        self.db.scalar.return_value = SimpleNamespace(id=uuid4())
        with self.assertRaisesRegex(ValueError, "customer code already exists"):
            update_company(self.db, self.company, CompanyUpdate(customer_code="TEST-001"), self.actor)
        self.assertEqual(self.company.customer_code, "OLD-001")
        self.db.commit.assert_not_called()
        self.audit.assert_not_called()

    def test_create_duplicate_at_flush_rolls_back_and_returns_readable_error(self):
        self.db.flush.side_effect = self.duplicate_error()
        with self.assertRaisesRegex(ValueError, "customer code already exists"):
            create_company(self.db, self.payload, self.actor)
        self.db.rollback.assert_called_once()
        self.db.commit.assert_not_called()
        self.db.refresh.assert_not_called()
        self.audit.assert_not_called()

    def test_create_duplicate_at_commit_rolls_back(self):
        self.db.commit.side_effect = self.duplicate_error()
        with self.assertRaisesRegex(ValueError, "customer code already exists"):
            create_company(self.db, self.payload, self.actor)
        self.db.rollback.assert_called_once()
        self.db.refresh.assert_not_called()

    def test_update_duplicate_at_commit_rolls_back(self):
        self.db.commit.side_effect = self.duplicate_error()
        with self.assertRaisesRegex(ValueError, "customer code already exists"):
            update_company(self.db, self.company, CompanyUpdate(customer_code="TEST-001"), self.actor)
        self.db.rollback.assert_called_once()
        self.db.refresh.assert_not_called()

    def test_other_constraint_errors_are_not_mislabeled_as_duplicate_codes(self):
        for kwargs in (
            {"constraint_name": "companies_pkey"},
            {"sqlstate": "23503"},
        ):
            with self.subTest(**kwargs):
                self.db.reset_mock(side_effect=True)
                self.db.scalar.return_value = None
                error = self.duplicate_error(**kwargs)
                self.db.flush.side_effect = error
                with self.assertRaises(IntegrityError) as caught:
                    create_company(self.db, self.payload, self.actor)
                self.assertIs(caught.exception, error)
                self.db.rollback.assert_called_once()

    def test_successful_create_preserves_company_and_contact_audits(self):
        create_company(self.db, self.payload, self.actor)
        self.assertEqual([call.kwargs["action"] for call in self.audit.call_args_list], [
            "COMPANY_CREATED", "CONTACT_CREATED",
        ])
        self.db.commit.assert_called_once()
        self.db.rollback.assert_not_called()

    def test_successful_update_preserves_audit(self):
        update_company(self.db, self.company, CompanyUpdate(customer_code="TEST-001"), self.actor)
        self.assertEqual(self.company.customer_code, "TEST-001")
        self.assertEqual(self.audit.call_args.kwargs["action"], "COMPANY_UPDATED")
        self.db.commit.assert_called_once()
        self.db.rollback.assert_not_called()

    def test_create_route_returns_400_for_racing_duplicate(self):
        self.db.flush.side_effect = self.duplicate_error()
        with self.assertRaises(HTTPException) as caught:
            post_company(self.payload, db=self.db, current_user=self.actor)
        self.assertEqual(caught.exception.status_code, 400)
        self.assertEqual(caught.exception.detail, "A company with this customer code already exists")
        self.db.rollback.assert_called_once()

    def test_update_route_returns_400_for_racing_duplicate(self):
        self.db.commit.side_effect = self.duplicate_error()
        with patch("app.modules.companies.router.get_company", return_value=self.company):
            with self.assertRaises(HTTPException) as caught:
                patch_company(
                    self.company.id, CompanyUpdate(customer_code="TEST-001"),
                    db=self.db, current_user=self.actor,
                )
        self.assertEqual(caught.exception.status_code, 400)
        self.assertEqual(caught.exception.detail, "A company with this customer code already exists")
        self.db.rollback.assert_called_once()
