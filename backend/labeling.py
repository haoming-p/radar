"""
Uses c-TF-IDF to find words that DISTINGUISH
each area from other areas, not just common words within each area.

Improvements:
- Stemming to merge fuel/fuels, production/producing
- Up to 5-word phrases (e.g., "electric vehicle battery charging")
- Phrase boosting to prefer multi-word phrases
"""

import numpy as np
import re
from sklearn.feature_extraction.text import TfidfVectorizer, CountVectorizer, ENGLISH_STOP_WORDS

try:
    from nltk.stem import PorterStemmer
    _stemmer = PorterStemmer()
    HAS_NLTK = True
    def stem_word(word):
        return _stemmer.stem(word)
except ImportError:
    HAS_NLTK = False
    def stem_word(word):
        if word.endswith('ies'):
            return word[:-3] + 'y'
        if word.endswith('ing') and len(word) > 5:
            return word[:-3]
        if word.endswith('tion'):
            return word[:-4]
        if word.endswith('ed') and len(word) > 4:
            return word[:-2]
        if word.endswith('s') and not word.endswith('ss') and len(word) > 3:
            return word[:-1]
        return word


PATENT_STOPWORDS = {
    "claim", "claims", "claimed", "comprising", "comprises", "comprise",
    "method", "methods", "system", "systems", "device", "devices",
    "apparatus", "present", "invention", "embodiment", "embodiments",
    "according", "wherein", "thereof", "thereto", "hereby",
    "provided", "providing", "provides", "configured", "adapted",
    "includes", "including", "included", "having", "has", "have", "said",
    "one", "two", "first", "second", "third", "plurality", "least",
    "based", "using", "used", "use", "may", "can",
    "example", "examples", "various", "particular", "specific",
    "related", "relating", "relates", "associated", "corresponding",
    "determined", "determining", "determine",
    "obtained", "obtaining", "formed", "forming", "form",
    "connected", "coupled", "attached", "disposed", "positioned",
    "located", "arranged", "mounted",
    "portion", "portions", "part", "parts", "section", "sections",
    "end", "ends", "side", "sides", "surface", "surfaces",
    "member", "members", "element", "elements",
    "component", "components", "unit", "units", "module", "modules",
    "assembly", "assemblies", "structure", "structures",
    "body", "bodies", "housing", "frame",
    "data", "information", "signal", "signals", "value", "values",
    "process", "processes", "step", "steps", "operation", "operations",
    "control", "controller", "controlled", "controlling",
    "output", "input", "receive", "received", "receiving",
    "generate", "generated", "generating", "produce", "produced",
    "connect", "connection", "connections", "communicate", "communication",
    "amount", "number", "level", "rate", "ratio", "range", "degree",
}


def generate_topic_labels(patents, topic_labels, n_keywords=12):
    topic_patents = {}
    for i, topic_id in enumerate(topic_labels):
        if topic_id == -1:
            continue
        if topic_id not in topic_patents:
            topic_patents[topic_id] = []
        topic_patents[topic_id].append(i)

    if not topic_patents:
        return {}

    labels = generate_ctfidf_labels(patents, topic_patents, n_keywords)

    print(f"Generated labels for {len(labels)} topics")
    return labels


def generate_area_labels(patents, area_patent_indices, n_keywords=12):
    if not area_patent_indices:
        return {}

    valid_areas = {
        area_id: indices
        for area_id, indices in area_patent_indices.items()
        if len(indices) >= 2
    }

    labels = {}
    for area_id, indices in area_patent_indices.items():
        if len(indices) < 2:
            if indices:
                title = patents[indices[0]].get("title", "")
                words = _extract_title_keywords(title, n_keywords)
                labels[area_id] = ", ".join(words) if words else "unlabeled"
            else:
                labels[area_id] = "unlabeled"

    if not valid_areas:
        return labels

    ctfidf_labels = generate_ctfidf_labels(patents, valid_areas, n_keywords)
    labels.update(ctfidf_labels)

    print(f"Generated labels for {len(labels)} areas using c-TF-IDF")
    return labels


