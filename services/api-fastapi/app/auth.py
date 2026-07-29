from dataclasses import dataclass

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.deps import get_supabase

bearer_scheme = HTTPBearer(auto_error=False)


@dataclass
class CurrentUser:
    id: str
    role: str
    branch_id: str | None


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> CurrentUser:
    """Validates the caller's Supabase-issued JWT and loads their role/branch.

    Delegates token verification to Supabase Auth itself (rather than
    re-implementing JWKS/signature checks) so expiry, revocation, and
    signature validation stay centralized in the one place that issues
    these tokens.
    """
    if credentials is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing bearer token")

    supabase = get_supabase()
    try:
        auth_response = supabase.auth.get_user(credentials.credentials)
    except Exception:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")

    if not auth_response or not auth_response.user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")

    user_id = auth_response.user.id

    profile_result = (
        supabase.table("profiles").select("role, branch_id").eq("id", user_id).single().execute()
    )
    if not profile_result.data:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No profile for this account")

    return CurrentUser(
        id=user_id,
        role=profile_result.data["role"],
        branch_id=profile_result.data["branch_id"],
    )


def require_branch_access(user: CurrentUser, branch_id: str) -> None:
    """Executives can act on any branch; everyone else only their own."""
    if user.role == "executive":
        return
    if user.branch_id != branch_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized for this branch",
        )
