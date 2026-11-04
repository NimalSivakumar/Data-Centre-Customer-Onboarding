from datetime import datetime, timezone
from types import SimpleNamespace
from typing import Any
from unittest import TestCase
from unittest.mock import Mock, patch

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi import HTTPException
from jose import jwk, jwt

from app.core import security


class EntraTokenDecoderTests(TestCase):
    @classmethod
    def setUpClass(cls):
        private = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        cls.private_pem = private.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption())
        public_pem = private.public_key().public_bytes(serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo)
        cls.public_jwk = jwk.construct(public_pem, algorithm="RS256").to_dict() | {"kid": "synthetic-key"}

    def setUp(self):
        now = int(datetime.now(timezone.utc).timestamp())
        self.claims: dict[str, Any] = dict(aud="synthetic-audience", iss="synthetic-issuer", tid="synthetic-tenant", oid="synthetic-object", ver="2.0", scp="access_as_user", azp="synthetic-client", roles=["OPS"], exp=now + 3600, nbf=now - 60)
        settings = SimpleNamespace(entra_expected_audience="synthetic-audience", entra_allowed_issuers={"synthetic-issuer"}, entra_tenant_id="synthetic-tenant", entra_token_version="2.0", entra_required_scope="access_as_user", entra_allowed_client_ids_set={"synthetic-client"})
        self.jwks = Mock(return_value={"keys": [self.public_jwk]})
        for name, value in (("settings", settings), ("get_entra_jwks", self.jwks), ("urlopen", Mock(side_effect=AssertionError("Network forbidden"))), ("logger", Mock())):
            patcher = patch.object(security, name, value)
            patcher.start()
            self.addCleanup(patcher.stop)

    def token(self, claims=None, **kwargs):
        return jwt.encode(self.claims if claims is None else claims, self.private_pem, algorithm="RS256", headers={"kid": "synthetic-key"}, **kwargs)

    def assert_rejected(self, token):
        with self.assertRaises(HTTPException) as caught:
            security.decode_entra_token(token)
        self.assertEqual(caught.exception.status_code, 401)

    def test_missing_expiry_is_rejected_with_real_signature_verification(self):
        claims = self.claims.copy()
        claims.pop("exp")
        self.assert_rejected(self.token(claims))

    def test_valid_signed_token_is_accepted(self):
        self.assertEqual(security.decode_entra_token(self.token()), self.claims)

    def test_invalid_expiry_values_are_rejected_as_401_not_server_errors(self):
        for value in (None, [], {}, True, "not-a-number", str(self.claims["exp"]), float(self.claims["exp"]), float("inf"), float("nan"), 10**100):
            with self.subTest(value_type=type(value).__name__):
                self.assert_rejected(self.token(self.claims | {"exp": value}))

    def test_expired_and_not_yet_valid_tokens_are_rejected(self):
        self.assert_rejected(self.token(self.claims | {"exp": 1}))
        self.assert_rejected(self.token(self.claims | {"nbf": self.claims["exp"]}))

    def test_wrong_contract_claims_are_rejected(self):
        for field, value in (("aud", "wrong"), ("iss", "wrong"), ("tid", "wrong"), ("ver", "1.0"), ("scp", "other_scope"), ("azp", "wrong")):
            with self.subTest(field=field):
                self.assert_rejected(self.token(self.claims | {field: value}))

    def test_invalid_signature_and_algorithm_are_rejected(self):
        other = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        other_pem = other.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption())
        self.assert_rejected(jwt.encode(self.claims, other_pem, algorithm="RS256", headers={"kid": "synthetic-key"}))
        self.assert_rejected(jwt.encode(self.claims, "synthetic-hmac-only-test-key", algorithm="HS256", headers={"kid": "synthetic-key"}))

    def test_unknown_key_refetches_once_then_fails_closed(self):
        self.jwks.return_value = {"keys": []}
        self.assert_rejected(self.token())
        self.assertEqual(self.jwks.call_count, 2)
        self.jwks.cache_clear.assert_called_once()

    def test_key_rotation_refetch_accepts_the_new_trusted_key(self):
        self.jwks.side_effect = [{"keys": []}, {"keys": [self.public_jwk]}]
        self.assertEqual(security.decode_entra_token(self.token()), self.claims)
        self.jwks.cache_clear.assert_called_once()

    def test_metadata_failure_is_401_without_network(self):
        self.jwks.side_effect = OSError("Synthetic metadata failure")
        self.assert_rejected(self.token())

    def test_nbf_is_optional_but_verified_when_present(self):
        claims = self.claims.copy()
        claims.pop("nbf")
        self.assertEqual(security.decode_entra_token(self.token(claims)), claims)
