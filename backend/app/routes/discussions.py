import logging

from fastapi import APIRouter, HTTPException, Request

from app.services.supabase_client import get_supabase_client

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/api/discussions")
async def list_discussions(
    raw_request: Request,
    limit: int = 20,
    offset: int = 0,
    search: str | None = None,
):
    """Fetch conversation/session list from listening_sessions."""
    auth_header = raw_request.headers.get("authorization", "")
    user_token = auth_header.removeprefix("Bearer ").strip() if auth_header.startswith("Bearer ") else None

    if not user_token:
        raise HTTPException(status_code=401, detail="Authorization required")

    try:
        supabase = get_supabase_client(user_token)
        query = (
            supabase.table("listening_sessions")
            .select("id, started_at, ended_at, status, summary, segment_count")
            .order("started_at", desc=True)
            .range(offset, offset + limit - 1)
        )

        if search:
            query = query.ilike("summary", f"%{search}%")

        response = query.execute()
        return {"discussions": response.data}
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error fetching discussions: %s: %s", type(e).__name__, e)
        raise HTTPException(status_code=500, detail=f"Failed to fetch discussions: {e}")
