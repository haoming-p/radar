"""
Generate key areas for Radar 1.0 data by:
1. DBSCAN to identify dense core clusters (outliers excluded)
2. Agglomerative clustering within core to split into 4-10 sub-areas
3. Filter patent boilerplate from keywords
4. LLM labeling (GPT-4o-mini for key_phrase + summary)

Writes "areas" key into radar10-272364.json.

Usage: cd frontend/src/testData && python3 generate_radar10_areas.py
  (Run from backend venv for scipy + openai + sklearn access)
"""

import json
import sys
import os
from collections import Counter

import numpy as np
from sklearn.cluster import DBSCAN
from scipy.cluster.hierarchy import linkage, fcluster

# Add backend to path for LLM labeling
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "..", "backend"))

# Patent boilerplate to filter from keywords
STOPWORDS = {
    "claim", "claims", "method", "system", "device", "apparatus", "according",
    "accord", "comprising", "includes", "including", "wherein", "thereof",
    "therein", "herein", "embodiment", "invention", "present", "provided",
    "configured", "adapted", "arranged", "disposed", "coupled", "connected",
    "substantially", "approximately", "preferably", "alternatively",
    "one", "two", "first", "second", "third", "plurality", "portion",
    "adapt", "basis", "rich", "th", "sub", "non", "wt", "vol",
    "independently", "therefor", "thereof", "user", "datum", "base",
    "group", "weight",
}

STOPWORD_PHRASES = {
    "method according", "system of claim", "device of claim", "apparatus of claim",
    "method of claim", "process of claim", "composition of claim",
    "as claimed in claim", "set forth in claim", "forth in claim",
    "recited in claim", "defined in claim", "process according",
    "implemented method", "computer implemented", "in claim",
    "characterized in", "recited", "according to claim",
}


def load_data():
    with open("radar10-272364.json") as f:
        return json.load(f)


def is_boilerplate(keyword):
    kw_lower = keyword.lower().strip()
    if kw_lower in STOPWORDS:
        return True
    for phrase in STOPWORD_PHRASES:
        if phrase in kw_lower:
            return True
    return False


def filter_keywords(keywords):
    return [kw for kw in keywords if not is_boilerplate(kw) and len(kw) > 2]


def find_areas(clusters, target_areas=7, dbscan_eps=0.5, dbscan_min=5):
    """Two-step: DBSCAN to exclude outliers, then agglomerative to split core."""
    cluster_ids = sorted(clusters.keys(), key=int)
    coords = np.array([
        [clusters[cid]["centroid"]["x"], clusters[cid]["centroid"]["y"]]
        for cid in cluster_ids
    ])

    # Step 1: DBSCAN to find dense core
    db = DBSCAN(eps=dbscan_eps, min_samples=dbscan_min).fit(coords)
    core_mask = db.labels_ != -1
    core_indices = [i for i in range(len(cluster_ids)) if core_mask[i]]
    core_ids = [cluster_ids[i] for i in core_indices]
    core_coords = coords[core_mask]
    n_outlier = sum(~core_mask)

    print(f"DBSCAN: {len(core_ids)} core clusters, {n_outlier} outliers excluded")

    # Step 2: Agglomerative on core clusters
    Z = linkage(core_coords, method="ward")
    labels = fcluster(Z, t=target_areas, criterion="maxclust")

    groups = {}
    for idx, cid in enumerate(core_ids):
        group_id = int(labels[idx])
        if group_id not in groups:
            groups[group_id] = []
        groups[group_id].append(int(cid))

    print(f"Agglomerative: {len(groups)} areas from {len(core_ids)} core clusters")
    for gid, cids in sorted(groups.items()):
        total_patents = sum(clusters[str(c)]["count"] for c in cids)
        print(f"  Area {gid}: {len(cids)} clusters, {total_patents} patents")

    return groups


def build_area_info(clusters, groups):
    """Build AreaInfo objects from groups."""
    areas = {}
    for area_idx, (gid, cluster_ids) in enumerate(sorted(groups.items()), start=1):
        total_weight = 0
        cx, cy = 0.0, 0.0
        total_patents = 0
        for cid in cluster_ids:
            cl = clusters[str(cid)]
            w = cl["count"]
            cx += cl["centroid"]["x"] * w
            cy += cl["centroid"]["y"] * w
            total_weight += w
            total_patents += cl["count"]

        if total_weight > 0:
            cx /= total_weight
            cy /= total_weight

        # Top keywords by frequency, filtered
        ckw_counter = Counter()
        kw_counter = Counter()
        for cid in cluster_ids:
            cl = clusters[str(cid)]
            for kw in filter_keywords(cl.get("compound_keywords", [])):
                ckw_counter[kw] += 1
            for kw in filter_keywords(cl.get("keywords", [])):
                kw_counter[kw] += 1

        top_compound = [kw for kw, _ in ckw_counter.most_common(20)]

        trend_sum = sum(clusters[str(c)]["trend"] * clusters[str(c)]["count"] for c in cluster_ids)
        trend = trend_sum / total_patents if total_patents > 0 else 1.0

        areas[str(area_idx)] = {
            "id": area_idx,
            "centroid": {"x": round(cx, 4), "y": round(cy, 4)},
            "cluster_ids": sorted(cluster_ids),
            "cluster_count": len(cluster_ids),
            "patent_count": total_patents,
            "label": "",
            "summary": "",
            "keywords": ", ".join(top_compound[:15]),
            "trend": round(trend, 2),
        }

    return areas


