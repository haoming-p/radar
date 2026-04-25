"""
Generate currents (convergence regions + signals) for Radar 1.0 data by:
1. Compute per-cluster real trends from patent year data
2. Find cross-zone convergence regions (spatial proximity + growth)
3. Find notable signals (fast-growing individual clusters)
4. LLM narration (GPT-4o) for convergence region names and stories

Writes "currents" key into radar10-272364.json.

Usage: cd frontend/src/testData && python3 generate_radar10_currents.py
  (Run from backend venv for openai access)
"""

import json
import sys
import os
from collections import Counter, defaultdict
from math import sqrt

# Add backend to path for env loading
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "..", "backend"))

from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), "..", "..", "..", "backend", ".env"), override=True)

from openai import OpenAI

# ═══════════════════════════════════════
# PARAMETERS
# ═══════════════════════════════════════
DISTANCE_THRESHOLD = 0.5
MIN_TREND = 1.3
MIN_CLUSTER_COUNT = 5
MIN_REGION_CLUSTERS = 3
MIN_REGION_ZONES = 2

EARLY_RANGE = range(2015, 2020)  # 5 years
LATE_RANGE = range(2022, 2026)   # 4 years

SIGNAL_MIN_TREND = 3.0
SIGNAL_MIN_COUNT = 6

# ═══════════════════════════════════════
# LOAD DATA
# ═══════════════════════════════════════
DATA_FILE = os.path.join(os.path.dirname(__file__), "radar10-272364.json")

print("Loading data...")
with open(DATA_FILE) as f:
    data = json.load(f)

zones = data["areas"]
clusters = data["clusters"]
patents = data["patents"]

print(f"  {len(patents)} patents, {len(clusters)} clusters, {len(zones)} zones")

# ═══════════════════════════════════════
# STEP 1: Compute real trends per cluster
# ═══════════════════════════════════════
print("\nComputing cluster trends...")

cluster_to_zone = {}
for zid, z in zones.items():
    for cid in z.get("cluster_ids", []):
        cluster_to_zone[cid] = zid

cluster_years = defaultdict(lambda: Counter())
for p in patents:
    y = p.get("year")
    cid = p.get("cluster_id")
    if y:
        cluster_years[cid][y] += 1

cluster_info = {}
for cid_str, c in clusters.items():
    cid = c["id"]
    yc = cluster_years[cid]
    early = sum(yc[y] for y in EARLY_RANGE)
    late = sum(yc[y] for y in LATE_RANGE)
    trend = late / max(early, 0.5)
    pos = c.get("centroid", {})
    cluster_info[cid] = {
        "id": cid,
        "count": c["count"],
        "label": c["label"][:120],
        "zone_id": cluster_to_zone.get(cid, "-1"),
        "zone_name": zones.get(cluster_to_zone.get(cid, "-1"), {}).get("label", "outlier"),
        "x": pos.get("x", 0),
        "y": pos.get("y", 0),
        "trend": round(trend, 1),
        "early": early,
        "late": late,
    }

# ═══════════════════════════════════════
# STEP 2: Find cross-zone convergence regions
# ═══════════════════════════════════════
print("Finding convergence regions...")

pairs = []
cids = list(cluster_info.keys())
for i in range(len(cids)):
    a = cluster_info[cids[i]]
    if a["count"] < MIN_CLUSTER_COUNT:
        continue
    for j in range(i + 1, len(cids)):
        b = cluster_info[cids[j]]
        if b["count"] < MIN_CLUSTER_COUNT:
            continue
        if a["zone_id"] == b["zone_id"]:
            continue
        if a["trend"] < MIN_TREND and b["trend"] < MIN_TREND:
            continue
        dist = sqrt((a["x"] - b["x"]) ** 2 + (a["y"] - b["y"]) ** 2)
        if dist < DISTANCE_THRESHOLD:
            pairs.append((a, b, dist))

print(f"  {len(pairs)} cross-zone convergence pairs")

