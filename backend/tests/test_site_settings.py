from types import SimpleNamespace
from unittest import TestCase
from unittest.mock import patch

from pydantic import ValidationError

from app.core.config import Settings
from app.modules.auth.router import get_site_settings, router


class SiteSettingsTests(TestCase):
    def settings(self, **values):
        return Settings(
            _env_file=None, database_url="postgresql+psycopg://test:test@localhost/test",
            entra_tenant_id="test", entra_client_id="test", **values,
        )

    def test_site_location_and_timezone_can_be_configured(self):
        settings = self.settings(site_location="  Another test site  ", site_timezone="UTC")
        self.assertEqual(settings.site_location, "Another test site")
        self.assertEqual(settings.site_timezone, "UTC")

    def test_invalid_site_configuration_is_rejected(self):
        for values in ({"site_location": "   "}, {"site_timezone": "Invalid/Zone"}):
            with self.subTest(values=values), self.assertRaises(ValidationError):
                self.settings(**values)

    def test_endpoint_exposes_only_non_secret_site_configuration(self):
        configuration = SimpleNamespace(site_timezone="UTC", site_location="Test site", database_url="PRIVATE", entra_client_id="PRIVATE")
        with patch("app.modules.auth.router.settings", configuration):
            response = get_site_settings(_=object())
        self.assertEqual(response.model_dump(), {"site_timezone": "UTC", "site_location": "Test site"})
        self.assertNotIn("PRIVATE", response.model_dump_json())

    def test_site_settings_endpoint_requires_authentication(self):
        route = next(route for route in router.routes if route.path == "/site-settings")
        self.assertTrue(any(item.name == "_" for item in route.dependant.dependencies))
