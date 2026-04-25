"""
Chat API for Patent Analysis Chatbot

Provides AI-powered analysis of patent data using OpenAI.
Supports streaming, conversation history, map-aware context, and structured map actions.

API Endpoints:
    POST /api/demo/chat/stream   - Streaming chat (SSE response)
    GET  /api/demo/chat/health   - Health check
"""

import os
import json
from pathlib import Path
from typing import Optional, List

from dotenv import load_dotenv
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from openai import OpenAI

# Load .env from backend directory
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

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


class MapSelection(BaseModel):
    """Current selection on the map, sent by the frontend."""
    tab: Optional[str] = None  # "keyAreas" | "hotAreas" | "explore" | "players"
    # Territory Zones
    activeZone: Optional[dict] = None  # {id, label, keywords, summary, clusterCount, patentCount, trend}
    # Hot Map
    activeHotArea: Optional[dict] = None  # {id, label, keywords, summary, clusterCount, patentCount}
    # Areas (explore)
    exploreSelection: Optional[dict] = None  # {clusterCount, patentCount, topKeywords, clusterDetails}
    # Players
    selectedPlayers: Optional[list] = None  # [{name, totalPatents, topAreas, yearlyData}]
    selectedYear: Optional[int] = None


class LandscapeData(BaseModel):
    """Background knowledge about the patent landscape, sent once."""
    totalPatents: int = 0
    totalClusters: int = 0
    zones: Optional[list] = None  # [{id, label, keywords, summary, clusterCount, patentCount, trend}]
    hotAreas: Optional[list] = None  # [{id, label, keywords, summary, clusterCount, patentCount}]
    players: Optional[list] = None  # [{name, totalPatents, topAreas}]
    clusters: Optional[list] = None  # [{id, label, count, keywords, zoneId}]


class ChatRequest(BaseModel):
    message: str
    company: str = "The Boeing Company"
    action: Optional[str] = None
    history: List[HistoryMessage] = []
    # Legacy: pipeline result
    result_id: Optional[str] = None
    # New: radar10 context from frontend
    landscape: Optional[LandscapeData] = None
    mapSelection: Optional[MapSelection] = None
    mode: str = "internal"  # "internal" or "client"


class RegenerateZonesRequest(BaseModel):
    target_areas: int = 5


# ============ PROMPTS ============

SYSTEM_PROMPT = """You are a patent analysis expert embedded in an interactive patent landscape visualization tool.

You have deep knowledge of the patent dataset being displayed, including territory zones, hot areas, and top players.

The user is looking at a 2D patent map where similar patents are clustered together. They can:
- View Territory Zones (major technology regions)
- View the Hot Map (density-based concentration zones)
- Explore Areas (select contour regions to analyze)
- View Currents (convergence regions where different zones overlap)
- Track Player Trends (top patent applicants over time)

When the user sends a message, you may also receive their current map selection (which zone, area, or players they're looking at). Use this context to give specific, relevant answers.

You can suggest map actions by including a JSON block at the end of your response:
```map-action
{"type": "highlightZone", "zoneId": 3}
```

Available map actions:
- {"type": "highlightZone", "zoneId": <id>} — highlight a territory zone
- {"type": "highlightHotArea", "hotAreaId": <id>} — highlight a hot area
- {"type": "highlightPlayer", "playerName": "<name>"} — show a player on the map
- {"type": "filterClusters", "keywords": ["keyword1", "keyword2"]} — highlight clusters containing these keywords
- {"type": "updateZones", "targetAreas": <number>} — regenerate territory zones with a new target count (only use when user explicitly asks to change zones)
- {"type": "suggestHotAreas", "areas": [{"name": "...", "description": "...", "clusterIds": [1,2,3], "keywords": "kw1, kw2, kw3"}]} — suggest new hot areas to add to the map. Use when user asks to find more hot areas, split a hot area, or discover hidden density zones. Pick clusters that are spatially close, share a theme, and aren't already covered by existing hot areas. IMPORTANT: You MUST include the suggestHotAreas map-action block when suggesting hot areas — the frontend uses it to show "Add to map" buttons. In your text response, list each suggestion with its name, number of clusters, total patent count (sum the cluster patent counts from the data), and keywords. Do NOT show raw cluster IDs in the text — users don't care about IDs. Put IDs only in the map-action JSON.

Only include a map action when it directly helps answer the user's question. Do not include actions for every response.

FORMATTING RULES (very important):
- Keep responses SHORT. Maximum 150 words unless the user asks for more detail.
- Use markdown TABLES when comparing items (players, zones, metrics). Tables are much easier to read than paragraphs.
- Use bullet points for lists. Never write long paragraphs.
- Use bold for key numbers and names.
- Do not use emojis.
- Do not use markdown headers (no # or ##). Use bold text for section labels.
- Lead with the most important finding first, then supporting detail.
- When the user has something selected on the map, focus your answer on that selection.
"""

