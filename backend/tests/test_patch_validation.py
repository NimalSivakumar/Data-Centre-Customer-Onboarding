from unittest import TestCase
from pydantic import ValidationError
from app.modules.companies.schemas import CompanyUpdate
from app.modules.contacts.schemas import ContactUpdate


class PatchValidationTests(TestCase):
    def test_required_columns_reject_explicit_null_but_allow_omission(self):
        for schema, fields in (
            (CompanyUpdate, ("name", "status")),
            (ContactUpdate, ("full_name", "contact_type", "is_primary", "status")),
        ):
            self.assertEqual(schema().model_dump(exclude_unset=True), {})
            for field in fields:
                with self.subTest(schema=schema.__name__, field=field):
                    with self.assertRaisesRegex(ValidationError, field + " must not be null"):
                        schema(**{field: None})

    def test_nullable_columns_can_still_be_explicitly_cleared(self):
        for schema, fields in (
            (CompanyUpdate, ("customer_code", "registration_number", "address", "main_email", "main_phone", "notes")),
            (ContactUpdate, ("email", "phone", "job_title")),
        ):
            data = dict.fromkeys(fields)
            self.assertEqual(schema(**data).model_dump(exclude_unset=True), data)
