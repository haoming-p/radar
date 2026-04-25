"""
Generate hot areas for Radar 1.0 heatmap tab by:
1. KDE on cluster centroids (weighted by count)
2. High-density contour extraction → disconnected polygons = hot spots
3. Point-in-polygon to find enclosed clusters
4. LLM labeling (GPT-4o-mini)

Writes "hot_areas" key into radar10-272364.json.

Usage: cd frontend/src/testData && python3 generate_radar10_hot_areas.py
  (Run from backend venv for scipy + openai access)
"""

import json
import sys
import os
from collections import Counter

import numpy as np
from scipy.stats import gaussian_kde
import matplotlib
matplotlib.use("Agg")
from matplotlib import pyplot as plt
from matplotlib.path import Path

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "..", "backend"))

# Same stopwords as generate_radar10_areas.py
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


def load_data():
    with open("radar10-272364.json") as f:
        return json.load(f)


def extract_hot_areas(clusters, density_percentile=75, min_clusters=3):
    """
    Use KDE + matplotlib contour to find high-density polygons.
    Returns list of hot areas with boundary polygons and enclosed cluster IDs.
    """
    # Build weighted points from cluster centroids
    cluster_list = sorted(clusters.values(), key=lambda c: c["id"])
    coords = np.array([[c["centroid"]["x"], c["centroid"]["y"]] for c in cluster_list])
    weights = np.array([max(1, c["count"]) for c in cluster_list])

    # Repeat points by weight for KDE (same as d3-contour approach)
    weighted_coords = np.repeat(coords, weights, axis=0)

    # Fit KDE
    kde = gaussian_kde(weighted_coords.T, bw_method=0.08)

    # Evaluate on grid
    x_min, x_max = coords[:, 0].min() - 1, coords[:, 0].max() + 1
    y_min, y_max = coords[:, 1].min() - 1, coords[:, 1].max() + 1
    grid_size = 200
    xi = np.linspace(x_min, x_max, grid_size)
    yi = np.linspace(y_min, y_max, grid_size)
    Xi, Yi = np.meshgrid(xi, yi)
    positions = np.vstack([Xi.ravel(), Yi.ravel()])
    Zi = kde(positions).reshape(Xi.shape)

    # Find threshold at given percentile of density values at cluster locations
    cluster_densities = kde(coords.T)
    threshold = np.percentile(cluster_densities, density_percentile)
    print(f"KDE density range: {Zi.min():.6f} - {Zi.max():.6f}")
    print(f"Threshold (p{density_percentile} of cluster densities): {threshold:.6f}")

    # Extract contour polygons at threshold using contourpy directly
    from contourpy import contour_generator
    gen = contour_generator(xi, yi, Zi, line_type="SeparateCode")
    result = gen.lines(threshold)
    vertices_list, codes_list = result

    hot_areas = []
    area_id = 1

    for vertices, codes in zip(vertices_list, codes_list):
        # Split into sub-polygons by MOVETO codes
        polygons = []
        current = []
        for v, c in zip(vertices, codes):
            if c == Path.MOVETO and current:
                if len(current) >= 3:
                    polygons.append(np.array(current))
                current = []
            current.append(v)
        if len(current) >= 3:
            polygons.append(np.array(current))

            for poly in polygons:
                mpl_path = Path(poly)

                # Find clusters inside this polygon
                inside_mask = mpl_path.contains_points(coords)
                inside_ids = [cluster_list[i]["id"] for i in range(len(cluster_list)) if inside_mask[i]]

                if len(inside_ids) < min_clusters:
                    continue

                # Compute centroid and patent count
                inside_clusters = [c for c in cluster_list if c["id"] in set(inside_ids)]
                total_patents = sum(c["count"] for c in inside_clusters)
                total_weight = sum(c["count"] for c in inside_clusters)
                cx = sum(c["centroid"]["x"] * c["count"] for c in inside_clusters) / total_weight
                cy = sum(c["centroid"]["y"] * c["count"] for c in inside_clusters) / total_weight

                # Simplify boundary polygon (reduce points for JSON size)
                # Keep every Nth point, ensuring we have at least 20 points
                n_points = len(poly)
                step = max(1, n_points // 40)
                simplified = poly[::step].tolist()
                # Close the polygon
                if simplified[0] != simplified[-1]:
                    simplified.append(simplified[0])

                # Keywords from enclosed clusters
                ckw_counter = Counter()
                for c in inside_clusters:
                    for kw in filter_keywords(c.get("compound_keywords", [])):
                        ckw_counter[kw] += 1

                trend_sum = sum(c["trend"] * c["count"] for c in inside_clusters)
                trend = trend_sum / total_patents if total_patents > 0 else 1.0

                hot_areas.append({
                    "id": area_id,
                    "centroid": {"x": round(cx, 4), "y": round(cy, 4)},
                    "cluster_ids": sorted(inside_ids),
                    "cluster_count": len(inside_ids),
                    "patent_count": total_patents,
                    "label": "",
                    "summary": "",
                    "keywords": ", ".join([kw for kw, _ in ckw_counter.most_common(15)]),
                    "trend": round(trend, 2),
                    "boundary": [[round(x, 4), round(y, 4)] for x, y in simplified],
                })
                area_id += 1

    # Sort by patent count descending
    hot_areas.sort(key=lambda a: a["patent_count"], reverse=True)
    # Re-assign IDs after sorting
    for i, area in enumerate(hot_areas, 1):
        area["id"] = i

    return hot_areas


def generate_llm_labels(hot_areas, clusters):
    """Call LLM to generate title + keywords + description for all hot areas."""
    try:
        from dotenv import load_dotenv
        load_dotenv(os.path.join(os.path.dirname(__file__), "..", "..", "..", "backend", ".env"), override=True)
        from openai import OpenAI
        client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
    except Exception as e:
        print(f"Warning: OpenAI not available ({e}). Using keyword-based labels.")
        for area in hot_areas:
            kw = area["keywords"].split(", ")[:3]
            area["label"] = ", ".join(kw) if kw else f"Hot Area {area['id']}"
            area["summary"] = ""
        return

    area_blocks = []
    for area in hot_areas:
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
            f"HOT AREA {area['id']} ({area['cluster_count']} clusters, {area['patent_count']} patents):\n"
            f"  Compound terms: {', '.join(top_compound)}\n"
            f"  Single terms: {', '.join(top_single)}"
        )

    areas_text = "\n\n".join(area_blocks)

    system_prompt = """You are a senior technology analyst helping executives quickly understand a patent landscape map.

You are given high-density hot spots detected on a patent heatmap. Each hot area is a concentration of related patents.

For each hot area, produce:
1. TITLE: A concise, specific phrase (1-7 words) that names the core technology focus.
   Good: "Lithium Battery Electrode Design", "Gas Turbine Combustion", "UAV Flight Control"
   Bad: "Various Technologies" (too vague), "fuel, gas, turbine" (just keywords)

2. KEYWORDS: Up to 8 curated, technology-specific keywords. No patent boilerplate.
   No duplicates across hot areas.

3. DESCRIPTION: 1-3 sentences explaining what this hot spot covers. Be specific.

Format your response as JSON array:
[
  {"id": 1, "title": "...", "keywords": ["kw1", "kw2", ...], "description": "..."},
  ...
]

Return ONLY the JSON array, no other text."""

    user_prompt = f"Here are {len(hot_areas)} high-density hot spots from a patent landscape heatmap:\n\n{areas_text}"

    print("\nGenerating LLM labels...")
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

        import re
        json_match = re.search(r'\[.*\]', raw, re.DOTALL)
        if json_match:
            results = json.loads(json_match.group())
        else:
            results = json.loads(raw)

        for item in results:
            aid = item["id"]
            matching = [a for a in hot_areas if a["id"] == aid]
            if matching:
                area = matching[0]
                area["label"] = item.get("title", area["label"])
                area["keywords"] = ", ".join(item.get("keywords", []))
                area["summary"] = item.get("description", "")
                print(f"  Hot Area {aid}: \"{area['label']}\"")

    except Exception as e:
        print(f"LLM call failed ({e}). Using keyword-based labels.")

    # Fallback for unlabeled
    for area in hot_areas:
        if not area["label"]:
            kw = area["keywords"].split(", ")[:3]
            area["label"] = ", ".join(kw) if kw else f"Hot Area {area['id']}"


def main():
    data = load_data()
    clusters = data["clusters"]
    print(f"Loaded {len(clusters)} clusters\n")

    # Extract hot areas from KDE contours
    hot_areas = extract_hot_areas(clusters, density_percentile=75, min_clusters=3)

    print(f"\nFound {len(hot_areas)} hot areas:")
    for area in hot_areas:
        print(f"  Hot Area {area['id']}: {area['cluster_count']} clusters, "
              f"{area['patent_count']} patents, {len(area['boundary'])} boundary pts")
        print(f"    Keywords: {area['keywords'][:80]}")

    # LLM labels
    generate_llm_labels(hot_areas, clusters)

    print("\nFinal hot areas:")
    for area in hot_areas:
        print(f"  {area['id']}. \"{area['label']}\" — {area['cluster_count']}cl, {area['patent_count']}p")

    # Write to JSON
    hot_areas_dict = {str(a["id"]): a for a in hot_areas}
    data["hot_areas"] = hot_areas_dict

    with open("radar10-272364.json", "w") as f:
        json.dump(data, f, separators=(",", ":"))

    print(f"\nWrote {len(hot_areas)} hot areas to radar10-272364.json")


if __name__ == "__main__":
    main()