def generate_llm_labels(areas, clusters):
    """
    Call LLM to generate title + curated keywords + description for all areas at once.
    Sends all areas in one prompt so LLM can deduplicate keywords across areas.
    Falls back to hardcoded labels if LLM is unavailable.
    """
    try:
        from dotenv import load_dotenv
        load_dotenv(os.path.join(os.path.dirname(__file__), "..", "..", "..", "backend", ".env"), override=True)
        from openai import OpenAI
        client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
    except Exception as e:
        print(f"Warning: OpenAI not available ({e}). Using hardcoded labels.")
        apply_hardcoded_labels(areas)
        return

    # Build area summaries for the prompt
    area_blocks = []
    for aid, area in sorted(areas.items(), key=lambda x: int(x[0])):
        # Collect filtered keywords from member clusters
        ckw_counter = Counter()
        kw_counter = Counter()
        for cid in area["cluster_ids"][:80]:
            cl = clusters.get(str(cid), {})
            for kw in filter_keywords(cl.get("compound_keywords", [])):
                ckw_counter[kw] += 1
            for kw in filter_keywords(cl.get("keywords", [])):
                kw_counter[kw] += 1

        top_compound = [w for w, _ in ckw_counter.most_common(15)]
        top_single = [w for w, _ in kw_counter.most_common(10)]

        area_blocks.append(
            f"AREA {aid} ({area['cluster_count']} clusters, {area['patent_count']} patents):\n"
            f"  Compound terms: {', '.join(top_compound)}\n"
            f"  Single terms: {', '.join(top_single)}"
        )

    areas_text = "\n\n".join(area_blocks)

    system_prompt = """You are a senior technology analyst helping executives quickly understand a patent landscape map.

You are given multiple technology areas detected on a 2D patent map. Each area contains clusters of related patents.

For each area, produce:
1. TITLE: A concise, meaningful phrase (1-7 words) that a non-expert can immediately understand.
   Good: "Electric Vehicle Battery Systems", "Drone Navigation", "Solar Energy Storage"
   Bad: "vehicle, DC, battery" (just keywords), "Advanced Multi-Modal Systems" (too vague)

2. KEYWORDS: Up to 10 curated, technology-specific keywords. Rules:
   - No patent boilerplate (claim, method, system, device, apparatus, comprising, etc.)
   - No duplicates across different areas — each keyword should appear in only ONE area
   - Prefer specific technical terms over generic ones

3. DESCRIPTION: 2-4 sentences explaining what this area covers. Be specific about technologies,
   applications, and trends. Write for someone who wants to quickly decide if this area is relevant to them.

Format your response as JSON array:
[
  {"id": "1", "title": "...", "keywords": ["kw1", "kw2", ...], "description": "..."},
  ...
]

Return ONLY the JSON array, no other text."""

    user_prompt = f"Here are {len(areas)} technology areas from a patent landscape analysis:\n\n{areas_text}"

    print("\nGenerating LLM labels (all areas in one call)...")
    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            max_tokens=2000,
            temperature=0.3,
        )
        raw = response.choices[0].message.content.strip()

        # Parse JSON response
        import re
        # Extract JSON array from response (handle markdown code blocks)
        json_match = re.search(r'\[.*\]', raw, re.DOTALL)
        if json_match:
            results = json.loads(json_match.group())
        else:
            results = json.loads(raw)

        for item in results:
            aid = str(item["id"])
            if aid in areas:
                areas[aid]["label"] = item.get("title", areas[aid]["label"])
                areas[aid]["keywords"] = ", ".join(item.get("keywords", []))
                areas[aid]["summary"] = item.get("description", "")
                print(f"  Area {aid}: \"{areas[aid]['label']}\"")

    except Exception as e:
        print(f"LLM call failed ({e}). Using hardcoded labels.")
        apply_hardcoded_labels(areas)
        return

    # Fallback for any areas still unlabeled
    for aid, area in areas.items():
        if not area["label"]:
            kw = area["keywords"].split(", ")[:3]
            area["label"] = ", ".join(kw) if kw else f"Area {aid}"


