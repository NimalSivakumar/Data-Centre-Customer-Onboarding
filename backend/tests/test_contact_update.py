from datetime import datetime, timezone
from unittest import TestCase
from unittest.mock import MagicMock, patch
from uuid import uuid4

from fastapi import HTTPException
from sqlalchemy.dialects import postgresql

from app.core.dependencies import InternalPrincipal, PrincipalRole
from app.modules.contacts.models import Contact
from app.modules.contacts.router import patch_contact, router
from app.modules.contacts.schemas import ContactUpdate
from app.modules.contacts.service import update_contact


class ContactUpdateTests(TestCase):
    def setUp(self):
        self.db = MagicMock()
        self.db.scalar.return_value = None
        self.actor = self.principal("OPS")
        now = datetime(2026, 10, 29, tzinfo=timezone.utc)
        self.contact = Contact(
            id=uuid4(), company_id=uuid4(), full_name="Test contact",
            email="contact@example.com", phone="1234567", job_title="Engineer",
            contact_type="TECHNICAL", is_primary=False,
            is_authorised_requester=False, status="ACTIVE",
            created_at=now, updated_at=now,
        )

    def principal(self, role):
        return InternalPrincipal(
            provider="entra", tenant_id="test-tenant", object_id="test-actor",
            subject="entra:test-tenant:test-actor", email="staff@example.com",
            full_name="Test staff", roles=frozenset({PrincipalRole(name=role)}),
            access_token_expires_at=None,
        )

    def test_real_edit_without_user_relationship_records_actor_and_changes(self):
        self.assertFalse(hasattr(self.contact, "user"))
        result = update_contact(
            self.db, self.contact, ContactUpdate(phone="7654321"), self.actor,
        )
        self.assertIs(result, self.contact)
        self.assertEqual(result.phone, "7654321")
        self.db.add.assert_called_once()
        log = self.db.add.call_args.args[0]
        self.assertEqual(log.action, "CONTACT_UPDATED")
        self.assertEqual(log.entity_id, self.contact.id)
        self.assertEqual(log.actor_subject, self.actor.subject)
        self.assertEqual(log.actor_roles_snapshot, ["OPS"])
        self.assertEqual(log.metadata_json["changes"], {
            "phone": {"from": "1234567", "to": "7654321"},
        })
        self.assertNotIn("account_email", log.metadata_json["target"])
        self.assertEqual(log.metadata_json["target"]["contact_email"], self.contact.email)
        self.assertEqual(log.metadata_json["target"]["company_id"], str(self.contact.company_id))
        self.db.commit.assert_called_once()
        self.assertLess(
            [call[0] for call in self.db.method_calls].index("add"),
            [call[0] for call in self.db.method_calls].index("commit"),
        )
        self.db.refresh.assert_called_once_with(self.contact)

    def test_unchanged_fields_do_not_create_audit(self):
        update_contact(self.db, self.contact, ContactUpdate(phone="1234567"), self.actor)
        self.db.add.assert_not_called()
        self.assertEqual(self.contact.phone, "1234567")

    def test_empty_patch_does_not_create_audit(self):
        update_contact(self.db, self.contact, ContactUpdate(), self.actor)
        self.db.add.assert_not_called()
        self.assertEqual(self.contact.full_name, "Test contact")

    def test_optional_field_can_be_cleared_without_changing_omitted_fields(self):
        update_contact(self.db, self.contact, ContactUpdate(phone=None), self.actor)
        self.assertIsNone(self.contact.phone)
        self.assertEqual(self.contact.email, "contact@example.com")
        log = self.db.add.call_args.args[0]
        self.assertEqual(log.metadata_json["changes"], {
            "phone": {"from": "1234567", "to": None},
        })

    def test_multiple_changes_use_one_audit_entry(self):
        update_contact(
            self.db, self.contact,
            ContactUpdate(job_title="Manager", is_primary=True, status="INACTIVE"), self.actor,
        )
        self.db.add.assert_called_once()
        log = self.db.add.call_args.args[0]
        self.assertEqual(log.metadata_json["changes"], {
            "job_title": {"from": "Engineer", "to": "Manager"},
            "is_primary": {"from": False, "to": True},
            "status": {"from": "ACTIVE", "to": "INACTIVE"},
        })

    def test_duplicate_email_does_not_change_contact_or_commit(self):
        self.db.scalar.return_value = object()
        with self.assertRaisesRegex(ValueError, "email already exists"):
            update_contact(
                self.db, self.contact,
                ContactUpdate(email="other@example.com", phone="7654321"), self.actor,
            )
        self.assertEqual(self.contact.email, "contact@example.com")
        self.assertEqual(self.contact.phone, "1234567")
        self.db.add.assert_not_called()
        self.db.commit.assert_not_called()

    def test_duplicate_email_query_is_company_scoped_and_excludes_current_contact(self):
        update_contact(
            self.db, self.contact, ContactUpdate(email="Other@example.com"), self.actor,
        )
        query = self.db.scalar.call_args.args[0].compile(dialect=postgresql.dialect())
        self.assertIn(self.contact.company_id, query.params.values())
        self.assertIn(self.contact.id, query.params.values())
        self.assertIn("other@example.com", query.params.values())
        self.assertIn("contacts.id !=", str(query))
        self.assertIn("lower(contacts.email)", str(query))

    def test_audit_failure_prevents_commit(self):
        with patch("app.modules.contacts.service.record_audit_log", side_effect=RuntimeError("Audit failed")):
            with self.assertRaises(RuntimeError):
                update_contact(self.db, self.contact, ContactUpdate(phone="7654321"), self.actor)
        self.db.commit.assert_not_called()

    def test_patch_route_returns_readable_400_for_duplicate_email(self):
        self.db.scalar.return_value = object()
        with patch("app.modules.contacts.router.get_contact", return_value=self.contact):
            with self.assertRaises(HTTPException) as caught:
                patch_contact(
                    self.contact.id, ContactUpdate(email="other@example.com"),
                    db=self.db, current_user=self.actor,
                )
        self.assertEqual(caught.exception.status_code, 400)
        self.assertEqual(caught.exception.detail, "A contact with this email already exists for this company")
        self.db.commit.assert_not_called()

    def test_patch_route_returns_404_for_missing_contact(self):
        with patch("app.modules.contacts.router.get_contact", return_value=None):
            with self.assertRaises(HTTPException) as caught:
                patch_contact(uuid4(), ContactUpdate(phone="7654321"), db=self.db, current_user=self.actor)
        self.assertEqual(caught.exception.status_code, 404)
        self.db.commit.assert_not_called()

    def test_successful_patch_response_contains_business_fields_only(self):
        with patch("app.modules.contacts.router.get_contact", return_value=self.contact):
            response = patch_contact(
                self.contact.id, ContactUpdate(phone="7654321"),
                db=self.db, current_user=self.actor,
            )
        self.assertEqual(response.phone, "7654321")
        self.assertEqual(response.id, self.contact.id)
        self.assertNotIn("user_id", response.model_dump())
        self.assertNotIn("account_email", response.model_dump())

    def test_patch_route_role_dependency_allows_admin_and_ops_but_not_security(self):
        route = next(route for route in router.routes if route.path == "/contacts/{contact_id}")
        role_check = next(dependency.call for dependency in route.dependant.dependencies if dependency.name == "current_user")
        for role in ("ADMIN", "OPS"):
            with self.subTest(role=role):
                actor = self.principal(role)
                self.assertIs(role_check(current_user=actor), actor)
        with self.assertRaises(HTTPException) as caught:
            role_check(current_user=self.principal("SECURITY"))
        self.assertEqual(caught.exception.status_code, 403)
