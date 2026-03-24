"""
Clustering: Agglomerative on embeddings → reduce centroids to 2D (both UMAP + t-SNE)

Flow:
1. Agglomerative clustering on 1536D embeddings (distance_threshold)
2. Compute cluster centroids in embedding space
3. Reduce centroids to 2D with BOTH UMAP and t-SNE
4. Each patent inherits its cluster's 2D positions
5. Label clusters (c-TF-IDF)
"""

import numpy as np
from typing import Dict, List, Any
from collections import defaultdict, Counter
from sklearn.cluster import AgglomerativeClustering

from dimensionality import reduce_dimensions
from labeling import generate_area_labels


def cluster_and_reduce(
    patents: List[Dict[str, Any]],
    embeddings: np.ndarray,
    distance_threshold: float = 1.1,
    random_state: int = 42,
) -> Dict[str, Any]:
    """
    1. Agglomerative clustering on full embeddings
    2. Reduce centroids to 2D with both UMAP and t-SNE
    3. Patents inherit cluster centroid positions
    """
    n_patents = embeddings.shape[0]

    # Step 1: Agglomerative clustering
    print(f"  Agglomerative clustering (distance_threshold={distance_threshold})...")
    agg = AgglomerativeClustering(
        n_clusters=None,
        distance_threshold=distance_threshold,
        linkage="ward",
    )
    labels = agg.fit_predict(embeddings)
    n_clusters = len(set(labels))
    print(f"  → {n_clusters} clusters from {n_patents} patents")

    # Step 2: Compute cluster centroids in embedding space
    cluster_indices = defaultdict(list)
    for i, label in enumerate(labels):
        cluster_indices[label].append(i)

    cluster_ids_sorted = sorted(cluster_indices.keys())
    centroids_hd = np.array([
        embeddings[cluster_indices[cid]].mean(axis=0)
        for cid in cluster_ids_sorted
    ])
    print(f"  Computed {len(centroids_hd)} centroids in {embeddings.shape[1]}D")

    # Step 3: Reduce centroids to 2D with BOTH methods
    print(f"  Reducing centroids to 2D (UMAP)...")
    coords_umap = reduce_dimensions(centroids_hd, method="umap", random_state=random_state)

    print(f"  Reducing centroids to 2D (t-SNE)...")
    coords_tsne = reduce_dimensions(centroids_hd, method="tsne", random_state=random_state)

    # Step 4: Build cluster data with both coordinate sets
    clusters = {}
    cluster_patent_indices = {}

    # Patent position arrays for both methods
    patent_positions_umap = np.zeros((n_patents, 2))
    patent_positions_tsne = np.zeros((n_patents, 2))

    for idx, cid in enumerate(cluster_ids_sorted):
        indices = cluster_indices[cid]
        ux, uy = float(coords_umap[idx, 0]), float(coords_umap[idx, 1])
        tx, ty = float(coords_tsne[idx, 0]), float(coords_tsne[idx, 1])

        # All patents in this cluster get the same positions
        for i in indices:
            patent_positions_umap[i] = [ux, uy]
            patent_positions_tsne[i] = [tx, ty]

        # Year counts
        year_counts = Counter()
        for i in indices:
            year = patents[i].get("year")
            if year:
                year_counts[year] += 1

        # Trend
        years = sorted(year_counts.keys())
        trend = 1.0
        if len(years) >= 2:
            mid = years[len(years) // 2]
            early = sum(c for y, c in year_counts.items() if y <= mid)
            late = sum(c for y, c in year_counts.items() if y > mid)
            trend = round(late / early, 2) if early > 0 else 1.0

        clusters[str(cid)] = {
            "id": cid,
            "centroid_umap": {"x": ux, "y": uy},
            "centroid_tsne": {"x": tx, "y": ty},
            "count": len(indices),
            "yearCounts": dict(year_counts),
            "trend": trend,
            "label": "",
        }
        cluster_patent_indices[cid] = indices

    # Step 5: Label clusters (c-TF-IDF)
    print("  Labeling clusters (c-TF-IDF)...")
    cluster_labels = generate_area_labels(
        patents, cluster_patent_indices, n_keywords=12
    )
    for cid_str, cluster in clusters.items():
        cluster["label"] = cluster_labels.get(int(cid_str), "unlabeled")

    # Step 6: Build output patents with both coordinate sets
    output_patents = []
    for i, patent in enumerate(patents):
        output_patents.append({
            "x_umap": float(patent_positions_umap[i, 0]),
            "y_umap": float(patent_positions_umap[i, 1]),
            "x_tsne": float(patent_positions_tsne[i, 0]),
            "y_tsne": float(patent_positions_tsne[i, 1]),
            "cluster_id": int(labels[i]),
            "title": patent.get("title", ""),
            "abstract": patent.get("abstract", ""),
            "year": patent.get("year"),
            "index": i,
        })

    sizes = [c["count"] for c in clusters.values()]
    print(f"  Cluster sizes: min={min(sizes)} max={max(sizes)} avg={np.mean(sizes):.1f}")

    return {
        "patents": output_patents,
        "clusters": clusters,
        "cluster_patent_indices": cluster_patent_indices,
        "cluster_labels": cluster_labels,
        "stats": {
            "total_patents": n_patents,
            "total_clusters": n_clusters,
            "avg_per_cluster": round(n_patents / max(n_clusters, 1), 2),
            "distance_threshold": distance_threshold,
        },
        "method": {
            "umap_params": {"spread": 3.0, "min_dist": 1.0},
            "tsne_params": {"perplexity": 30},
        },
    }
