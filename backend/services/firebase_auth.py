import os

from fastapi import Header, HTTPException
from google.auth.exceptions import TransportError
from google.auth.transport.requests import Request
from google.oauth2.id_token import verify_firebase_token


def require_firebase_user(authorization: str | None = Header(default=None)) -> str:
    scheme, separator, token = (authorization or "").partition(" ")
    if not separator or scheme.casefold() != "bearer" or not token.strip():
        raise HTTPException(status_code=401, detail="A Firebase ID token is required.")

    project_id = os.getenv("FIREBASE_PROJECT_ID", "").strip()
    if not project_id:
        raise HTTPException(status_code=503, detail="FIREBASE_PROJECT_ID is not configured on the backend.")

    try:
        claims = verify_firebase_token(token.strip(), Request(), audience=project_id)
    except ValueError as error:
        raise HTTPException(status_code=401, detail="The Firebase ID token is invalid or expired.") from error
    except TransportError as error:
        raise HTTPException(status_code=503, detail="Firebase token verification is temporarily unavailable.") from error

    user_id = claims.get("user_id") or claims.get("sub")
    if not isinstance(user_id, str) or not user_id:
        raise HTTPException(status_code=401, detail="The Firebase ID token has no user identity.")
    return user_id
