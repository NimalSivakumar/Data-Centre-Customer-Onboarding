from datetime import date, datetime, time, timezone
from types import SimpleNamespace
from unittest import TestCase
from unittest.mock import MagicMock, patch
from uuid import uuid4

from app.modules.security_portal import router as routes
from app.modules.security_portal.schemas import CheckInRequest, SecurityActionRequest, SecurityVisitorResponse
from app.modules.security_portal.service import list_security_visitors, to_security_visitor_response


ALLOWED_FIELDS = {
    "visitor_access_id", "visit_date", "visitor_full_name", "visitor_id_number",
    "request_number", "visit_status", "expected_arrival_time", "expected_departure_time",
    "customer_company_name", "equipment_carried", "checked_in_at", "checked_out_at",
}


class SecurityVisitorPrivacyTests(TestCase):
    def setUp(self):
        self.day = date(2026, 10, 29)
        self.visitor = SimpleNamespace(
            id=uuid4(), request_id=uuid4(), visit_date=self.day,
            expected_arrival_time=time(9), expected_departure_time=time(17),
            visitor_full_name="Test visitor", visitor_id_number="TEST-NIN",
            equipment_carried="Laptop", visit_status="CHECKED_OUT",
            checked_in_at=datetime(2026, 10, 29, 5, tzinfo=timezone.utc),
            checked_out_at=datetime(2026, 10, 29, 13, tzinfo=timezone.utc),
            visitor_phone="PRIVATE-PHONE", visitor_email="PRIVATE-EMAIL",
            visitor_address="PRIVATE-ADDRESS", visitor_company="PRIVATE-EMPLOYER",
            vehicle_registration="PRIVATE-VEHICLE", special_instructions="PRIVATE-INSTRUCTIONS",
            host_contact_name="PRIVATE-HOST", site_location="PRIVATE-SITE",
            security_notes="PRIVATE-NOTES",
            request=SimpleNamespace(
                id=uuid4(), request_number="REQ-TEST", status="APPROVED",
                company_id=uuid4(), description="PRIVATE-PURPOSE",
                company=SimpleNamespace(name="Test customer"),
            ),
        )
        self.db = MagicMock()

    def assert_minimized(self, response):
        self.assertEqual(set(response.model_dump()), ALLOWED_FIELDS)
        self.assertNotIn("PRIVATE-", response.model_dump_json())
        self.assertEqual(response.visitor_id_number, "TEST-NIN")
        self.assertEqual(response.customer_company_name, "Test customer")

    def test_schema_only_has_owner_approved_fields_and_operational_metadata(self):
        self.assertEqual(set(SecurityVisitorResponse.model_fields), ALLOWED_FIELDS)

    def test_mapper_excludes_private_data_from_serialized_response(self):
        response = to_security_visitor_response(self.visitor)
        self.assert_minimized(response)
        self.assertEqual(response.request_number, "REQ-TEST")
        self.assertEqual(response.equipment_carried, "Laptop")

    def test_nullable_fields_remain_supported(self):
        self.visitor.request.company = None
        self.visitor.equipment_carried = None
        self.visitor.checked_in_at = None
        self.visitor.checked_out_at = None
        response = to_security_visitor_response(self.visitor)
        self.assertIsNone(response.customer_company_name)
        self.assertIsNone(response.equipment_carried)
        self.assertIsNone(response.checked_in_at)
        self.assertIsNone(response.checked_out_at)

    def test_list_route_returns_minimized_records(self):
        with patch("app.modules.security_portal.router.list_security_visitors", return_value=[self.visitor]):
            responses = routes.get_visitors(date_filter=self.day, status_filter=None, db=self.db, _=object())
        self.assert_minimized(responses[0])

    def test_detail_route_returns_minimized_record(self):
        with patch("app.modules.security_portal.router.get_visible_security_visitor", return_value=self.visitor):
            response = routes.get_visitor_detail(self.visitor.id, db=self.db, _=object())
        self.assert_minimized(response)

    def test_every_mutation_response_is_also_minimized(self):
        cases = (
            (routes.post_check_in, "check_in_visitor", CheckInRequest(identity_verified=True)),
            (routes.post_check_out, "check_out_visitor", SecurityActionRequest()),
            (routes.post_deny_entry, "deny_visitor_entry", SecurityActionRequest(security_notes="Test reason")),
        )
        for endpoint, service_name, payload in cases:
            with self.subTest(action=service_name), patch(
                "app.modules.security_portal.router.get_security_visitor_for_update", return_value=self.visitor,
            ), patch(f"app.modules.security_portal.router.{service_name}", return_value=self.visitor):
                response = endpoint(self.visitor.id, payload, db=self.db, current_user=object())
                self.assert_minimized(response)

    def test_search_does_not_use_hidden_employer_or_contact_fields(self):
        self.db.scalars.return_value.all.return_value = []
        list_security_visitors(self.db, self.day, q="TEST")
        where = str(self.db.scalars.call_args.args[0].whereclause)
        self.assertIn("requests.request_number", where)
        for hidden in ("visitor_company", "visitor_phone", "visitor_email", "visitor_address"):
            self.assertNotIn(hidden, where)
