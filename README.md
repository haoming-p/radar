# Radar 1.2 - Patent Landscape Analysis

A standalone patent analysis application that visualizes patent landscapes as interactive 2D maps. Built for the ValueNex platform.

## What It Does

Takes a dataset of patents, projects them onto a 2D map using machine learning, and provides multiple analytical views to understand the technology landscape:

1. **Territory Zones** - Major technology regions
2. **Hot Map** - High-density concentration zones
3. **Areas** - Interactive contour exploration
4. **Player Trend** - Top patent applicants and their activity

---

## Architecture

```
Frontend (React/Vite)          Backend (FastAPI)
  - Interactive map              - Embedding (OpenAI)
  - Sidebar analysis             - Clustering (HDBSCAN)
  - Timeline visualization       - Dimensionality reduction
                                 - Labeling (c-TF-IDF + LLM)
```

- **Frontend:** React + TypeScript + Vite, deployed on Vercel
- **Backend:** FastAPI + uvicorn, deployed on AWS Lightsail

---

## Pipeline (Backend)

The backend processes raw patent text through a multi-step pipeline:

### 1. Embedding - `text-embedding-3-small`
Converts patent titles + abstracts into 1536-dimensional vectors using OpenAI's embedding model. Each patent becomes a point in high-dimensional space where similar patents are close together.

### 2. Clustering - `HDBSCAN`
Groups nearby patents into clusters. HDBSCAN (Hierarchical Density-Based Spatial Clustering of Applications with Noise) is chosen because:
- It automatically determines the number of clusters (no need to pre-specify K)
- It handles noise - outlier patents that don't belong to any cluster are excluded
- It works well with non-uniform density - some technology areas have many patents, others few

Parameters: `min_cluster_size=20`, `min_samples=5`

### 3. Dimensionality Reduction - `UMAP` / `t-SNE`
Projects the 1536-dimensional embedding space down to 2D for visualization.

- **UMAP** (Uniform Manifold Approximation and Projection): Better at preserving global structure - clusters that are related in high-D stay close in 2D. Parameters: `spread=3.0`, `min_dist=1.0`
- **t-SNE** (t-distributed Stochastic Neighbor Embedding): Better at separating local clusters. Parameter: `perplexity=30`

### 4. Labeling - `c-TF-IDF` + `GPT-4o-mini`
Each cluster gets a descriptive label:
- **c-TF-IDF** (class-based Term Frequency-Inverse Document Frequency): Extracts the most distinctive keywords per cluster compared to all other clusters. Fast, deterministic, no API calls.
- **GPT-4o-mini**: Takes the top keywords and generates a human-readable label. Used for comparison and enrichment.

### 5. Spatial Grid
Assigns each patent a position on the 2D map with `grid_size=1.2` spacing to avoid overlapping dots.

---

## Analysis Views (Frontend)

### Territory Zones
**Algorithm: DBSCAN + Agglomerative Clustering**

Divides the patent landscape into major technology regions:
1. **DBSCAN** (`eps=0.5`, `min_samples=5`) first pass: identifies dense core clusters and excludes outliers (196 out of 1500 clusters excluded as noise)
2. **Agglomerative Clustering** (Ward linkage, target=7 groups) second pass: merges the core clusters into a manageable number of territory zones based on spatial proximity
3. **GPT-4o-mini** generates titles, keywords, and descriptions for each zone

Why two-step: DBSCAN removes noise so the zones are clean; agglomerative gives us control over the final count and produces intuitive spatial groupings.

Displayed as convex hulls on the map - the active zone is solid, others are shown as faint dashed outlines.

### Hot Map
**Algorithm: Kernel Density Estimation (KDE) + Contour Extraction**

Shows where patents are most concentrated as a heatmap:
1. **Gaussian KDE** (scipy) on cluster centroids, weighted by patent count per cluster
2. **d3-contour** (frontend) generates density contour lines with logarithmic + linear threshold spacing to capture both outlier peaks and broad hot zones
3. Contour boundaries at a chosen density level become the hot area outlines
4. **GPT-4o-mini** labels each hot area

Why KDE on cluster centroids (not individual patents): Using centroids weighted by count gives smoother, more meaningful density - it represents "technology concentration" rather than just "patent count at a pixel."

Color ramp: blue (low density) to green to yellow to red (highest density).

### Areas (Explore)
**Algorithm: Point-in-Polygon (Ray Casting)**

Interactive exploration - click anywhere on the heatmap to select the tightest contour polygon containing that point:
- Uses ray casting algorithm (`pointInPolygon`) to test containment
- Scroll to expand/contract the selection to larger/smaller contour levels
- Shows enclosed cluster count, patent count, and top keywords

### Player Trend
**Algorithm: Density-based Neighborhood Center**

Shows top patent applicants and their positioning on the map:
1. **CSV parsing** extracts applicant names from patent data
2. **Case-insensitive deduplication** merges variants (e.g., "ROLLS-ROYCE plc" and "ROLLS-ROYCE PLC" become one entity with 65 patents instead of appearing as two with 46 and 19)
3. **Density center** for map positioning: instead of averaging all patent positions (which can land in empty space between two clusters), we find the densest neighborhood:
   - For each patent, count how many of that player's other patents are within 60% of the overall spread
   - The patent with the most neighbors defines the "peak"
   - Center = average position of that neighborhood
   - Radius = standard deviation of that neighborhood
4. **Per-year breakdown** with the same density center algorithm, so the circle moves to where the player was actually filing that year
5. **Timeline** shows yearly filing counts with top keywords per year

Players with blank applicant fields (67% of this dataset) are excluded for now - a future phase will use LLM-based entity resolution to fill gaps and merge name variants.

---

## Data

The demo uses a dataset of 5,000 patents (`raw-272364.csv`) processed into:
- 1,500 clusters
- 7 territory zones
- 4 hot areas
- 20 top players (from the 33% of patents with applicant data)

Processed data is stored in `radar10-272364.json` with patents, clusters, areas, and hot_areas.

---

## Running Locally

```bash
# Backend
cd backend
pip install -r requirements.txt
python server.py

# Frontend
cd frontend
npm install
npm run dev
```

Set `VITE_API_URL` to point to the backend (defaults to localhost).
