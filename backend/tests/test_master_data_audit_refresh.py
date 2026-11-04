from unittest import TestCase
from unittest.mock import MagicMock, patch, call
from uuid import uuid4

from app.core.dependencies import InternalPrincipal, PrincipalRole
from app.modules.companies.models import Company
from app.modules.companies.schemas import CompanyUpdate
from app.modules.companies.service import update_company
from app.modules.contacts.models import Contact
from app.modules.contacts.schemas import ContactUpdate
from app.modules.contacts.service import update_contact


class MasterDataAuditRefreshTests(TestCase):
    def setUp(self):
        self.actor = InternalPrincipal(provider="entra", tenant_id="synthetic", object_id="actor", subject="entra:synthetic:actor", email=None, full_name="Synthetic staff", roles=frozenset({PrincipalRole(name="OPS")}), access_token_expires_at=None)

    def test_company_diff_uses_locked_fresh_row_before_filtering_changes(self):
        for target in ("A", "C"):
            with self.subTest(target=target):
                company = Company(id=uuid4(), name="Company", main_phone="A")
                db = MagicMock()
                def refresh(row, **kwargs):
                    if kwargs.get("with_for_update"):
                        row.main_phone = "B"  # Another transaction committed after initial lookup.
                db.refresh.side_effect = refresh
                with patch("app.modules.companies.service.record_audit_log") as audit:
                    update_company(db, company, CompanyUpdate(main_phone=target), self.actor)
                audit.assert_called_once()
                self.assertEqual(audit.call_args.kwargs["metadata"], {
                    "before": {"main_phone": "B"}, "after": {"main_phone": target},
                })
                self.assertEqual(company.main_phone, target)
                self.assertEqual(db.method_calls[0], call.refresh(company, with_for_update=True))
                self.assertEqual(db.refresh.call_args_list, [call(company, with_for_update=True), call(company)])
                db.commit.assert_called_once()

    def test_contact_diff_uses_locked_fresh_row_before_filtering_changes(self):
        for target in ("A", "C"):
            with self.subTest(target=target):
                contact = Contact(id=uuid4(), company_id=uuid4(), full_name="Host", email="host@example.com", phone="A")
                db = MagicMock()
                def refresh(row, **kwargs):
                    if kwargs.get("with_for_update"):
                        row.phone = "B"
                db.refresh.side_effect = refresh
                with patch("app.modules.contacts.service.record_audit_log") as audit:
                    update_contact(db, contact, ContactUpdate(phone=target), self.actor)
                audit.assert_called_once()
                self.assertEqual(audit.call_args.kwargs["metadata"]["changes"], {
                    "phone": {"from": "B", "to": target},
                })
                self.assertEqual(contact.phone, target)
                self.assertEqual(db.method_calls[0], call.refresh(contact, with_for_update=True))
                self.assertEqual(db.refresh.call_args_list, [call(contact, with_for_update=True), call(contact)])
                db.commit.assert_called_once()
