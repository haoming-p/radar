"""
Clustering Methods: HDBSCAN, K-means, Agglomerative
Clusters on original embeddings
"""

import numpy as np
from collections import Counter
from sklearn.cluster import KMeans, AgglomerativeClustering, HDBSCAN


def cluster_patents(embeddings, method="hdbscan", **kwargs):
    if method == "hdbscan":
        return _cluster_hdbscan(embeddings, **kwargs)
    elif method == "kmeans":
        return _cluster_kmeans(embeddings, **kwargs)
    elif method == "agglomerative":
        return _cluster_agglomerative(embeddings, **kwargs)
    else:
        raise ValueError(f"Unknown method: {method}")


# ============ HDBSCAN ============

def _cluster_hdbscan(embeddings, min_cluster_size=None, min_samples=5, metric="euclidean", **kwargs):
    n_samples, n_features = embeddings.shape

    if min_cluster_size is None:
        min_cluster_size = max(10, int(np.log(n_samples) * 3))

    print(f"HDBSCAN: clustering {n_samples} patents ({n_features}D)")
    print(f"  min_cluster_size={min_cluster_size}, min_samples={min_samples}")

    clusterer = HDBSCAN(
        min_cluster_size=min_cluster_size,
        min_samples=min_samples,
        metric=metric,
        **kwargs
    )

    labels = clusterer.fit_predict(embeddings)

    n_clusters = len(set(labels)) - (1 if -1 in labels else 0)
    n_noise = int((labels == -1).sum())

    print(f"  → {n_clusters} topics, {n_noise} noise ({n_noise/n_samples*100:.1f}%)")

    return {
        "labels": labels,
        "n_clusters": n_clusters,
        "n_noise": n_noise,
        "method": "hdbscan",
        "method_params": {
            "min_cluster_size": min_cluster_size,
            "min_samples": min_samples,
            "metric": metric,
        }
    }


# ============ K-means ============

def _cluster_kmeans(embeddings, n_clusters=None, random_state=42, **kwargs):
    n_samples, n_features = embeddings.shape

    if n_clusters is None:
        n_clusters = int(np.clip(np.sqrt(n_samples / 2), 10, 100))

    print(f"K-means: clustering {n_samples} patents ({n_features}D)")
    print(f"  n_clusters={n_clusters}")

    clusterer = KMeans(
        n_clusters=n_clusters,
        random_state=random_state,
        n_init=10,
        **kwargs
    )

    labels = clusterer.fit_predict(embeddings)

    sizes = list(Counter(labels).values())
    print(f"  → sizes: min={min(sizes)}, max={max(sizes)}, avg={np.mean(sizes):.0f}")

    return {
        "labels": labels,
        "n_clusters": n_clusters,
        "n_noise": 0,
        "method": "kmeans",
        "method_params": {
            "n_clusters": n_clusters,
            "random_state": random_state,
        },
    }


# ============ Agglomerative ============

def _cluster_agglomerative(embeddings, n_levels=4, level_clusters=None, linkage_method="ward", **kwargs):
    n_samples, n_features = embeddings.shape

    if level_clusters is None:
        max_clusters = int(np.clip(np.sqrt(n_samples), 50, 200))
        level_clusters = _generate_level_sizes(n_levels, max_clusters)

    print(f"Agglomerative: clustering {n_samples} patents ({n_features}D)")
    print(f"  levels={level_clusters}")

    levels = []
    for i, n_clust in enumerate(level_clusters):
        clusterer = AgglomerativeClustering(
            n_clusters=n_clust,
            linkage=linkage_method,
        )
        labels = clusterer.fit_predict(embeddings)

        levels.append({
            "level": i + 1,
            "n_clusters": n_clust,
            "labels": labels.tolist(),
            "name": f"Level {i + 1} ({n_clust} topics)",
        })

    parent_map = _build_parent_map(levels)

    finest = levels[-1]
    print(f"  → {len(levels)} levels, finest has {finest['n_clusters']} topics")

    return {
        "labels": np.array(finest["labels"]),
        "n_clusters": finest["n_clusters"],
        "n_noise": 0,
        "method": "agglomerative",
        "method_params": {
            "n_levels": n_levels,
            "level_clusters": level_clusters,
            "linkage_method": linkage_method,
        },
        "hierarchy": {
            "levels": levels,
            "parent_map": parent_map,
        }
    }


def _generate_level_sizes(n_levels, max_clusters):
    min_clusters = 5
    ratio = (max_clusters / min_clusters) ** (1 / (n_levels - 1))
    sizes = [int(min_clusters * (ratio ** i)) for i in range(n_levels)]
    return sizes


def _build_parent_map(levels):
    parent_map = {}

    for i in range(1, len(levels)):
        child_labels = np.array(levels[i]["labels"])
        parent_labels = np.array(levels[i - 1]["labels"])

        mapping = {}
        for child_id in range(levels[i]["n_clusters"]):
            mask = child_labels == child_id
            if mask.sum() > 0:
                parent_counts = Counter(parent_labels[mask])
                mapping[child_id] = parent_counts.most_common(1)[0][0]

        parent_map[f"level_{i+1}_to_{i}"] = mapping

    return parent_map


# ============ Utilities ============

def get_cluster_stats(labels):
    counts = Counter(labels)
    cluster_sizes = [c for k, c in counts.items() if k != -1]

    return {
        "n_clusters": len(cluster_sizes),
        "n_noise": counts.get(-1, 0),
        "n_total": len(labels),
        "avg_size": np.mean(cluster_sizes) if cluster_sizes else 0,
        "min_size": min(cluster_sizes) if cluster_sizes else 0,
        "max_size": max(cluster_sizes) if cluster_sizes else 0,
    }


def list_available_methods():
    return ["hdbscan", "kmeans", "agglomerative"]
