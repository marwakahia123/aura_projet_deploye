from datetime import datetime
from pydantic import BaseModel


class TranscriptionSegment(BaseModel):
    text: str
    timestamp: datetime
    is_partial: bool = False


class ChatRequest(BaseModel):
    command: str
    context: list[TranscriptionSegment] = []


class ChatResponse(BaseModel):
    text: str