# Union-find
parent = {}
def find(x):
    while parent.get(x, x) != x:
        parent[x] = parent.get(parent[x], parent[x])
        x = parent[x]
    return x
def union(x, y):
    px, py = find(x), find(y)
    if px != py:
        parent[px] = py

for a, b, d in pairs:
    union(a["id"], b["id"])

raw_regions = defaultdict(set)
for a, b, d in pairs:
    root = find(a["id"])
    raw_regions[root].add(a["id"])
    raw_regions[root].add(b["id"])

# Build region details, filter
region_details = []
for root, cids_set in sorted(raw_regions.items(), key=lambda x: len(x[1]), reverse=True):
    zone_ids = set(cluster_info[c]["zone_id"] for c in cids_set)
    if len(zone_ids) < MIN_REGION_ZONES or len(cids_set) < MIN_REGION_CLUSTERS:
        continue

    cls = sorted([cluster_info[c] for c in cids_set], key=lambda x: x["trend"], reverse=True)
    total_patents = sum(c["count"] for c in cls)
    avg_x = sum(c["x"] for c in cls) / len(cls)
    avg_y = sum(c["y"] for c in cls) / len(cls)
    zone_names = list(set(c["zone_name"] for c in cls))
    growing = sum(1 for c in cls if c["trend"] > MIN_TREND)

    region_details.append({
        "cluster_ids": sorted([c["id"] for c in cls]),
        "cluster_count": len(cls),
        "total_patents": total_patents,
        "growing_clusters": growing,
        "zone_ids": sorted(zone_ids),
        "zone_names": zone_names,
        "center": {"x": round(avg_x, 2), "y": round(avg_y, 2)},
        "clusters": [
            {
                "id": c["id"],
                "keywords": c["label"],
                "zone": c["zone_name"][:30],
                "patents": c["count"],
                "trend": c["trend"],
            }
            for c in cls[:15]
        ],
    })

print(f"  {len(region_details)} convergence regions (>= {MIN_REGION_ZONES} zones, >= {MIN_REGION_CLUSTERS} clusters)")

# ═══════════════════════════════════════
# STEP 3: Find notable signals
# ═══════════════════════════════════════
print("Finding signals...")

signals_raw = []
for cid, ci in cluster_info.items():
    if ci["count"] >= SIGNAL_MIN_COUNT and ci["trend"] >= SIGNAL_MIN_TREND:
        signals_raw.append(ci)

signals_raw.sort(key=lambda x: x["trend"], reverse=True)
signals_raw = signals_raw[:10]  # top 10

print(f"  {len(signals_raw)} signals (trend >= {SIGNAL_MIN_TREND}x, count >= {SIGNAL_MIN_COUNT})")

# ═══════════════════════════════════════
# STEP 4: LLM narration
# ═══════════════════════════════════════
print("\nAsking GPT-4o for narration...")

# Build prompt
regions_text = ""
for i, r in enumerate(region_details):
    regions_text += f"CONVERGENCE REGION {i + 1}:\n"
    regions_text += f"  Zones: {', '.join(r['zone_names'])}\n"
    regions_text += f"  Center: ({r['center']['x']}, {r['center']['y']})\n"
    regions_text += f"  {r['cluster_count']} clusters, {r['total_patents']} patents, {r['growing_clusters']} growing\n"
    for cl in r["clusters"][:10]:
        regions_text += f"    - [{cl['zone'][:20]}] {cl['keywords'][:70]} ({cl['patents']}p, trend={cl['trend']}x)\n"
    regions_text += "\n"

signals_text = ""
for s in signals_raw:
    signals_text += f"  - Cluster {s['id']} [{s['zone_name'][:20]}]: {s['label'][:70]} ({s['count']}p, trend={s['trend']}x)\n"