def apply_hardcoded_labels(areas):
    """Manually curated labels based on cluster keyword analysis. Used as fallback."""
    labels = {
        "1": {
            "label": "Fuel & Petrochemical Processing",
            "keywords": "hydrocarbon, catalyst, reactor, feedstock, syngas, paraffins, renewable fuel, refining, cracking, hydrogen",
            "summary": "Covers petroleum refining and chemical processing technologies, including catalytic conversion, hydrocarbon processing, syngas production, and renewable fuel development. Strong focus on reactor design and process optimization.",
        },
        "2": {
            "label": "Advanced Materials & Composites",
            "keywords": "lithium, electrode, polymer, graphene, alloy, composite, oxide, fiber, coating, ceramic",
            "summary": "Encompasses materials science innovations including battery electrode materials, polymer composites, metal alloys, and advanced coatings. Key sub-areas include lithium-ion battery chemistry, carbon fiber composites, and functional surface treatments.",
        },
        "3": {
            "label": "Sensors & Lighting Systems",
            "keywords": "LED, light source, sensor, display, wearable, emitter, optical, illumination, garment, mobile",
            "summary": "Covers lighting technology and sensor systems, from LED and optical emitters to wearable sensing devices. Includes smart lighting, display technology, and integration of sensors into consumer and industrial products.",
        },
        "4": {
            "label": "Drone & Aviation Communications",
            "keywords": "UAV, aerial vehicle, flight control, aviation, wireless, navigation, network, communications, airspace, autonomous",
            "summary": "Focuses on unmanned aerial vehicle technology and aviation communication systems. Key topics include drone flight management, air traffic coordination, wireless communication protocols for aviation, and autonomous navigation systems.",
        },
        "5": {
            "label": "Electric Vehicle Power Systems",
            "keywords": "DC converter, battery, motor, voltage, electric machine, propeller, torque, power electronics, charging, inverter",
            "summary": "Covers electric vehicle powertrain and energy management technologies. Includes DC/AC power conversion, battery management systems, electric motors, and charging infrastructure. Strong emphasis on power electronics and energy efficiency.",
        },
        "6": {
            "label": "Solar Energy & Thermal Systems",
            "keywords": "solar panel, heat pump, compressed air, laser, container, thermal storage, heat exchanger, energy harvesting, cooling, assembly",
            "summary": "Encompasses renewable energy and thermal management technologies. Key areas include solar power generation, heat pump systems, thermal energy storage, and industrial thermal processing including laser-based manufacturing.",
        },
        "7": {
            "label": "Gas Turbine & Combustion",
            "keywords": "combustor, gas turbine, spray nozzle, fuel delivery, heat transfer, turbine blade, combustion chamber, exhaust, aviation fuel, engine",
            "summary": "Focuses on gas turbine engine technology and combustion systems. Covers fuel injection, combustion chamber design, turbine blade engineering, heat transfer optimization, and sustainable aviation fuel compatibility.",
        },
    }

    for aid, data in labels.items():
        if aid in areas:
            areas[aid]["label"] = data["label"]
            areas[aid]["keywords"] = data["keywords"]
            areas[aid]["summary"] = data["summary"]
            print(f"  Area {aid}: \"{data['label']}\" (hardcoded)")


def main():
    data = load_data()
    clusters = data["clusters"]
    print(f"Loaded {len(clusters)} clusters\n")

    # Step 1: Find areas (DBSCAN + agglomerative)
    groups = find_areas(clusters, target_areas=7)

    # Step 2: Build area objects with filtered keywords
    areas = build_area_info(clusters, groups)

    print("\nAreas with filtered keywords:")
    for aid, area in sorted(areas.items(), key=lambda x: int(x[0])):
        print(f"  Area {aid}: {area['cluster_count']}cl, {area['patent_count']}p — {area['keywords'][:80]}")

    # Step 3: LLM labels
    generate_llm_labels(areas, clusters)

    print("\nFinal areas:")
    for aid, area in sorted(areas.items(), key=lambda x: int(x[0])):
        print(f"  {aid}. \"{area['label']}\" — {area['cluster_count']}cl, {area['patent_count']}p")
        if area["summary"]:
            print(f"     {area['summary'][:120]}...")

    # Step 4: Assign area_id to patents (None for outliers)
    cluster_to_area = {}
    for aid, area in areas.items():
        for cid in area["cluster_ids"]:
            cluster_to_area[cid] = int(aid)

    for patent in data["patents"]:
        patent["area_id"] = cluster_to_area.get(patent["cluster_id"], None)

    # Write back
    data["areas"] = areas
    data["stats"]["total_areas"] = len(areas)

    with open("radar10-272364.json", "w") as f:
        json.dump(data, f, separators=(",", ":"))

    print(f"\nWrote {len(areas)} areas to radar10-272364.json")


if __name__ == "__main__":
    main()
