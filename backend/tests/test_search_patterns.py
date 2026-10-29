from datetime import date
from unittest import TestCase
from unittest.mock import MagicMock

from sqlalchemy.dialects import postgresql
from sqlalchemy.sql import operators, visitors
from sqlalchemy.sql.elements import BinaryExpression

from app.modules.companies.service import list_companies
from app.modules.requests.service import list_requests
from app.modules.security_portal.service import list_security_visitors
from app.shared.search import contains_pattern


class SearchPatternTests(TestCase):
    def setUp(self):
        self.db = MagicMock()
        self.db.scalar.return_value = 0
        self.db.scalars.return_value.all.return_value = []
        self.db.scalars.return_value.unique.return_value.all.return_value = []

    def assert_search(self, query, expected_pattern, field_count):
        matches = [
            expression for expression in visitors.iterate(query)
            if isinstance(expression, BinaryExpression) and expression.operator is operators.ilike_op
        ]
        self.assertEqual(len(matches), field_count)
        for expression in matches:
            self.assertEqual(expression.right.value, expected_pattern)
            self.assertEqual(expression.modifiers["escape"], "\\")
        compiled = query.compile(dialect=postgresql.dialect())
        self.assertIn(expected_pattern, compiled.params.values())
        self.assertIn("ESCAPE", str(compiled))

    def test_ordinary_search_keeps_contains_matching(self):
        self.assertEqual(contains_pattern("Example"), "%Example%")

    def test_percent_underscore_and_backslash_are_escaped(self):
        cases = (
            ("50%", r"%50\%%"),
            ("ABC_01", r"%ABC\_01%"),
            ("folder\\file", "%folder\\\\file%"),
            ("\\%_", "%\\\\\\%\\_%"),
        )
        for value, expected in cases:
            with self.subTest(value=value):
                self.assertEqual(contains_pattern(value), expected)

    def test_company_count_and_list_use_identical_literal_search(self):
        list_companies(self.db, q="ABC_01%")
        self.assert_search(self.db.scalar.call_args.args[0], r"%ABC\_01\%%", 3)
        self.assert_search(self.db.scalars.call_args.args[0], r"%ABC\_01\%%", 3)

    def test_request_count_and_list_use_identical_literal_search(self):
        list_requests(self.db, q="ABC_01%")
        self.assert_search(self.db.scalar.call_args.args[0], r"%ABC\_01\%%", 5)
        self.assert_search(self.db.scalars.call_args.args[0], r"%ABC\_01\%%", 5)

    def test_security_list_uses_literal_search_for_every_search_field(self):
        list_security_visitors(self.db, visit_date=date(2026, 10, 29), q="ABC_01%")
        self.assert_search(self.db.scalars.call_args.args[0], r"%ABC\_01\%%", 4)

    def test_empty_search_does_not_add_search_filters(self):
        for list_function in (list_companies, list_requests):
            with self.subTest(list_function=list_function.__name__):
                list_function(self.db, q="")
                query = self.db.scalars.call_args.args[0]
                self.assertFalse(any(
                    isinstance(expression, BinaryExpression) and expression.operator is operators.ilike_op
                    for expression in visitors.iterate(query)
                ))
