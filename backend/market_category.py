"""
Market Category Classification for Areas
Major / Growing / Sparse / Avoid
"""

from collections import defaultdict


MARKET_CATEGORIES = {
    "major": {
        "color": "#EF4444",
        "bgColor": "rgba(220, 38, 38, 0.1)",
        "label": "Major",
        "description": "Crowded market, established players",
    },
    "growing": {
        "color": "#22C55E",
        "bgColor": "rgba(22, 163, 74, 0.1)",
        "label": "Growing",
        "description": "Expanding market, good opportunity",
    },
    "sparse": {
        "color": "#6B7280",
        "bgColor": "rgba(107, 114, 128, 0.1)",
        "label": "Sparse",
        "description": "Under-explored, needs investigation",
    },
    "avoid": {
        "color": "#1F2937",
        "bgColor": "rgba(31, 41, 55, 0.1)",
        "label": "Avoid",
        "description": "Declining market",
    },
}

RECENT_YEARS = [2023, 2024, 2025]
HISTORICAL_YEARS = [2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022]


def calculate_year_trend(year_counts):
    if not year_counts:
        return 1.0

    recent_count = sum(year_counts.get(y, 0) for y in RECENT_YEARS)
    historical_count = sum(year_counts.get(y, 0) for y in HISTORICAL_YEARS)

    recent_avg = recent_count / len(RECENT_YEARS)
    historical_avg = historical_count / len(HISTORICAL_YEARS) if HISTORICAL_YEARS else 0

    if historical_avg == 0:
        if recent_count > 0:
            return 2.0
        else:
            return 1.0

    if recent_avg == 0:
        return 0.3

    trend = recent_avg / historical_avg
    return min(max(trend, 0.1), 5.0)


def classify_category(
    count,
    trend,
    max_count,
    high_threshold=0.6,
    trend_growing=1.3,
    trend_declining=0.7,
):
    count_ratio = count / max_count if max_count > 0 else 0
    is_high_count = count_ratio >= high_threshold

    if trend < trend_declining:
        return "avoid"

    if is_high_count:
        if trend > trend_growing:
            return "growing"
        return "major"

    if trend > trend_growing:
        return "growing"

    return "sparse"


def classify_areas(areas, use_global_threshold=True):
    if not areas:
        return areas

    max_count = max(a["count"] for a in areas.values())

    for area_id, area in areas.items():
        trend = calculate_year_trend(area.get("yearCounts", {}))
        area["trend"] = round(trend, 2)
        area["category"] = classify_category(
            count=area["count"],
            trend=trend,
            max_count=max_count,
        )

    return areas


def classify_areas_per_topic(areas):
    if not areas:
        return areas

    topic_areas = defaultdict(list)
    for area_id, area in areas.items():
        topic_id = area.get("topic_id", -1)
        topic_areas[topic_id].append((area_id, area))

    for topic_id, area_list in topic_areas.items():
        topic_max = max(a["count"] for _, a in area_list)

        for area_id, area in area_list:
            area["topic_category"] = classify_category(
                count=area["count"],
                trend=area.get("trend", 1.0),
                max_count=topic_max,
            )

    return areas


def get_category_summary(areas):
    counts = defaultdict(int)
    for area in areas.values():
        cat = area.get("category", "sparse")
        counts[cat] += 1

    summary = {}
    for cat_key, cat_info in MARKET_CATEGORIES.items():
        summary[cat_key] = {
            **cat_info,
            "count": counts[cat_key],
        }

    return summary
