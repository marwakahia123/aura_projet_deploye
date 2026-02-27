import logging
from urllib.parse import quote

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from app.config import get_settings
from app.schemas import ChatRequest
from app.services.llm_service import get_response
from app.services.tts_service import stream_tts

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/api/chat")
async def chat(request: ChatRequest):
    settings = get_settings()

    logger.info("Chat request: command='%s', context_segments=%d", request.command[:80], len(request.context))

    if not settings.AURA_AGENT_URL or not settings.AURA_AGENT_TOKEN:
        raise HTTPException(status_code=500, detail="AURA_AGENT_URL/TOKEN not configured")

    # 1. Get response from colleague's agent
    try:
        response_text = await get_response(
            command=request.command,
            context=request.context,
            agent_url=settings.AURA_AGENT_URL,
            agent_token=settings.AURA_AGENT_TOKEN,
        )
        logger.info("Agent responded: '%s'", response_text[:100])
    except Exception as e:
        logger.error("Agent error: %s: %s", type(e).__name__, e)
        raise HTTPException(status_code=502, detail=f"Agent error: {type(e).__name__}: {e}")

    # 2. If TTS not configured, return text only
    if not settings.ELEVENLABS_API_KEY or not settings.ELEVENLABS_VOICE_ID:
        return {"text": response_text, "audio": False}

    # 3. Stream TTS audio
    encoded_text = quote(response_text, safe="")

    return StreamingResponse(
        stream_tts(
            text=response_text,
            voice_id=settings.ELEVENLABS_VOICE_ID,
            api_key=settings.ELEVENLABS_API_KEY,
        ),
        media_type="audio/mpeg",
        headers={
            "X-Response-Text": encoded_text,
            "Access-Control-Expose-Headers": "X-Response-Text",
        },
    )
