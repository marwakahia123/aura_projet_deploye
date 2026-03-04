import logging

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
    """Step 1: Send command to agent → returns text response."""
    settings = get_settings()

    if not settings.AURA_AGENT_URL or not settings.AURA_AGENT_TOKEN:
        raise HTTPException(status_code=500, detail="AURA_AGENT_URL/TOKEN not configured")

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

    return {"text": response_text}


@router.post("/api/tts")
async def tts(request: dict):
    """Step 2: Convert text to speech → streams MP3 audio."""
    settings = get_settings()
    text = request.get("text", "")

    if not text:
        raise HTTPException(status_code=400, detail="No text provided")

    if not settings.ELEVENLABS_API_KEY or not settings.ELEVENLABS_VOICE_ID:
        raise HTTPException(status_code=500, detail="TTS not configured")

    try:
        return StreamingResponse(
            stream_tts(
                text=text,
                voice_id=settings.ELEVENLABS_VOICE_ID,
                api_key=settings.ELEVENLABS_API_KEY,
            ),
            media_type="audio/mpeg",
        )
    except Exception as e:
        logger.error("TTS error: %s: %s", type(e).__name__, e)
        raise HTTPException(status_code=502, detail=f"TTS error: {e}")
