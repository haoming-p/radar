"""
Main Pipeline: CSV → JSON for frontend

Flow:
1. Load CSV with embeddings
2. Load normalized applicants
3. Cluster on 1536D embeddings (HDBSCAN/K-means/Agglomerative)
4. Reduce dimensions for layout (UMAP/t-SNE/PCA → 2D)
5. Label topics and areas
   - c-TF-IDF: local, fast, keyword-based (labeling.py)
   - LLM: GPT-4o-mini, keywords with scores + summary (labeling_llm.py)
6. Spatial grid + area labels
7. Market categories (Growing/Niche/Major/Declining)
8. Topic hierarchy
9. Calculate player data from normalized applicants
10. Output JSON with players
"""

import json
import argparse
import ast
import csv
import numpy as np
import pandas as pd
from pathlib import Path
from collections import Counter, defaultdict

from dimensionality import reduce_dimensions
from clustering import cluster_patents
from labeling import generate_topic_labels
from labeling_llm import generate_topic_labels_llm
from spatial_grid import create_areas, build_topic_hierarchy
from market_category import (
    classify_areas,
    classify_areas_per_topic,
    get_category_summary,
)


# ============ LOAD FUNCTIONS ============

def load_patents(filepath):
    df = pd.read_csv(filepath)

    title_col = "title" if "title" in df.columns else "Title"
    abstract_col = "abstract" if "abstract" in df.columns else "Abstract"
    year_col = "year" if "year" in df.columns else "Year"
    embedding_col = "search_embedding"

    embeddings = np.array([
        ast.literal_eval(e) if isinstance(e, str) else e
        for e in df[embedding_col]
    ])

    patents = []
    for i, row in df.iterrows():
        patents.append({
            "title": str(row.get(title_col, "")),
            "abstract": str(row.get(abstract_col, "")),
            "year": int(row[year_col]) if pd.notna(row.get(year_col)) else None,
        })

    print(f"  Loaded {len(patents)} patents, embeddings: {embeddings.shape}")
    return patents, embeddings


def load_normalized_applicants(filepath):
    applicants = []

    with open(filepath, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)

        applicants_col = None
        for col in reader.fieldnames:
            if 'applicant' in col.lower():
                applicants_col = col
                break

        if not applicants_col:
            print(f"  No applicants column found!")
            return []

        for row in reader:
            applicant = row.get(applicants_col, "").strip()
            applicants.append(applicant)

    unique_count = len(set(a for a in applicants if a))
    print(f"  Loaded {len(applicants)} rows, {unique_count} unique applicants")
    return applicants


# ============ PLAYER DATA CALCULATION ============