CLIENT_MODE_ADDITION = """
IMPORTANT: You are in CLIENT mode. You are a proactive guide helping the user understand this patent landscape.
- Be welcoming and explanatory — assume the user is seeing this data for the first time.
- Proactively suggest what to look at next.
- When the user asks to change the number of zones (e.g., "I want 5 zones", "can we have fewer zones"), ALWAYS include a updateZones action. For example, if they say "make it 5 zones", include:
```map-action
{"type": "updateZones", "targetAreas": 5}
```
- Respond with a brief confirmation like "I'll reorganize the landscape into 5 territory zones for you." and include the action.
- If the request doesn't make sense (e.g., 0 zones, 100 zones), explain why and suggest a reasonable range (3-12).
"""

ACTION_PROMPTS = {
    "competitive-position": """Analyze {company}'s competitive position. You MUST respond with a markdown table followed by brief bullets.

Start with this EXACT table format (fill in real data):

| Metric | Value |
|--------|-------|
| Rank | #X of Y players |
| Total patents | N |
| Top keywords | keyword1, keyword2, keyword3 |
| Growth | rising/stable/declining |

Then add 2-3 short bullet points comparing to closest competitors. Use keywords, not zone names. Under 120 words total.""",

    "compare-players": """Compare these players. You MUST respond with a markdown table followed by brief bullets.

Start with this EXACT table format (fill in real data for each player):

| Player | Patents | Focus keywords | Trend |
|--------|---------|---------------|-------|
| Name | N | keyword1, keyword2 | rising/stable |

Then 2-3 bullet points: who leads what, biggest gaps between them. Use technology keywords, NOT zone names. Under 150 words total.""",
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

    return None


def build_legacy_context(data: dict, company: str) -> str:
    """Build context from cached pipeline results (legacy 1.1 flow)."""
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


def build_landscape_context(landscape: LandscapeData, company: str) -> str:
    """Build context from radar10 landscape data sent by frontend."""
    parts = []

    parts.append(f"""Dataset Overview:
- Total Patents: {landscape.totalPatents}
- Total Clusters: {landscape.totalClusters}
- Territory Zones: {len(landscape.zones or [])}
- Hot Areas: {len(landscape.hotAreas or [])}
- Top Players Tracked: {len(landscape.players or [])}
""")

    if landscape.zones:
        parts.append("Territory Zones (major technology regions):")
        for zone in sorted(landscape.zones, key=lambda z: z.get("patentCount", 0), reverse=True):
            parts.append(f"- Zone {zone['id']}: \"{zone.get('label', '')}\"")
            parts.append(f"  {zone.get('clusterCount', 0)} clusters, {zone.get('patentCount', 0)} patents, trend: {zone.get('trend', 0):.2f}")
            if zone.get('keywords'):
                parts.append(f"  Keywords: {zone['keywords']}")
            if zone.get('summary'):
                parts.append(f"  Summary: {zone['summary']}")
        parts.append("")

    if landscape.hotAreas:
        parts.append("Hot Areas (high-density concentration zones):")
        for ha in sorted(landscape.hotAreas, key=lambda h: h.get("patentCount", 0), reverse=True):
            parts.append(f"- Hot Area {ha['id']}: \"{ha.get('label', '')}\"")
            parts.append(f"  {ha.get('clusterCount', 0)} clusters, {ha.get('patentCount', 0)} patents")
            if ha.get('keywords'):
                parts.append(f"  Keywords: {ha['keywords']}")
        parts.append("")

    if landscape.clusters:
        parts.append("Clusters (use these IDs when suggesting hot areas):")
        # Group by zone for readability, show top clusters
        for cl in sorted(landscape.clusters, key=lambda c: c.get("count", 0), reverse=True)[:50]:
            zone_label = f" [Zone {cl.get('zoneId', '?')}]" if cl.get('zoneId') else ""
            parts.append(f"- Cluster {cl['id']}: \"{cl.get('label', '')}\" ({cl.get('count', 0)} patents){zone_label}")
            if cl.get('keywords'):
                parts.append(f"  Keywords: {cl['keywords']}")
        parts.append("")

    if landscape.players:
        parts.append("Top Players (patent applicants):")
        for i, player in enumerate(landscape.players):
            marker = " [FOCUS COMPANY]" if player.get("name") == company else ""
            parts.append(f"- #{i+1} {player['name']}{marker}: {player.get('totalPatents', 0)} patents")
            if player.get('topAreas'):
                areas_str = ", ".join(a.get("label", "").split(",")[0] for a in player['topAreas'][:3])
                parts.append(f"  Top areas: {areas_str}")
        parts.append("")

    return "\n".join(parts)


def build_selection_context(selection: MapSelection) -> str:
    """Build context string for the current map selection."""
    if not selection:
        return ""

    parts = []

    if selection.tab:
        tab_names = {
            "keyAreas": "Territory Zones",
            "hotAreas": "Hot Map",
            "explore": "Areas (Explore)",
            "players": "Player Trend",
        }
        parts.append(f"The user is currently viewing: {tab_names.get(selection.tab, selection.tab)}")

    if selection.activeZone:
        z = selection.activeZone
        parts.append(f"\nSelected Territory Zone: \"{z.get('label', '')}\"")
        parts.append(f"- {z.get('clusterCount', 0)} clusters, {z.get('patentCount', 0)} patents")
        if z.get('keywords'):
            parts.append(f"- Keywords: {z['keywords']}")
        if z.get('summary'):
            parts.append(f"- Summary: {z['summary']}")

    if selection.activeHotArea:
        h = selection.activeHotArea
        parts.append(f"\nSelected Hot Area: \"{h.get('label', '')}\"")
        parts.append(f"- {h.get('clusterCount', 0)} clusters, {h.get('patentCount', 0)} patents")
        if h.get('keywords'):
            parts.append(f"- Keywords: {h['keywords']}")

    if selection.exploreSelection:
        e = selection.exploreSelection
        parts.append(f"\nUser has selected a contour area on the map:")
        parts.append(f"- {e.get('clusterCount', 0)} clusters, {e.get('patentCount', 0)} patents")
        if e.get('topKeywords'):
            parts.append(f"- Top keywords: {', '.join(e['topKeywords'])}")
        if e.get('clusterDetails'):
            parts.append("- Clusters in selection:")
            for cl in e['clusterDetails'][:20]:
                parts.append(f"  - Cluster {cl.get('id', '?')}: {cl.get('label', '')} ({cl.get('count', 0)} patents)")

    if selection.selectedPlayers:
        parts.append(f"\nSelected players on map:")
        for p in selection.selectedPlayers:
            parts.append(f"- {p.get('name', '')}: {p.get('totalPatents', 0)} patents")
            if p.get('topAreas'):
                areas_str = ", ".join(a.get("label", "").split(",")[0] for a in p['topAreas'][:3])
                parts.append(f"  Top areas: {areas_str}")
        if selection.selectedYear:
            parts.append(f"- Viewing year: {selection.selectedYear}")

    return "\n".join(parts) if parts else ""


# ============ STREAMING ============

async def stream_chat_response(request: ChatRequest):
    client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

    # Build context: prefer frontend-provided landscape, fall back to cached pipeline
    if request.landscape:
        context = build_landscape_context(request.landscape, request.company)
    else:
        data = load_result_data(request.result_id)
        if data:
            context = build_legacy_context(data, request.company)
        else:
            context = "No dataset context available."

    # Build selection context
    selection_context = build_selection_context(request.mapSelection) if request.mapSelection else ""

    system = SYSTEM_PROMPT
    if request.mode == "client":
        system += "\n\n" + CLIENT_MODE_ADDITION

    messages = [
        {"role": "system", "content": system},
        {"role": "user", "content": f"Here is the patent dataset context:\n\n{context}"},
        {"role": "assistant", "content": "I've reviewed the patent landscape. I can see the territory zones, hot areas, and top players. I'm ready to help you analyze this data. What would you like to know?"},
    ]

    history_to_include = request.history[-10:] if len(request.history) > 10 else request.history
    for msg in history_to_include:
        messages.append({"role": msg.role, "content": msg.content})

    # Build the user message with optional action prompt and selection context
    user_parts = []
    if selection_context:
        user_parts.append(f"[Current map state]\n{selection_context}\n")
    if request.action and request.action in ACTION_PROMPTS:
        user_parts.append(ACTION_PROMPTS[request.action].format(company=request.company))
    user_parts.append(request.message)

    messages.append({"role": "user", "content": "\n".join(user_parts)})

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


# ============ ZONE REGENERATION ============

# Patent boilerplate filter
_STOPWORDS = {
    "claim", "claims", "method", "system", "device", "apparatus", "according",
    "comprising", "includes", "including", "wherein", "thereof", "therein",
    "embodiment", "invention", "present", "provided", "configured", "adapted",
    "one", "two", "first", "second", "third", "plurality", "portion",
    "basis", "rich", "th", "sub", "non", "wt", "vol", "user", "datum", "base",
    "group", "weight", "independently",
}

_STOPWORD_PHRASES = {
    "method according", "system of claim", "device of claim", "method of claim",
    "process of claim", "in claim", "according to claim",
}


def _is_boilerplate(kw: str) -> bool:
    kw_lower = kw.lower().strip()
    if kw_lower in _STOPWORDS:
        return True
    return any(p in kw_lower for p in _STOPWORD_PHRASES)


def _filter_keywords(keywords: list) -> list:
    return [kw for kw in keywords if not _is_boilerplate(kw) and len(kw) > 2]


_radar10_cache = {}


def _load_radar10_data() -> dict:
    if "data" not in _radar10_cache:
        radar10_path = Path(__file__).resolve().parent.parent.parent / "frontend" / "src" / "testData" / "radar10-272364.json"
        with open(radar10_path) as f:
            _radar10_cache["data"] = json.load(f)
    return _radar10_cache["data"]


def _regenerate_areas(clusters: dict, target_areas: int) -> tuple:
    """Re-run clustering with new target. Returns (areas_dict, cluster_to_area_map)."""
    import numpy as np
    from sklearn.cluster import DBSCAN
    from scipy.cluster.hierarchy import linkage, fcluster
    from collections import Counter

    cluster_ids = sorted(clusters.keys(), key=int)
    coords = np.array([
        [clusters[cid]["centroid"]["x"], clusters[cid]["centroid"]["y"]]
        for cid in cluster_ids
    ])

    # DBSCAN to exclude outliers
    db = DBSCAN(eps=0.5, min_samples=5).fit(coords)
    core_mask = db.labels_ != -1
    core_indices = [i for i in range(len(cluster_ids)) if core_mask[i]]
    core_ids = [cluster_ids[i] for i in core_indices]
    core_coords = coords[core_mask]

    # Agglomerative on core
    Z = linkage(core_coords, method="ward")
    labels = fcluster(Z, t=target_areas, criterion="maxclust")

    groups = {}
    for idx, cid in enumerate(core_ids):
        group_id = int(labels[idx])
        if group_id not in groups:
            groups[group_id] = []
        groups[group_id].append(int(cid))

    # Build area info
    areas = {}
    for area_idx, (gid, cids) in enumerate(sorted(groups.items()), start=1):
        total_weight = 0
        cx, cy = 0.0, 0.0
        total_patents = 0
        for cid in cids:
            cl = clusters[str(cid)]
            w = cl["count"]
            cx += cl["centroid"]["x"] * w
            cy += cl["centroid"]["y"] * w
            total_weight += w
            total_patents += cl["count"]
        if total_weight > 0:
            cx /= total_weight
            cy /= total_weight

        ckw_counter = Counter()
        for cid in cids:
            cl = clusters.get(str(cid), {})
            for kw in _filter_keywords(cl.get("compound_keywords", [])):
                ckw_counter[kw] += 1

        top_compound = [kw for kw, _ in ckw_counter.most_common(15)]
        trend_sum = sum(clusters[str(c)]["trend"] * clusters[str(c)]["count"] for c in cids)
        trend = trend_sum / total_patents if total_patents > 0 else 1.0

        areas[str(area_idx)] = {
            "id": area_idx,
            "centroid": {"x": round(cx, 4), "y": round(cy, 4)},
            "cluster_ids": sorted(cids),
            "cluster_count": len(cids),
            "patent_count": total_patents,
            "label": "",
            "summary": "",
            "keywords": ", ".join(top_compound[:15]),
            "trend": round(trend, 2),
        }

    # Build cluster_to_area map
    cluster_area_map = {}
    for aid, area in areas.items():
        for cid in area["cluster_ids"]:
            cluster_area_map[str(cid)] = int(aid)

    return areas, cluster_area_map


def _label_areas_with_llm(areas: dict, clusters: dict):
    """Generate LLM labels for areas."""
    from collections import Counter
    try:
        client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
    except Exception:
        # Fallback: use keyword-based labels
        for aid, area in areas.items():
            kws = area["keywords"].split(", ")[:3]
            area["label"] = ", ".join(kws) if kws else f"Area {aid}"
            area["summary"] = f"Technology area covering {area['patent_count']} patents across {area['cluster_count']} clusters."
        return

    area_blocks = []
    for aid, area in sorted(areas.items(), key=lambda x: int(x[0])):
        ckw_counter = Counter()
        kw_counter = Counter()
        for cid in area["cluster_ids"][:80]:
            cl = clusters.get(str(cid), {})
            for kw in _filter_keywords(cl.get("compound_keywords", [])):
                ckw_counter[kw] += 1
            for kw in _filter_keywords(cl.get("keywords", [])):
                kw_counter[kw] += 1
        top_compound = [w for w, _ in ckw_counter.most_common(15)]
        top_single = [w for w, _ in kw_counter.most_common(10)]
        area_blocks.append(
            f"AREA {aid} ({area['cluster_count']} clusters, {area['patent_count']} patents):\n"
            f"  Compound terms: {', '.join(top_compound)}\n"
            f"  Single terms: {', '.join(top_single)}"
        )

    prompt = f"Here are {len(areas)} technology areas from a patent landscape analysis:\n\n" + "\n\n".join(area_blocks)

    system = """You are a senior technology analyst. For each area, produce:
1. TITLE: Concise phrase (1-7 words) a non-expert can understand.
2. KEYWORDS: Up to 10 technology-specific keywords. No patent boilerplate. No duplicates across areas.
3. DESCRIPTION: 2-4 sentences about technologies, applications, trends.

Return ONLY a JSON array: [{"id": "1", "title": "...", "keywords": ["..."], "description": "..."}, ...]"""

    try:
        import re
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": prompt},
            ],
            max_tokens=2000,
            temperature=0.3,
        )
        raw = response.choices[0].message.content.strip()
        json_match = re.search(r'\[.*\]', raw, re.DOTALL)
        results = json.loads(json_match.group()) if json_match else json.loads(raw)

        for item in results:
            aid = str(item["id"])
            if aid in areas:
                areas[aid]["label"] = item.get("title", "")
                areas[aid]["keywords"] = ", ".join(item.get("keywords", []))
                areas[aid]["summary"] = item.get("description", "")
    except Exception:
        for aid, area in areas.items():
            kws = area["keywords"].split(", ")[:3]
            area["label"] = ", ".join(kws) if kws else f"Area {aid}"
            area["summary"] = f"Technology area covering {area['patent_count']} patents across {area['cluster_count']} clusters."

    # Fallback for unlabeled
    for aid, area in areas.items():
        if not area["label"]:
            kws = area["keywords"].split(", ")[:3]
            area["label"] = ", ".join(kws) if kws else f"Area {aid}"


@router.post("/api/demo/zones/regenerate")
async def regenerate_zones(request: RegenerateZonesRequest):
    target = request.target_areas
    if target < 2 or target > 15:
        raise HTTPException(status_code=400, detail=f"target_areas must be between 2 and 15, got {target}")

    data = _load_radar10_data()
    clusters = data["clusters"]

    areas, cluster_area_map = _regenerate_areas(clusters, target)
    _label_areas_with_llm(areas, clusters)

    return {
        "areas": areas,
        "cluster_area_map": cluster_area_map,
    }
