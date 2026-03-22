"""
Spatial Grid: Divide map into geographic areas
"""

import numpy as np
from typing import Dict, List, Any, Optional
from collections import defaultdict, Counter

from labeling import generate_area_labels


def create_areas(
    patents: List[Dict[str, Any]],
    coords: np.ndarray,
    topic_labels: np.ndarray,
    grid_size: float = 6.0,
    min_patents_per_area: int = 2,
) -> Dict[str, Any]:
    n_patents = len(patents)

    print(f"Creating spatial grid (grid_size={grid_size})...")

    # Step 1: Assign each patent to a grid cell
    cell_patents = defaultdict(list)

    for i in range(n_patents):
        x, y = coords[i]
        cell_x = int(x // grid_size)
        cell_y = int(y // grid_size)
        cell_key = f"{cell_x}_{cell_y}"

        cell_patents[cell_key].append({
            "index": i,
            "x": float(x),
            "y": float(y),
            "topic_id": int(topic_labels[i]),
            "year": patents[i].get("year", 2020),
            "title": patents[i].get("title", ""),
            "abstract": patents[i].get("abstract", ""),
        })

    # Step 2: Create areas from cells with enough patents
    areas = {}
    area_id = 0
    patent_area_map = {}
    area_patent_indices = {}
    small_cells = []

    for cell_key, cell_patents_list in cell_patents.items():
        if len(cell_patents_list) >= min_patents_per_area:
            area = _create_area(area_id, cell_key, cell_patents_list)
            areas[str(area_id)] = area

            area_patent_indices[area_id] = []
            for p in cell_patents_list:
                patent_area_map[p["index"]] = area_id
                area_patent_indices[area_id].append(p["index"])

            area_id += 1
        else:
            small_cells.extend(cell_patents_list)

    # Step 3: Assign small cell patents to nearest area
    for patent in small_cells:
        nearest = _find_nearest_area(patent["x"], patent["y"], areas)
        patent_area_map[patent["index"]] = nearest
        if nearest is not None and str(nearest) in areas:
            areas[str(nearest)]["count"] += 1
            if nearest in area_patent_indices:
                area_patent_indices[nearest].append(patent["index"])
            year = patent["year"]
            if year:
                year_counts = areas[str(nearest)]["yearCounts"]
                year_counts[year] = year_counts.get(year, 0) + 1

    # Step 4: Generate area labels
    print("Generating area-level labels...")
    area_labels = generate_area_labels(patents, area_patent_indices, n_keywords=12)

    for area_id_str, area in areas.items():
        area_id_int = int(area_id_str)
        area["label"] = area_labels.get(area_id_int, "unlabeled")

    # Step 5: Build output patents list
    output_patents = []
    for i, patent in enumerate(patents):
        output_patents.append({
            "x": float(coords[i][0]),
            "y": float(coords[i][1]),
            "area_id": patent_area_map.get(i, -1),
            "topic_id": int(topic_labels[i]),
            "title": patent.get("title", ""),
            "abstract": patent.get("abstract", ""),
            "year": patent.get("year"),
            "index": i,
        })

    # Step 6: Calculate stats
    stats = {
        "total_patents": n_patents,
        "total_areas": len(areas),
        "avg_per_area": round(n_patents / max(len(areas), 1), 2),
        "grid_size": grid_size,
        "small_cell_patents": len(small_cells),
    }

    print(f"  → {stats['total_areas']} areas created")
    print(f"  → {stats['small_cell_patents']} patents reassigned from small cells")

    return {
        "patents": output_patents,
        "areas": areas,
        "stats": stats,
    }


def _create_area(
    area_id: int,
    cell_key: str,
    patents: List[Dict[str, Any]],
) -> Dict[str, Any]:
    centroid_x = np.mean([p["x"] for p in patents])
    centroid_y = np.mean([p["y"] for p in patents])

    topic_ids = [p["topic_id"] for p in patents if p["topic_id"] != -1]
    if topic_ids:
        topic_counts = Counter(topic_ids)
        dominant_topic = topic_counts.most_common(1)[0][0]
        dominance = topic_counts.most_common(1)[0][1] / len(patents)
    else:
        dominant_topic = -1
        dominance = 0

    year_counts = defaultdict(int)
    for p in patents:
        if p["year"]:
            year_counts[p["year"]] += 1

    return {
        "id": area_id,
        "cell_key": cell_key,
        "centroid": {"x": float(centroid_x), "y": float(centroid_y)},
        "count": len(patents),
        "topic_id": int(dominant_topic),
        "topic_dominance": round(dominance, 2),
        "yearCounts": dict(year_counts),
        "label": "",
    }


def _find_nearest_area(
    x: float,
    y: float,
    areas: Dict[str, Dict[str, Any]],
) -> Optional[int]:
    if not areas:
        return None

    min_dist = float("inf")
    nearest = None

    for area_id, area in areas.items():
        centroid = area["centroid"]
        dist = (x - centroid["x"]) ** 2 + (y - centroid["y"]) ** 2
        if dist < min_dist:
            min_dist = dist
            nearest = int(area_id)

    return nearest


def build_topic_hierarchy(
    areas: Dict[str, Dict[str, Any]],
    topic_labels_dict: Dict[int, str],
) -> Dict[str, Dict[str, Any]]:
    topics = defaultdict(lambda: {"areas": [], "totalPatents": 0})

    for area_id, area in areas.items():
        topic_id = area.get("topic_id", -1)
        if topic_id == -1:
            continue

        topics[topic_id]["areas"].append({
            "area_id": int(area_id),
            "count": area["count"],
            "category": area.get("category", "sparse"),
            "topic_category": area.get("topic_category", "sparse"),
            "trend": area.get("trend", 1.0),
            "centroid": area["centroid"],
            "label": area.get("label", ""),
        })
        topics[topic_id]["totalPatents"] += area["count"]

    result = {}
    for topic_id, data in topics.items():
        data["areas"].sort(key=lambda x: -x["count"])

        result[str(topic_id)] = {
            "id": topic_id,
            "label": topic_labels_dict.get(topic_id, "unlabeled"),
            "totalPatents": data["totalPatents"],
            "areaCount": len(data["areas"]),
            "areas": data["areas"],
        }

    print(f"Built hierarchy: {len(result)} topics")
    return result
