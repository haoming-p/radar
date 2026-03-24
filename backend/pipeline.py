"""
Radar 1.2 Pipeline: CSV → JSON for frontend

Flow:
1. Load CSV with embeddings
2. Load normalized applicants
3. Agglomerative clustering on 1536D embeddings (~1500 clusters)
4. UMAP reduce cluster centroids to 2D
5. Label clusters (c-TF-IDF)
6. Area detection (TODO: from visual density)
7. Area labeling (LLM key phrase + summary)
8. Player data
9. Output JSON
"""

import json
import argparse
import ast
import csv
import numpy as np
import pandas as pd
from pathlib import Path
from collections import Counter, defaultdict

from spatial_grid import cluster_and_reduce
from labeling_llm import generate_macro_area_labels_llm


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


# ============ PLAYER DATA ============

def calculate_player_data(patents_with_clusters, applicants, clusters, top_n=20):
    if len(patents_with_clusters) != len(applicants):
        min_len = min(len(patents_with_clusters), len(applicants))
        patents_with_clusters = patents_with_clusters[:min_len]
        applicants = applicants[:min_len]

    applicant_patents = defaultdict(list)
    for i, applicant in enumerate(applicants):
        if applicant:
            applicant_patents[applicant].append(i)

    player_stats = []

    for applicant, patent_indices in applicant_patents.items():
        cluster_counts = Counter()
        yearly_counts = Counter()

        for idx in patent_indices:
            patent = patents_with_clusters[idx]
            cluster_id = patent.get("cluster_id")
            year = patent.get("year")

            if cluster_id is not None and cluster_id >= 0:
                cluster_counts[cluster_id] += 1
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
            "clusters": dict(cluster_counts),
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
    distance_threshold=1.1,
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

    # Step 2: Cluster + reduce to 2D (both UMAP and t-SNE)
    print(f"[2] Clustering + dimensionality reduction (both UMAP & t-SNE)")
    result = cluster_and_reduce(
        patents, embeddings,
        distance_threshold=distance_threshold,
        random_state=random_state,
    )
    clusters = result["clusters"]
    print(f"  {len(clusters)} clusters")

    # Step 3: Area detection (placeholder — TODO: visual density based)
    print(f"[3] Area detection (skipped for now)")
    areas = {}

    # Step 4: Player data
    players_dict = {}
    if applicants:
        print(f"[4] Player data")
        players_dict = calculate_player_data(
            result["patents"],
            applicants,
            clusters,
            top_n=top_players,
        )

    # Step 5: Output
    output = {
        "patents": result["patents"],
        "clusters": clusters,
        "areas": areas,
        "players": players_dict,
        "stats": {
            **result["stats"],
            "total_areas": len(areas),
            "total_players": len(players_dict),
        },
        "method": {
            "clustering": "agglomerative",
            "distance_threshold": distance_threshold,
            **result.get("method", {}),
        },
    }

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
    players = output.get("players", {})

    print("\n" + "=" * 50)
    print("SUMMARY")
    print("=" * 50)
    print(f"Patents:     {stats['total_patents']}")
    print(f"Clusters:    {stats['total_clusters']}")
    print(f"Areas:       {stats.get('total_areas', 0)}")
    print(f"Players:     {len(players)}")
    print(f"Method:      agglomerative (dt={method['distance_threshold']}) → {method['dimensionality']}")
    if players:
        print("Top 5 Players:")
        for name, data in list(players.items())[:5]:
            print(f"  {name}: {data['total']} patents (trend: {data['trend']})")
    print("=" * 50)


def main():
    parser = argparse.ArgumentParser(description="Radar 1.2 patent analysis pipeline")

    parser.add_argument("input", help="Input CSV with embeddings")
    parser.add_argument("output", help="Output JSON")

    parser.add_argument("--applicants", type=str, default=None)
    parser.add_argument("--dim", type=str, default="umap",
                        choices=["umap", "tsne", "pca"])
    parser.add_argument("--distance-threshold", type=float, default=1.1)
    parser.add_argument("--top-players", type=int, default=20)
    parser.add_argument("--seed", type=int, default=42)

    args = parser.parse_args()

    run_pipeline(
        input_path=args.input,
        output_path=args.output,
        applicants_path=args.applicants,
        dim_method=args.dim,
        distance_threshold=args.distance_threshold,
        top_players=args.top_players,
        random_state=args.seed,
    )


if __name__ == "__main__":
    main()
