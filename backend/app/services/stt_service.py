import httpx


async def create_stt_token(api_key: str) -> str:
    async with httpx.AsyncClient() as client:
        response = await client.post(
            "https://api.elevenlabs.io/v1/single-use-token/realtime_scribe",
            headers={"xi-api-key": api_key},
            json={},
        )
        response.raise_for_status()
        return response.json()["token"]