def calculate_player_data(patents_with_areas, applicants, areas, top_n=20):
    if len(patents_with_areas) != len(applicants):
        min_len = min(len(patents_with_areas), len(applicants))
        patents_with_areas = patents_with_areas[:min_len]
        applicants = applicants[:min_len]

    applicant_patents = defaultdict(list)
    for i, applicant in enumerate(applicants):
        if applicant:
            applicant_patents[applicant].append(i)

    player_stats = []

    for applicant, patent_indices in applicant_patents.items():
        area_counts = Counter()
        yearly_counts = Counter()

        for idx in patent_indices:
            patent = patents_with_areas[idx]
            area_id = patent.get("area_id")
            year = patent.get("year")

            if area_id is not None and area_id >= 0:
                area_counts[area_id] += 1
            if year:
                yearly_counts[year] += 1

        years = sorted(yearly_counts.keys())
        if len(years) >= 2:
            mid_year = years[len(years) // 2]
            early = sum(c for y, c in yearly_counts.items() if y <= mid_year)
            late = sum(c for y, c in yearly_counts.items() if y > mid_year)
            trend = round(late / early, 2) if early > 0 else 1.0
        else:
            trend = 1.0

        player_stats.append({
            "name": applicant,
            "total": len(patent_indices),
            "trend": trend,
            "areas": dict(area_counts),
            "yearly": dict(yearly_counts),
        })

    player_stats.sort(key=lambda x: x["total"], reverse=True)
    top_players = player_stats[:top_n]

    for i, player in enumerate(top_players):
        player["rank"] = i + 1

    players_dict = {}
    for player in top_players:
        name = player.pop("name")
        players_dict[name] = player

    print(f"  Top {len(players_dict)} players extracted")
    return players_dict


# ============ MAIN PIPELINE ============

def run_pipeline(
    input_path,
    output_path,
    applicants_path=None,
    dim_method="umap",
    cluster_method="hdbscan",
    grid_size=1.5,
    min_cluster_size=15,
    min_samples=5,
    k=None,
    levels=4,
    level_clusters=None,
    top_players=20,
    random_state=42,
):
    # Step 1: Load patents and embeddings
    print("[1] Loading patents...")
    patents, embeddings = load_patents(input_path)

    # Step 1b: Load normalized applicants
    applicants = []
    if applicants_path:
        print("[1b] Loading applicants...")
        applicants = load_normalized_applicants(applicants_path)
    else:
        input_dir = Path(input_path).parent
        default_path = input_dir / "population_normalized.csv"
        if default_path.exists():
            print("[1b] Loading applicants...")
            applicants = load_normalized_applicants(str(default_path))

    # Step 2: Cluster
    print(f"[2] Clustering: {cluster_method}")
    cluster_kwargs = {}
    if cluster_method == "hdbscan":
        cluster_kwargs["min_cluster_size"] = min_cluster_size
        cluster_kwargs["min_samples"] = min_samples
    elif cluster_method == "kmeans":
        if k:
            cluster_kwargs["n_clusters"] = k
    elif cluster_method == "agglomerative":
        cluster_kwargs["n_levels"] = levels
        if level_clusters:
            cluster_kwargs["level_clusters"] = level_clusters

    cluster_result = cluster_patents(embeddings, method=cluster_method, **cluster_kwargs)
    topic_labels = cluster_result["labels"]
    print(f"  {cluster_result['n_clusters']} topics, {cluster_result.get('n_noise', 0)} noise")

    # Step 3: Reduce dimensions
    print(f"[3] Dimensionality: {dim_method}")
    coords = reduce_dimensions(embeddings, method=dim_method, random_state=random_state)
    print(f"  Reduced to 2D")

    # Step 4: Labels
    print(f"[4] Labeling (c-TF-IDF)")
    topic_labels_dict = generate_topic_labels(patents, topic_labels)
    print(f"  {len(topic_labels_dict)} topic labels")

    # Step 4b: LLM Labels (comparison)
    print(f"[4b] Labeling (LLM) — comparison")
    topic_labels_llm = generate_topic_labels_llm(patents, topic_labels)

    # Print comparison for up to 3 topics
    compare_ids = list(topic_labels_dict.keys())[:3]
    if compare_ids:
        print("\n" + "=" * 70)
        print("LABEL COMPARISON: c-TF-IDF vs LLM")
        print("=" * 70)
        for tid in compare_ids:
            tfidf_label = topic_labels_dict.get(tid, "N/A")
            llm_data = topic_labels_llm.get(tid, {})
            llm_keywords = llm_data.get("keywords", [])
            llm_summary = llm_data.get("summary", "")
            print(f"\n--- Topic {tid} ---")
            print(f"  c-TF-IDF:  {tfidf_label}")
            print(f"  LLM keys:  {', '.join(f'{k['term']}({k['score']})' for k in llm_keywords[:8])}")
            if llm_summary:
                print(f"  LLM summary: {llm_summary}")
        print("=" * 70 + "\n")

    # Step 5: Spatial grid
    print(f"[5] Spatial grid (grid_size={grid_size})")
    grid_result = create_areas(patents, coords, topic_labels, grid_size=grid_size)
    print(f"  {grid_result['stats']['total_areas']} areas")

    # Step 6: Market categories
    print(f"[6] Market categories")
    areas = grid_result["areas"]
    areas = classify_areas(areas)
    areas = classify_areas_per_topic(areas)
    category_summary = get_category_summary(areas)
    print(f"  Classified {len(areas)} areas")

    # Step 7: Topic hierarchy
    print(f"[7] Topic hierarchy")
    topics = build_topic_hierarchy(areas, topic_labels_dict)
    print(f"  {len(topics)} topics")

    # Step 8: Player data
    players_dict = {}
    if applicants:
        print(f"[8] Player data")
        players_dict = calculate_player_data(
            grid_result["patents"],
            applicants,
            areas,
            top_n=top_players
        )

    # Step 9: Output
    output = {
        "patents": grid_result["patents"],
        "areas": areas,
        "topics": topics,
        "categories": category_summary,
        "players": players_dict,
        "stats": {
            **grid_result["stats"],
            "total_topics": cluster_result["n_clusters"],
            "noise_patents": cluster_result.get("n_noise", 0),
            "total_players": len(players_dict),
        },
        "method": {
            "dimensionality": dim_method,
            "clustering": cluster_method,
            "cluster_params": cluster_result["method_params"],
            "grid_size": grid_size,
            "clustered_on": "embeddings",
        },
    }

    if cluster_method == "agglomerative" and "hierarchy" in cluster_result:
        output["hierarchy"] = cluster_result["hierarchy"]

    with open(output_path, "w") as f:
        json.dump(_convert_for_json(output), f, indent=2)

    print(f"\n  Saved to {output_path}")
    _print_summary(output)
    return output


def _convert_for_json(obj):
    if isinstance(obj, np.ndarray):
        return obj.tolist()
    if isinstance(obj, np.integer):
        return int(obj)
    if isinstance(obj, np.floating):
        return float(obj)
    if isinstance(obj, dict):
        return {k: _convert_for_json(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_convert_for_json(v) for v in obj]
    return obj


def _print_summary(output):
    stats = output["stats"]
    method = output["method"]
    categories = output["categories"]
    players = output.get("players", {})

    print("\n" + "=" * 50)
    print("SUMMARY")
    print("=" * 50)
    print(f"Patents:     {stats['total_patents']}")
    print(f"Topics:      {stats['total_topics']}")
    print(f"Areas:       {stats['total_areas']}")
    print(f"Noise:       {stats['noise_patents']}")
    print(f"Players:     {len(players)}")
    print(f"Method:      {method['dimensionality']} + {method['clustering']}")
    print(f"Grid size:   {method['grid_size']}")
    print("Categories:")
    for cat, info in categories.items():
        print(f"  {cat}: {info['count']} areas")
    if players:
        print("Top 5 Players:")
        for name, data in list(players.items())[:5]:
            print(f"  {name}: {data['total']} patents (trend: {data['trend']})")
    print("=" * 50)


def main():
    parser = argparse.ArgumentParser(description="Patent clustering pipeline")

    parser.add_argument("input", help="Input CSV with embeddings")
    parser.add_argument("output", help="Output JSON")

    parser.add_argument("--applicants", type=str, default=None)
    parser.add_argument("--dim", type=str, default="umap",
                        choices=["umap", "tsne", "pca"])
    parser.add_argument("--cluster", type=str, default="hdbscan",
                        choices=["hdbscan", "kmeans", "agglomerative"])
    parser.add_argument("--grid-size", type=float, default=1.5)
    parser.add_argument("--min-cluster-size", type=int, default=15)
    parser.add_argument("--min-samples", type=int, default=5)
    parser.add_argument("--k", type=int, default=None)
    parser.add_argument("--levels", type=int, default=4)
    parser.add_argument("--level-clusters", type=str, default=None)
    parser.add_argument("--top-players", type=int, default=20)
    parser.add_argument("--seed", type=int, default=42)

    args = parser.parse_args()

    level_clusters = None
    if args.level_clusters:
        level_clusters = [int(x) for x in args.level_clusters.split(",")]

    run_pipeline(
        input_path=args.input,
        output_path=args.output,
        applicants_path=args.applicants,
        dim_method=args.dim,
        cluster_method=args.cluster,
        grid_size=args.grid_size,
        min_cluster_size=args.min_cluster_size,
        min_samples=args.min_samples,
        k=args.k,
        levels=args.levels,
        level_clusters=level_clusters,
        top_players=args.top_players,
        random_state=args.seed,
    )


if __name__ == "__main__":
    main()
