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
