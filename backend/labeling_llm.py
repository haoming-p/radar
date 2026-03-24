"""
LLM-based labeling for patent clusters.

For each cluster/area, samples patent titles and asks GPT-4o-mini to produce:
- Keywords with relevance scores (sorted high to low)
- A short summary sentence
"""

import os
from openai import OpenAI

MODEL = "gpt-4o-mini"
MAX_SAMPLE_TITLES = 15


def _sample_titles(patents, indices, max_titles=MAX_SAMPLE_TITLES):
    titles = []
    for i in indices[:max_titles]:
        title = patents[i].get("title", "").strip()
        if title and title != "nan":
            titles.append(title)
    return titles


def _label_one_cluster(client, titles, cluster_id):
    titles_str = "\n".join(f"- {t}" for t in titles)

    try:
        response = client.chat.completions.create(
            model=MODEL,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are a patent analyst. Given a sample of patent titles from a technology cluster, "
                        "produce:\n"
                        "1. A list of 8-12 important technology keywords or short phrases that describe this cluster. "
                        "For each, assign a relevance score from 0.0 to 1.0. Sort by score descending.\n"
                        "2. A one-sentence summary of what this cluster is about.\n\n"
                        "Format your response exactly as:\n"
                        "KEYWORDS:\n"
                        "keyword or phrase: score\n"
                        "keyword or phrase: score\n"
                        "...\n"
                        "SUMMARY:\n"
                        "One sentence summary here.\n\n"
                        "Return only the formatted output, nothing else."
                    ),
                },
                {
                    "role": "user",
                    "content": f"Patent titles from cluster ({len(titles)} patents sampled):\n{titles_str}",
                },
            ],
            max_tokens=300,
            temperature=0.3,
        )

        raw = response.choices[0].message.content.strip()
        return _parse_response(raw, cluster_id)

    except Exception as e:
        print(f"  Cluster {cluster_id}: LLM failed ({e})")
        fallback_label = ", ".join(titles[:5]) if titles else "unlabeled"
        return {
            "keywords": [{"term": fallback_label, "score": 1.0}],
            "summary": "",
            "label": fallback_label,
        }


def _parse_response(raw, cluster_id):
    keywords = []
    summary = ""

    section = None
    for line in raw.split("\n"):
        line = line.strip()
        if line.upper().startswith("KEYWORDS"):
            section = "keywords"
            continue
        elif line.upper().startswith("SUMMARY"):
            section = "summary"
            continue

        if section == "keywords" and ":" in line:
            line = line.lstrip("-").strip()
            parts = line.rsplit(":", 1)
            term = parts[0].strip()
            try:
                score = round(float(parts[1].strip()), 2)
            except (ValueError, IndexError):
                score = 0.5
            if term:
                keywords.append({"term": term, "score": score})

        elif section == "summary" and line:
            summary = line

    keywords.sort(key=lambda x: x["score"], reverse=True)
    label = ", ".join(k["term"] for k in keywords) if keywords else "unlabeled"

    return {"keywords": keywords, "summary": summary, "label": label}


def generate_topic_labels_llm(patents, topic_labels):
    topic_patents = {}
    for i, topic_id in enumerate(topic_labels):
        if topic_id == -1:
            continue
        if topic_id not in topic_patents:
            topic_patents[topic_id] = []
        topic_patents[topic_id].append(i)

    if not topic_patents:
        return {}

    client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
    results = {}

    for topic_id, indices in topic_patents.items():
        titles = _sample_titles(patents, indices)
        if not titles:
            results[topic_id] = {"keywords": [], "summary": "", "label": "unlabeled"}
            continue
        result = _label_one_cluster(client, titles, topic_id)
        results[topic_id] = result

    print(f"Generated LLM labels for {len(results)} topics")
    return results