def generate_ctfidf_labels(patents, group_indices, n_keywords=12, phrase_boost=2.0, max_ngram=5):
    group_ids = list(group_indices.keys())
    mega_documents = []

    for group_id in group_ids:
        indices = group_indices[group_id]
        texts = []
        for i in indices:
            title = patents[i].get("title", "")
            abstract = patents[i].get("abstract", "")
            texts.append(f"{title} {abstract}")

        mega_doc = " ".join(texts)
        mega_documents.append(_clean_text(mega_doc))

    all_stopwords = list(ENGLISH_STOP_WORDS) + list(PATENT_STOPWORDS)

    try:
        count_vectorizer = CountVectorizer(
            stop_words=all_stopwords,
            ngram_range=(1, max_ngram),
            min_df=1,
            max_df=0.95,
            token_pattern=r"(?u)\b[a-zA-Z][a-zA-Z0-9]{1,}\b",
            max_features=1000,
        )

        count_matrix = count_vectorizer.fit_transform(mega_documents)
        feature_names = count_vectorizer.get_feature_names_out()

        counts = count_matrix.toarray()

        # TF
        doc_lengths = counts.sum(axis=1, keepdims=True)
        doc_lengths[doc_lengths == 0] = 1
        tf = counts / doc_lengths

        # IDF
        n_groups = len(group_ids)
        doc_freq = (counts > 0).sum(axis=0)
        idf = np.log(1 + (n_groups / (doc_freq + 1)))

        ctfidf = tf * idf

        # Boost multi-word phrases
        if phrase_boost > 1.0:
            for j, feature in enumerate(feature_names):
                n_words = len(feature.split())
                if n_words >= 2:
                    ctfidf[:, j] *= phrase_boost ** (n_words - 1)

        # Extract top keywords for each group
        labels = {}
        for i, group_id in enumerate(group_ids):
            scores = ctfidf[i]
            keywords = _extract_top_keywords_with_stemming(
                scores, feature_names, n_keywords
            )
            labels[group_id] = ", ".join(keywords) if keywords else "unlabeled"

        return labels

    except Exception as e:
        print(f"c-TF-IDF error: {e}")
        return _fallback_tfidf_labels(patents, group_indices, n_keywords)


def _extract_top_keywords_with_stemming(scores, feature_names, n_keywords):
    top_indices = scores.argsort()[::-1]

    keywords = []
    used_stems = set()
    used_words = set()

    for idx in top_indices:
        if scores[idx] <= 0:
            continue

        keyword = feature_names[idx]
        words = keyword.split()

        stems = {stem_word(w) for w in words}

        stem_overlap = stems & used_stems
        if len(stem_overlap) >= len(stems) * 0.7:
            continue

        if set(words).issubset(used_words):
            continue

        if len(words) == 1 and words[0] in used_words:
            continue

        keywords.append(keyword)
        used_stems.update(stems)
        used_words.update(words)

        if len(keywords) >= n_keywords:
            break

    return keywords


def _fallback_tfidf_labels(patents, group_indices, n_keywords):
    labels = {}
    for group_id, indices in group_indices.items():
        texts = [
            f"{patents[i].get('title', '')} {patents[i].get('abstract', '')}"
            for i in indices
        ]
        labels[group_id] = generate_tfidf_label(texts, n_keywords)
    return labels


def _extract_title_keywords(title, n_keywords=5):
    if not title:
        return []

    title = title.lower()
    words = re.findall(r'\b[a-z]{3,}\b', title)

    all_stopwords = set(ENGLISH_STOP_WORDS) | PATENT_STOPWORDS
    keywords = [w for w in words if w not in all_stopwords]

    seen = set()
    unique = []
    for w in keywords:
        if w not in seen:
            seen.add(w)
            unique.append(w)

    return unique[:n_keywords]


def generate_tfidf_label(texts, n_keywords=12, include_trigrams=True):
    if not texts or all(not t.strip() for t in texts):
        return "unlabeled"

    try:
        cleaned_texts = [_clean_text(t) for t in texts]

        all_stopwords = list(ENGLISH_STOP_WORDS) + list(PATENT_STOPWORDS)

        min_df = 2 if len(texts) >= 5 else 1

        vectorizer = TfidfVectorizer(
            max_features=200,
            stop_words=all_stopwords,
            ngram_range=(1, 3) if include_trigrams else (1, 2),
            min_df=min_df,
            max_df=0.90,
            token_pattern=r"(?u)\b[a-zA-Z][a-zA-Z0-9]{1,}\b",
        )

        tfidf_matrix = vectorizer.fit_transform(cleaned_texts)
        feature_names = vectorizer.get_feature_names_out()

        avg_scores = np.asarray(tfidf_matrix.mean(axis=0)).flatten()

        top_indices = avg_scores.argsort()[-n_keywords * 2:][::-1]

        keywords = []
        used_words = set()

        for idx in top_indices:
            if avg_scores[idx] <= 0:
                continue

            keyword = feature_names[idx]
            words = set(keyword.split())

            if words.issubset(used_words):
                continue

            keywords.append(keyword)
            used_words.update(words)

            if len(keywords) >= n_keywords:
                break

        return ", ".join(keywords) if keywords else "unlabeled"

    except Exception as e:
        print(f"TF-IDF error: {e}")
        return "unlabeled"


def _clean_text(text):
    if not text:
        return ""

    text = text.lower()
    text = re.sub(r"[^a-z0-9\s\-]", " ", text)
    text = re.sub(r"\s+", " ", text).strip()

    return text
