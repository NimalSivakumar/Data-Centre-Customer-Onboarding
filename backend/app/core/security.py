from functools import lru_cache
import json
import logging
from typing import Any
from urllib.request import urlopen

from fastapi import HTTPException, status
from jose import JWTError, jwt

from app.core.config import settings

logger = logging.getLogger("uvicorn.error")


@lru_cache(maxsize=1)
def get_entra_jwks() -> dict[str, Any]:
    with urlopen(settings.entra_jwks_url, timeout=10) as response:
        return json.loads(response.read().decode("utf-8"))


def decode_entra_token(token: str) -> dict[str, Any]:
    try:
        header = jwt.get_unverified_header(token)
        kid = header.get("kid")
        unverified_claims = jwt.get_unverified_claims(token)
        key = next((key for key in get_entra_jwks().get("keys", []) if key.get("kid") == kid), None)
        if not key:
            get_entra_jwks.cache_clear()
            key = next((key for key in get_entra_jwks().get("keys", []) if key.get("kid") == kid), None)
        if not key:
            logger.warning("Entra token signing key not found: kid=%s", kid)
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Could not validate credentials")
        payload = jwt.decode(
            token,
            key,
            algorithms=["RS256"],
            audience=settings.entra_expected_audience,
            options={"verify_iss": False},
        )
        issuer = payload.get("iss")
        if issuer not in settings.entra_allowed_issuers:
            logger.warning("Entra token issuer not allowed: iss=%s", issuer)
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Could not validate credentials")
        if payload.get("tid") != settings.entra_tenant_id:
            logger.warning("Entra token tenant not allowed: tid=%s", payload.get("tid"))
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Could not validate credentials")
        if settings.entra_token_version and payload.get("ver") != settings.entra_token_version:
            logger.warning("Entra token version not allowed: ver=%s", payload.get("ver"))
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Could not validate credentials")
        scopes = set(str(payload.get("scp") or "").split())
        if settings.entra_required_scope not in scopes:
            logger.warning("Entra token missing required scope: scp=%s", payload.get("scp"))
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing required API scope")
        allowed_clients = settings.entra_allowed_client_ids_set
        token_client = payload.get("azp") or payload.get("appid")
        if allowed_clients and token_client not in allowed_clients:
            logger.warning("Entra token client not allowed: client=%s", token_client)
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Could not validate credentials")
        if not isinstance(payload.get("oid"), str):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing Entra object id")
        if not isinstance(payload.get("tid"), str):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing Entra tenant id")
        return payload
    except JWTError as exc:
        logger.warning(
            "Entra token validation failed: %s; iss=%s aud=%s scp=%s tid=%s",
            exc,
            unverified_claims.get("iss") if "unverified_claims" in locals() else None,
            unverified_claims.get("aud") if "unverified_claims" in locals() else None,
            unverified_claims.get("scp") if "unverified_claims" in locals() else None,
            unverified_claims.get("tid") if "unverified_claims" in locals() else None,
        )
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Could not validate credentials") from exc
    except (StopIteration, OSError, json.JSONDecodeError) as exc:
        logger.warning("Entra token metadata lookup failed: %s", exc)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Could not validate credentials") from exc
