from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routes import activity, chat, contacts, discussions, health, stt_token, summaries, wakeword

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
app.include_router(summaries.router)
app.include_router(contacts.router)
app.include_router(activity.router)
app.include_router(discussions.router)
