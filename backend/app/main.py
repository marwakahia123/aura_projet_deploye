from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routes import chat, health, stt_token, wakeword

app = FastAPI(title="AURA POC Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001", "http://localhost:3002"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

app.include_router(health.router)
app.include_router(stt_token.router)
app.include_router(chat.router)
app.include_router(wakeword.router)
