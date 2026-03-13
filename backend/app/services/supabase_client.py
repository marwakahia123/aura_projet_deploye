"""Factory for creating authenticated Supabase clients."""

from supabase import create_client, Client

from app.config import get_settings


def get_supabase_client(user_token: str | None = None) -> Client:
    """Create a Supabase client, optionally authenticated with a user JWT.

    If user_token is provided, all queries will go through RLS as that user.
    Otherwise, uses the anon key (limited access).
    """
    settings = get_settings()
    client = create_client(settings.SUPABASE_URL, settings.SUPABASE_ANON_KEY)

    if user_token:
        client.auth.set_session(access_token=user_token, refresh_token="")

    return client
