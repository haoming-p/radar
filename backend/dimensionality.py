import numpy as np
from typing import Literal
from sklearn.manifold import TSNE
from sklearn.decomposition import PCA

try:
    from umap import UMAP
    UMAP_AVAILABLE = True
except ImportError:
    UMAP_AVAILABLE = False

DimMethod = Literal["umap", "tsne", "pca"]


def reduce_dimensions(
    embeddings: np.ndarray,
    method: DimMethod = "umap",
    random_state: int = 42,
    **kwargs
) -> np.ndarray:
    if method == "umap":
        return _reduce_umap(embeddings, random_state, **kwargs)
    elif method == "tsne":
        return _reduce_tsne(embeddings, random_state, **kwargs)
    elif method == "pca":
        return _reduce_pca(embeddings, random_state, **kwargs)
    else:
        raise ValueError(f"Unknown method: {method}. Use 'umap', 'tsne', or 'pca'")


def _reduce_umap(
    embeddings: np.ndarray,
    random_state: int = 42,
    n_neighbors: int = 15,
    min_dist: float = 1.0,
    spread: float = 3.0,
    metric: str = "cosine",
    **kwargs
) -> np.ndarray:
    if not UMAP_AVAILABLE:
        raise ImportError("UMAP not installed. Run: pip install umap-learn")

    print(f"Running UMAP (n_neighbors={n_neighbors}, min_dist={min_dist}, spread={spread})...")

    reducer = UMAP(
        n_components=2,
        n_neighbors=n_neighbors,
        min_dist=min_dist,
        spread=spread,
        metric=metric,
        random_state=random_state,
        **kwargs
    )

    coords = reducer.fit_transform(embeddings)
    print(f"UMAP complete: {embeddings.shape} → {coords.shape}")

    return coords


def _reduce_tsne(
    embeddings: np.ndarray,
    random_state: int = 42,
    perplexity: float = 30.0,
    learning_rate: str = "auto",
    n_iter: int = 1000,
    **kwargs
) -> np.ndarray:
    print(f"Running t-SNE (perplexity={perplexity}, n_iter={n_iter})...")

    if embeddings.shape[1] > 50:
        print("  Pre-reducing with PCA to 50 dims...")
        pca = PCA(n_components=50, random_state=random_state)
        embeddings = pca.fit_transform(embeddings)

    reducer = TSNE(
        n_components=2,
        perplexity=perplexity,
        learning_rate=learning_rate,
        max_iter=n_iter,
        random_state=random_state,
        init="pca",
        **kwargs
    )

    coords = reducer.fit_transform(embeddings)
    print(f"t-SNE complete: {embeddings.shape} → {coords.shape}")

    return coords


def _reduce_pca(
    embeddings: np.ndarray,
    random_state: int = 42,
    **kwargs
) -> np.ndarray:
    print("Running PCA...")

    reducer = PCA(
        n_components=2,
        random_state=random_state,
        **kwargs
    )

    coords = reducer.fit_transform(embeddings)
    print(f"PCA complete: {embeddings.shape} → {coords.shape}")

    variance_ratio = reducer.explained_variance_ratio_
    print(f"  Variance explained: {variance_ratio[0]:.1%} + {variance_ratio[1]:.1%} = {sum(variance_ratio):.1%}")

    return coords


def list_available_methods() -> list[DimMethod]:
    methods = ["tsne", "pca"]
    if UMAP_AVAILABLE:
        methods.insert(0, "umap")
    return methods
