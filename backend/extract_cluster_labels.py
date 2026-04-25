"""
One-time extractor: pull per-cluster c-TF-IDF keywords from a Radar 1.0
analysis CSV and write a small JSON lookup file the pipeline can read.

Output shape:
    {
      "<cluster_id>": {
        "keywords":          ["word1", "word2", ...],   # top 15 single words
        "compound_keywords": ["phrase1", "phrase2", ...] # top 10 phrases
      },
      ...
    }

Usage:
    cd backend
    python extract_cluster_labels.py \\
        ../frontend/src/testData/analysis-272364.csv \\
        data/cluster_labels_272364.json
"""

import csv
import json
import sys
from pathlib import Path

# Match the per-cluster caps the original enrich_radar10.py used.
TOP_KEYWORDS = 15
TOP_COMPOUND = 10


def extract(analysis_csv_path: str, output_json_path: str) -> None:
    cluster_keywords: dict[str, list[str]] = {}
    cluster_compound: dict[str, list[str]] = {}

    # Allow large fields — the analysis CSV's keyword columns can exceed the
    # default csv module field-size limit on some platforms.
    csv.field_size_limit(sys.maxsize)

    with open(analysis_csv_path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            cl = (row.get("cl#") or "").strip()
            if not cl or cl in cluster_keywords:
                # Rows are per-patent and every row in a cluster repeats the
                # same cluster-level keywords — only capture the first row.
                continue

            kw = row.get("cluster characteristic words", "") or ""
            cluster_keywords[cl] = [w.strip() for w in kw.split("|") if w.strip()][:TOP_KEYWORDS]

            ckw = row.get("cluster characteristic compound words", "") or ""
            cluster_compound[cl] = [w.strip() for w in ckw.split("|") if w.strip()][:TOP_COMPOUND]

    output = {
        cl: {
            "keywords": cluster_keywords[cl],
            "compound_keywords": cluster_compound[cl],
        }
        for cl in sorted(cluster_keywords.keys(), key=lambda x: int(x) if x.isdigit() else 0)
    }

    output_path = Path(output_json_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(output, f, separators=(",", ":"), ensure_ascii=False)

    size_kb = output_path.stat().st_size / 1024
    print(f"Wrote {len(output)} clusters to {output_path} ({size_kb:.1f} KB)")


def main() -> None:
    if len(sys.argv) != 3:
        print(__doc__)
        sys.exit(1)
    extract(sys.argv[1], sys.argv[2])


if __name__ == "__main__":
    main()
