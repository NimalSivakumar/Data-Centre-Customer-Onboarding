from unittest import TestCase
from pydantic import ValidationError
from app.modules.companies.schemas import CompanyCreate, CompanyUpdate
from app.modules.contacts.schemas import ContactCreate, ContactUpdate
from app.modules.visitor_access.schemas import VisitorCreate, VisitorAccessCreate


class BusinessStringTests(TestCase):
    def cases(self):
        return (
            (CompanyCreate, dict(name="Company", customer_code="CODE", main_email="test@example.com", main_phone="123"), ("name", "customer_code", "main_phone")),
            (CompanyUpdate, {}, ("name", "customer_code", "main_phone")),
            (ContactCreate, dict(full_name="Host", email="test@example.com", phone="123"), ("full_name", "phone")),
            (ContactUpdate, {}, ("full_name", "phone")),
            (VisitorCreate, dict(visitor_full_name="Visitor", visitor_id_number="ID"), ("visitor_full_name", "visitor_id_number")),
            (VisitorAccessCreate, dict(company_id="00000000-0000-0000-0000-000000000001", visit_date="2026-11-03", expected_arrival_time="09:00", expected_departure_time="17:00", visit_reason="Reason", host_contact_name="Host", visitors=[dict(visitor_full_name="Visitor", visitor_id_number="ID")]), ("visit_reason", "host_contact_name")),
        )

    def test_business_strings_are_trimmed_without_changing_internal_whitespace(self):
        for schema, data, fields in self.cases():
            for field in fields:
                with self.subTest(schema=schema.__name__, field=field):
                    result = schema.model_validate(data | {field: " \tAlpha  Beta\n "})
                    self.assertEqual(getattr(result, field), "Alpha  Beta")

    def test_business_strings_reject_whitespace_only_values(self):
        for schema, data, fields in self.cases():
            for field in fields:
                with self.subTest(schema=schema.__name__, field=field):
                    with self.assertRaises(ValidationError):
                        schema.model_validate(data | {field: " \t\n "})

    def test_length_limits_apply_after_outer_trim_without_truncation(self):
        visitor = VisitorCreate.model_validate({"visitor_full_name": " " + "X" * 255 + " ", "visitor_id_number": " ID "})
        self.assertEqual(visitor.visitor_full_name, "X" * 255)
        with self.assertRaises(ValidationError):
            VisitorCreate.model_validate({"visitor_full_name": "X" * 256, "visitor_id_number": "ID"})

    def test_response_schemas_preserve_historical_outer_whitespace(self):
        from datetime import datetime, timezone
        from uuid import uuid4
        from app.modules.companies.schemas import CompanyResponse
        from app.modules.contacts.schemas import ContactResponse
        now = datetime.now(timezone.utc)
        company = CompanyResponse.model_validate(dict(id=uuid4(), name="  Historical company  ", created_at=now, updated_at=now))
        contact = ContactResponse.model_validate(dict(id=uuid4(), company_id=company.id, full_name=" \tHistorical host\n ", created_at=now, updated_at=now))
        self.assertEqual(company.name, "  Historical company  ")
        self.assertEqual(contact.full_name, " \tHistorical host\n ")