def generate_area_labels_llm(patents, area_patent_indices):
    if not area_patent_indices:
        return {}

    client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
    results = {}

    for area_id, indices in area_patent_indices.items():
        titles = _sample_titles(patents, indices)
        if not titles:
            results[area_id] = {"keywords": [], "summary": "", "label": "unlabeled"}
            continue
        result = _label_one_cluster(client, titles, area_id)
        results[area_id] = result

    print(f"Generated LLM labels for {len(results)} areas")
    return results


def generate_macro_area_labels_llm(areas, cluster_labels):
    """
    Generate a key phrase + summary paragraph for each macro area.
    Uses cluster keywords as context (not raw patent titles).

    Args:
        areas: dict of area_id -> area data (with cluster_ids, keywords)
        cluster_labels: dict of cluster_id -> keyword string from c-TF-IDF
    Returns:
        dict of area_id -> {key_phrase, summary}
    """
    if not areas:
        return {}

    client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
    results = {}

    for area_id_str, area in areas.items():
        cluster_ids = area.get("cluster_ids", [])
        area_keywords = area.get("keywords", "")
        patent_count = area.get("patent_count", 0)
        cluster_count = area.get("cluster_count", 0)

        # Collect keywords from member clusters
        member_keywords = []
        for cid in cluster_ids[:30]:  # cap to avoid huge prompts
            label = cluster_labels.get(cid, cluster_labels.get(str(cid), ""))
            if label and label != "unlabeled":
                member_keywords.append(label)

        keywords_block = "\n".join(f"- Cluster: {kw}" for kw in member_keywords)

        try:
            response = client.chat.completions.create(
                model=MODEL,
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "You are a technology analyst. You are given keyword lists from clusters "
                            "that form a region on a patent/publication landscape map. "
                            "These clusters are spatially close, meaning they share related themes.\n\n"
                            "Produce:\n"
                            "1. KEY_PHRASE: A single short phrase (2-4 words) that captures the overarching theme. "
                            "Examples: 'Digital Infrastructure', 'Battery Technology', 'Climate Convergence'.\n"
                            "2. SUMMARY: A paragraph (3-5 sentences) describing what this region covers, "
                            "the main sub-topics, and any notable patterns.\n\n"
                            "Format your response exactly as:\n"
                            "KEY_PHRASE: <phrase>\n"
                            "SUMMARY: <paragraph>\n\n"
                            "Return only the formatted output."
                        ),
                    },
                    {
                        "role": "user",
                        "content": (
                            f"Area with {cluster_count} clusters and {patent_count} patents.\n"
                            f"Area-level keywords: {area_keywords}\n\n"
                            f"Cluster keywords:\n{keywords_block}"
                        ),
                    },
                ],
                max_tokens=400,
                temperature=0.3,
            )

            raw = response.choices[0].message.content.strip()
            key_phrase, summary = _parse_macro_area_response(raw)
            results[area_id_str] = {
                "key_phrase": key_phrase,
                "summary": summary,
            }
            print(f"  Area {area_id_str}: '{key_phrase}'")

        except Exception as e:
            print(f"  Area {area_id_str}: LLM failed ({e})")
            results[area_id_str] = {
                "key_phrase": "Unlabeled Area",
                "summary": "",
            }

    print(f"Generated LLM labels for {len(results)} macro areas")
    return results


def _parse_macro_area_response(raw):
    key_phrase = "Unlabeled Area"
    summary = ""

    for line in raw.split("\n"):
        line = line.strip()
        if line.upper().startswith("KEY_PHRASE:"):
            key_phrase = line.split(":", 1)[1].strip()
        elif line.upper().startswith("SUMMARY:"):
            summary = line.split(":", 1)[1].strip()

    # If summary spans multiple lines after SUMMARY:
    if not summary:
        in_summary = False
        parts = []
        for line in raw.split("\n"):
            line = line.strip()
            if line.upper().startswith("SUMMARY:"):
                rest = line.split(":", 1)[1].strip()
                if rest:
                    parts.append(rest)
                in_summary = True
            elif in_summary and line:
                parts.append(line)
        summary = " ".join(parts)

    return key_phrase, summary