prompt = f"""I've computationally found convergence regions and signals in a patent landscape.

CONVERGENCE REGIONS (cross-zone spatial proximity + growth):
{regions_text}

NOTABLE SIGNALS (fastest growing individual clusters):
{signals_text}

Zone reference:
1. Hydrocarbon Processing (syngas, catalysts, biofuels) — upper-right
2. Lithium Polymer Battery Materials (electrodes, composites, graphene) — right
3. LED Lighting Technologies (LEDs, sensors, aircraft lighting) — left-center
4. UAV Communication (drones, networks, sensors) — lower-left
5. Electric Vehicle Power Systems (converters, charging, batteries) — center-left
6. Solar Energy Systems (solar panels, heat pumps, thermal) — center
7. Combustion Engine Technologies (turbines, fuel, heat transfer) — upper-center

For each convergence region, provide:
1. name: evocative 2-4 word name
2. description: one paragraph — what technologies converge, what destination they flow toward, what's surprising
3. why_care: one sentence — why should someone in this industry care

For each signal, provide:
1. name: short descriptive name
2. description: one sentence explaining what it means

Output as JSON:
{{
  "convergence_regions": [
    {{"name": "...", "description": "...", "why_care": "..."}}
  ],
  "signals": [
    {{"name": "...", "description": "..."}}
  ]
}}
"""

client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
response = client.chat.completions.create(
    model="gpt-4o",
    messages=[{"role": "user", "content": prompt}],
    temperature=0.5,
    max_tokens=2500,
    response_format={"type": "json_object"},
)

narration = json.loads(response.choices[0].message.content)

# ═══════════════════════════════════════
# STEP 5: Merge narration with data and write
# ═══════════════════════════════════════
print("\nMerging and writing...")

currents = {
    "convergence_regions": [],
    "signals": [],
    "parameters": {
        "distance_threshold": DISTANCE_THRESHOLD,
        "min_trend": MIN_TREND,
        "min_cluster_count": MIN_CLUSTER_COUNT,
        "early_range": [min(EARLY_RANGE), max(EARLY_RANGE)],
        "late_range": [min(LATE_RANGE), max(LATE_RANGE)],
    },
}

# Merge convergence regions
for i, r in enumerate(region_details):
    narr = narration["convergence_regions"][i] if i < len(narration["convergence_regions"]) else {}
    currents["convergence_regions"].append({
        "id": i + 1,
        "name": narr.get("name", f"Convergence Region {i + 1}"),
        "description": narr.get("description", ""),
        "why_care": narr.get("why_care", ""),
        "cluster_ids": r["cluster_ids"],
        "cluster_count": r["cluster_count"],
        "total_patents": r["total_patents"],
        "growing_clusters": r["growing_clusters"],
        "zone_ids": r["zone_ids"],
        "zone_names": r["zone_names"],
        "center": r["center"],
        "top_clusters": r["clusters"][:10],
    })

# Merge signals
for i, s in enumerate(signals_raw):
    narr = narration["signals"][i] if i < len(narration["signals"]) else {}
    currents["signals"].append({
        "id": i + 1,
        "name": narr.get("name", f"Signal {i + 1}"),
        "description": narr.get("description", ""),
        "cluster_id": s["id"],
        "cluster_count": s["count"],
        "trend": s["trend"],
        "zone_id": s["zone_id"],
        "zone_name": s["zone_name"],
        "keywords": s["label"],
        "center": {"x": round(s["x"], 2), "y": round(s["y"], 2)},
    })

# Write back to JSON
data["currents"] = currents

with open(DATA_FILE, "w") as f:
    json.dump(data, f, indent=None)

print(f"\nDone! Wrote {len(currents['convergence_regions'])} convergence regions and {len(currents['signals'])} signals.")
print("\nConvergence regions:")
for cr in currents["convergence_regions"]:
    print(f"  {cr['id']}. {cr['name']} — {cr['cluster_count']} clusters, {cr['total_patents']} patents across {', '.join(cr['zone_names'][:3])}")
print("\nSignals:")
for s in currents["signals"]:
    print(f"  {s['id']}. {s['name']} — {s['cluster_count']}p, trend={s['trend']}x")
