import jwt
from jwt import PyJWKClient
from fastapi import Depends, HTTPException, Request
from .config import settings

VALID_ROLES = {"ENTRY","PRINTING","LAMINATING","LASER_CUTTING","BINDING","ADMIN"}
PUBLIC_PREFIXES = ("/api/track/", "/api/health")

_jwks = PyJWKClient(settings.CLERK_JWKS_URL, cache_keys=True) if settings.CLERK_JWKS_URL else None


def get_current_user(request: Request):
    path = request.url.path
    # CORS preflight, static files / SPA, and public endpoints skip auth
    if (request.method == "OPTIONS" or not path.startswith("/api/")
            or path.startswith(PUBLIC_PREFIXES)):
        return None

    if _jwks is None:
        raise HTTPException(500, "Auth is not configured on the server.")

    header = request.headers.get("authorization", "")
    if not header.lower().startswith("bearer "):
        raise HTTPException(401, "Not authenticated")
    token = header[7:]

    try:
        key = _jwks.get_signing_key_from_jwt(token).key
        claims = jwt.decode(
            token, key, algorithms=["RS256"],
            issuer=settings.CLERK_ISSUER,
            options={"verify_aud": False},
            leeway=10,
        )
    except Exception:
        raise HTTPException(401, "Invalid or expired session")

    azp = claims.get("azp")
    if settings.CLERK_AUTHORIZED_PARTIES and azp not in settings.CLERK_AUTHORIZED_PARTIES:
        raise HTTPException(401, "Invalid token origin")

    role = str(claims.get("role") or "").upper()
    if role not in VALID_ROLES:
        raise HTTPException(403, "No department role assigned")

    return {"id": claims["sub"], "role": role}


def require_roles(*roles: str):
    def dep(user=Depends(get_current_user)):
        if user is None or user["role"] not in roles:
            raise HTTPException(403, "You don't have permission for this action")
        return user
    return dep