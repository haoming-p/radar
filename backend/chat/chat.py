"""
Chat API for Patent Analysis Chatbot

Provides AI-powered analysis of patent data using OpenAI.
Supports streaming, conversation history, and free-text questions.

API Endpoints:
    POST /api/demo/chat/stream   - Streaming chat (SSE response)
    GET  /api/demo/chat/health   - Health check
"""

import os
import json
from pathlib import Path
from typing import Optional, List

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from openai import OpenAI

# ============ CONFIGURATION ============

MODEL = "gpt-4o-mini"

BACKEND_DIR = Path(__file__).parent.parent
CACHE_DIR = BACKEND_DIR / "cache"

# ============ ROUTER ============

router = APIRouter()

# ============ MODELS ============

class HistoryMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    message: str
    company: str = "The Boeing Company"
    action: Optional[str] = None
    history: List[HistoryMessage] = []
    result_id: Optional[str] = None


# ============ PROMPTS ============

SYSTEM_PROMPT = """You are a patent analysis expert helping users understand competitive landscapes.

You have access to a patent dataset with the following information:
- Total patents and time range
- Technology areas (clusters of related patents)
- Topics (higher-level groupings)
- Top players (companies) with their patent counts, trends, and focus areas

Guidelines:
- Be specific and data-driven. Use actual numbers and company names from the data.
- Keep responses concise but insightful.
- Use bullet points for clarity when listing multiple items.
- Do not use emojis.
- Do not use markdown headers (no # or ##). Use bold text for emphasis instead.
- When asked follow-up questions, refer to the conversation context.
"""

ACTION_PROMPTS = {
    "competitive-position": """Analyze {company}'s competitive position in this patent landscape.

Include:
1. Overall ranking and patent count
2. Key technology areas where they're strongest (top 3-5 areas by patent count)
3. Growth trend (is their patent activity increasing or decreasing?)
4. How they compare to top competitors

Be specific with numbers and area names.""",

    "key-takeaways": """Provide key takeaways about the overall patent landscape.

Include:
1. Total market size and growth trends
2. Hottest technology areas (growing categories)
3. Dominant players and their strategies
4. Notable patterns or shifts in the data

Focus on actionable insights, not just data description.""",

    "white-space": """Identify white space opportunities for {company}.

Include:
1. Growing areas where {company} has LOW presence but competitors are active
2. Niche areas with few patents overall (potential first-mover advantage)
3. Technology combinations that are underexplored
4. Specific recommendations for where to file new patents

Compare {company}'s area distribution to competitors.""",

    "competitor-threats": """Analyze competitive threats to {company}.

Include:
1. Companies with rapidly growing patent portfolios (high trend values)
2. Areas where competitors are gaining ground vs {company}
3. New entrants or unexpected players
4. Specific areas where {company} may be losing competitive advantage

Quantify threats with patent counts and trend data.""",
}


# ============ DATA LOADING ============

_cached_data = {}


def load_result_data(result_id: Optional[str] = None) -> dict:
    """Load result data from cache. If result_id given, load that specific result."""
    if result_id and result_id in _cached_data:
        return _cached_data[result_id]

    if result_id:
        result_path = CACHE_DIR / f"result_{result_id}.json"
        if result_path.exists():
            with open(result_path, 'r') as f:
                data = json.load(f)
            _cached_data[result_id] = data
            return data

    # Fallback: find most recent result file
    if CACHE_DIR.exists():
        result_files = sorted(CACHE_DIR.glob("result_*.json"), key=lambda p: p.stat().st_mtime, reverse=True)
        if result_files:
            with open(result_files[0], 'r') as f:
                data = json.load(f)
            return data

    raise HTTPException(status_code=500, detail="No analysis data available. Please upload and analyze a dataset first.")


