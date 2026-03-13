import logging

import httpx

from app.schemas import TranscriptionSegment

logger = logging.getLogger(__name__)


def _build_context_string(context: list[TranscriptionSegment]) -> str:
    if not context:
        return ""
    lines = []
    for seg in context:
        lines.append(seg.text)
    return " ".join(lines)


async def get_response(
    command: str,
    context: list[TranscriptionSegment],
    agent_url: str,
    agent_token: str,
    user_token: str | None = None,
    enriched_context: str | None = None,
) -> str:
    # Use enriched context if provided (from context_service), else build from segments
    context_string = enriched_context if enriched_context else _build_context_string(context)

    logger.info("Calling agent: command=%s, context_len=%d, has_user_token=%s",
                command[:80], len(context_string), bool(user_token))

    # Build headers: user JWT for Authorization (RLS), anon key as apikey (Supabase requirement)
    headers: dict[str, str] = {"Content-Type": "application/json"}
    if user_token:
        headers["Authorization"] = f"Bearer {user_token}"
        headers["apikey"] = agent_token
    else:
        headers["Authorization"] = f"Bearer {agent_token}"

    async with httpx.AsyncClient(timeout=120.0) as client:
        response = await client.post(
            agent_url,
            headers=headers,
            json={
                "message": command,
                "context": context_string,
            },
        )
        logger.info("Agent HTTP status: %d", response.status_code)
        if response.status_code >= 400:
            logger.error("Agent error body: %s", response.text[:500])
        response.raise_for_status()
        data = response.json()
        logger.info("Agent response keys: %s", list(data.keys()))
        return data["response"]
