"""
Radar 1.2 Backend Server

Usage:
    cd backend
    python server.py
"""

import os
from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from chat.chat import router as chat_router
from api import router as api_router

app = FastAPI(title="Radar 1.2 API", version="1.2.0")

# CORS: allow local dev + Vercel production
CORS_ORIGINS = os.getenv("CORS_ORIGINS", "http://localhost:5173,http://localhost:3000,http://127.0.0.1:5173")
origins = [o.strip() for o in CORS_ORIGINS.split(",")]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(chat_router)
app.include_router(api_router)


@app.get("/")
async def root():
    return {
        "name": "Radar 1.2 API",
        "version": "1.2.0",
        "endpoints": {
            "chat_stream": "POST /api/demo/chat/stream",
            "chat_health": "GET /api/demo/chat/health",
            "upload": "POST /api/demo/upload",
            "result": "GET /api/demo/result/{result_id}",
        },
    }


if __name__ == "__main__":
    import uvicorn
    print("Starting Radar 1.2 API on http://localhost:8002")
    uvicorn.run(app, host="0.0.0.0", port=8002)