def build_context(data: dict, company: str) -> str:
    stats = data.get("stats", {})
    areas = data.get("areas", {})
    topics = data.get("topics", {})
    players = data.get("players", {})
    categories = data.get("categories", {})

    context_parts = []

    context_parts.append(f"""Dataset Overview:
- Total Patents: {stats.get('total_patents', 'N/A')}
- Total Areas: {stats.get('total_areas', 'N/A')}
- Total Topics: {stats.get('total_topics', 'N/A')}
- Top Players Tracked: {stats.get('total_players', 'N/A')}
""")

    context_parts.append("Market Categories:")
    for cat_name, cat_info in categories.items():
        context_parts.append(f"- {cat_info.get('label', cat_name)}: {cat_info.get('count', 0)} areas - {cat_info.get('description', '')}")
    context_parts.append("")

    context_parts.append("Technology Topics:")
    for topic_id, topic_info in topics.items():
        if int(topic_id) == -1:
            continue
        label = topic_info.get('label', '')[:80]
        total = topic_info.get('totalPatents', 0)
        area_count = topic_info.get('areaCount', 0)
        context_parts.append(f"- Topic {topic_id}: {label} ({total} patents, {area_count} areas)")
    context_parts.append("")

    context_parts.append("Top Areas by Category:")
    areas_by_cat = {"growing": [], "sparse": [], "major": [], "avoid": []}
    for area_id, area_info in areas.items():
        cat = area_info.get("category", "avoid")
        areas_by_cat[cat].append({
            "id": area_id,
            "label": area_info.get("label", "")[:60],
            "count": area_info.get("count", 0),
            "trend": area_info.get("trend", 1.0),
        })

    for cat in ["growing", "sparse", "major", "avoid"]:
        cat_areas = sorted(areas_by_cat[cat], key=lambda x: x["count"], reverse=True)[:10]
        if cat_areas:
            context_parts.append(f"\n{cat.title()} Areas (top 10):")
            for area in cat_areas:
                context_parts.append(f"- Area {area['id']}: {area['label']} ({area['count']} patents, trend: {area['trend']:.2f})")
    context_parts.append("")

    context_parts.append("Top Players:")
    sorted_players = sorted(players.items(), key=lambda x: x[1].get('total', 0), reverse=True)

    for player_name, player_info in sorted_players[:20]:
        total = player_info.get('total', 0)
        rank = player_info.get('rank', 'N/A')
        trend = player_info.get('trend', 1.0)

        player_areas = player_info.get('areas', {})
        top_areas = sorted(player_areas.items(), key=lambda x: x[1], reverse=True)[:5]
        top_areas_str = ", ".join([f"Area {a[0]}({a[1]})" for a in top_areas])

        marker = " [FOCUS COMPANY]" if player_name == company else ""
        context_parts.append(f"- #{rank} {player_name}{marker}: {total} patents, trend: {trend:.2f}")
        context_parts.append(f"  Top areas: {top_areas_str}")

    if company in players:
        context_parts.append(f"\nFocus Company Detail: {company}")
        player_info = players[company]
        context_parts.append(f"- Total Patents: {player_info.get('total', 0)}")
        context_parts.append(f"- Rank: #{player_info.get('rank', 'N/A')}")
        context_parts.append(f"- Trend: {player_info.get('trend', 1.0):.2f}")

        yearly = player_info.get('yearly', {})
        if yearly:
            sorted_years = sorted(yearly.items())
            yearly_str = ", ".join([f"{y}: {c}" for y, c in sorted_years])
            context_parts.append(f"- Yearly: {yearly_str}")

        player_areas = player_info.get('areas', {})
        if player_areas:
            context_parts.append(f"- Active in {len(player_areas)} areas:")
            sorted_areas = sorted(player_areas.items(), key=lambda x: x[1], reverse=True)
            for area_id, count in sorted_areas:
                area_label = areas.get(str(area_id), {}).get('label', '')[:40]
                context_parts.append(f"  - Area {area_id}: {count} patents ({area_label})")

    return "\n".join(context_parts)


# ============ STREAMING ============

async def stream_chat_response(request: ChatRequest):
    client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

    data = load_result_data(request.result_id)
    context = build_context(data, request.company)

    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": f"Here is the patent dataset context:\n\n{context}"},
        {"role": "assistant", "content": "I've reviewed the patent dataset. I can see information about patents, technology areas, topics, and top players. How can I help you analyze this data?"},
    ]

    history_to_include = request.history[-10:] if len(request.history) > 10 else request.history
    for msg in history_to_include:
        messages.append({"role": msg.role, "content": msg.content})

    if request.action and request.action in ACTION_PROMPTS:
        action_prompt = ACTION_PROMPTS[request.action].format(company=request.company)
        user_content = f"{request.message}\n\n{action_prompt}"
    else:
        user_content = request.message

    messages.append({"role": "user", "content": user_content})

    try:
        stream = client.chat.completions.create(
            model=MODEL,
            messages=messages,
            temperature=0.7,
            max_tokens=1500,
            stream=True,
        )

        for chunk in stream:
            if chunk.choices[0].delta.content:
                content = chunk.choices[0].delta.content
                yield f"data: {json.dumps({'content': content})}\n\n"

        yield f"data: {json.dumps({'done': True})}\n\n"

    except Exception as e:
        yield f"data: {json.dumps({'error': str(e)})}\n\n"


# ============ API ENDPOINTS ============

@router.post("/api/demo/chat/stream")
async def chat_stream(request: ChatRequest):
    return StreamingResponse(
        stream_chat_response(request),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        }
    )


@router.get("/api/demo/chat/health")
async def health():
    return {
        "status": "ok",
        "model": MODEL,
    }
