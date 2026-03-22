"""
Upload & Pipeline API

Endpoints:
    POST /api/demo/upload       - Upload CSV, generate embeddings, run pipeline (SSE progress)
    GET  /api/demo/result/:id   - Fetch pipeline result by hash
"""

import os
import json
import hashlib
import ast
import io
from pathlib import Path

import boto3
import numpy as np
import pandas as pd
from fastapi import APIRouter, UploadFile, File, Form
from fastapi.responses import StreamingResponse
from openai import OpenAI

# ============ CONFIGURATION ============

EMBEDDING_MODEL = "text-embedding-3-small"
EMBEDDING_BATCH_SIZE = 100

DEFAULT_GRID_SIZE = 1.2
DEFAULT_MIN_CLUSTER_SIZE = 20
DEFAULT_MIN_SAMPLES = 5
DEFAULT_TOP_PLAYERS = 20

BACKEND_DIR = Path(__file__).parent
CACHE_DIR = BACKEND_DIR / "cache"

# S3
s3_client = boto3.client('s3')
BUCKET_NAME = "radar2.0"
S3_PREFIX = "demo"

# ============ ROUTER ============

router = APIRouter()


# ============ HELPERS ============

def compute_file_hash(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()


def compute_result_id(file_hash: str, grid_size: float, min_cluster_size: int, min_samples: int, top_players: int) -> str:
    param_str = f"{file_hash}|gs={grid_size}|mcs={min_cluster_size}|ms={min_samples}|tp={top_players}"
    return hashlib.sha256(param_str.encode()).hexdigest()


def get_local_cache_path(prefix: str, file_hash: str, ext: str) -> Path:
    CACHE_DIR.mkdir(exist_ok=True)
    return CACHE_DIR / f"{prefix}_{file_hash}.{ext}"


def s3_key(prefix: str, file_hash: str, ext: str) -> str:
    return f"{S3_PREFIX}/{prefix}/{file_hash}.{ext}"


def s3_exists(key: str) -> bool:
    try:
        s3_client.head_object(Bucket=BUCKET_NAME, Key=key)
        return True
    except Exception:
        return False


def s3_upload_bytes(key: str, data: bytes, content_type: str = "application/octet-stream"):
    s3_client.put_object(Bucket=BUCKET_NAME, Key=key, Body=data, ContentType=content_type)


def s3_download_string(key: str) -> str:
    response = s3_client.get_object(Bucket=BUCKET_NAME, Key=key)
    return response['Body'].read().decode('utf-8')


def parse_uploaded_csv(content: bytes, filename: str) -> pd.DataFrame:
    if filename.lower().endswith(('.xlsx', '.xls')):
        df = pd.read_excel(io.BytesIO(content))
    else:
        df = pd.read_csv(io.BytesIO(content))
    return df


def convert_for_json(obj):
    if isinstance(obj, np.ndarray):
        return obj.tolist()
    if isinstance(obj, np.integer):
        return int(obj)
    if isinstance(obj, np.floating):
        return float(obj)
    if isinstance(obj, dict):
        return {k: convert_for_json(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [convert_for_json(v) for v in obj]
    return obj


def run_pipeline_with_params(df, embeddings, file_hash, result_id,
                              grid_size, min_cluster_size, min_samples, top_players):
    from pipeline import run_pipeline

    temp_input = get_local_cache_path("temp", file_hash, "csv")
    df_for_pipeline = df.copy()
    df_for_pipeline['search_embedding'] = [json.dumps(e) for e in embeddings]
    df_for_pipeline.to_csv(temp_input, index=False)

    result_local = get_local_cache_path("result", result_id, "json")
    result = run_pipeline(
        input_path=str(temp_input),
        output_path=str(result_local),
        dim_method="umap",
        cluster_method="hdbscan",
        grid_size=grid_size,
        min_cluster_size=min_cluster_size,
        min_samples=min_samples,
        top_players=top_players,
    )

    temp_input.unlink(missing_ok=True)
    return result, result_local


# ============ SSE UPLOAD ENDPOINT ============

@router.post("/api/demo/upload")
async def upload_and_process(
    file: UploadFile = File(...),
    grid_size: float = Form(DEFAULT_GRID_SIZE),
    min_cluster_size: int = Form(DEFAULT_MIN_CLUSTER_SIZE),
    min_samples: int = Form(DEFAULT_MIN_SAMPLES),
    top_players: int = Form(DEFAULT_TOP_PLAYERS),
):
    content = await file.read()
    filename = file.filename or "upload.csv"

    async def event_stream():
        try:
            # Step 1: Parse file
            yield f"data: {json.dumps({'step': 'parsing', 'message': 'Parsing file...'})}\n\n"
            df = parse_uploaded_csv(content, filename)
            yield f"data: {json.dumps({'step': 'parsing', 'message': f'Parsed {len(df)} patents', 'total': len(df)})}\n\n"

            # Normalize column names
            col_map = {}
            for col in df.columns:
                lower = col.lower().strip()
                if lower == 'title':
                    col_map['title'] = col
                elif lower == 'abstract':
                    col_map['abstract'] = col

            title_col = col_map.get('title')
            abstract_col = col_map.get('abstract')

            if not title_col and not abstract_col:
                yield f"data: {json.dumps({'error': 'CSV must have at least a title or abstract column'})}\n\n"
                return

            file_hash = compute_file_hash(content)
            result_id = compute_result_id(file_hash, grid_size, min_cluster_size, min_samples, top_players)

            # Step 2: Check full result cache (parameter-aware)
            result_local = get_local_cache_path("result", result_id, "json")
            result_s3_key = s3_key("results", result_id, "json")

            if result_local.exists():
                yield f"data: {json.dumps({'step': 'cache_hit', 'message': 'Using cached results'})}\n\n"
                yield f"data: {json.dumps({'step': 'done', 'message': 'Analysis complete', 'resultId': result_id})}\n\n"
                return

            if s3_exists(result_s3_key):
                yield f"data: {json.dumps({'step': 'cache_hit', 'message': 'Using cached results from cloud'})}\n\n"
                result_str = s3_download_string(result_s3_key)
                with open(result_local, 'w') as f:
                    f.write(result_str)
                yield f"data: {json.dumps({'step': 'done', 'message': 'Analysis complete', 'resultId': result_id})}\n\n"
                return

            # Step 3: Check embeddings cache (keyed by file hash only)
            embeddings_local = get_local_cache_path("embeddings", file_hash, "csv")
            embeddings_s3_key = s3_key("embeddings", file_hash, "csv")

            if embeddings_local.exists():
                yield f"data: {json.dumps({'step': 'cache_hit', 'message': 'Using cached embeddings'})}\n\n"
                cached_df = pd.read_csv(embeddings_local)
                embeddings = [
                    ast.literal_eval(e) if isinstance(e, str) else e
                    for e in cached_df['search_embedding']
                ]
            elif s3_exists(embeddings_s3_key):
                yield f"data: {json.dumps({'step': 'cache_hit', 'message': 'Using cached embeddings from cloud'})}\n\n"
                csv_str = s3_download_string(embeddings_s3_key)
                cached_df = pd.read_csv(io.StringIO(csv_str))
                embeddings = [
                    ast.literal_eval(e) if isinstance(e, str) else e
                    for e in cached_df['search_embedding']
                ]
                cached_df.to_csv(embeddings_local, index=False)
            else:
                # Step 4: Generate embeddings
                yield f"data: {json.dumps({'step': 'embeddings', 'message': 'Generating embeddings...', 'progress': 0})}\n\n"

                texts = []
                for _, row in df.iterrows():
                    parts = []
                    if title_col and pd.notna(row.get(title_col)):
                        parts.append(str(row[title_col]))
                    if abstract_col and pd.notna(row.get(abstract_col)):
                        parts.append(str(row[abstract_col]))
                    text = " ".join(parts)[:8000]
                    texts.append(text if text.strip() else "empty")

                client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
                embeddings = []
                total = len(texts)

                for i in range(0, total, EMBEDDING_BATCH_SIZE):
                    batch = texts[i:i + EMBEDDING_BATCH_SIZE]
                    response = client.embeddings.create(
                        model=EMBEDDING_MODEL,
                        input=batch,
                    )
                    batch_embeddings = [item.embedding for item in response.data]
                    embeddings.extend(batch_embeddings)

                    progress = min(100, int((i + len(batch)) / total * 100))
                    yield f"data: {json.dumps({'step': 'embeddings', 'message': f'Generating embeddings... {i + len(batch)}/{total}', 'progress': progress})}\n\n"

                # Cache embeddings locally
                df_with_embeddings = df.copy()
                df_with_embeddings['search_embedding'] = [json.dumps(e) for e in embeddings]
                df_with_embeddings.to_csv(embeddings_local, index=False)

                # Upload embeddings to S3
                yield f"data: {json.dumps({'step': 'saving', 'message': 'Saving embeddings to cloud...'})}\n\n"
                embeddings_csv_bytes = df_with_embeddings.to_csv(index=False).encode('utf-8')
                s3_upload_bytes(embeddings_s3_key, embeddings_csv_bytes, "text/csv")

            # Save raw CSV to S3
            raw_s3_key = s3_key("uploads", file_hash, "csv")
            if not s3_exists(raw_s3_key):
                s3_upload_bytes(raw_s3_key, content, "text/csv")

            # Step 5: Run pipeline
            yield f"data: {json.dumps({'step': 'pipeline', 'message': 'Running clustering pipeline...'})}\n\n"

            result, result_local = run_pipeline_with_params(
                df, embeddings, file_hash, result_id,
                grid_size, min_cluster_size, min_samples, top_players,
            )

            yield f"data: {json.dumps({'step': 'pipeline', 'message': 'Pipeline complete'})}\n\n"

            # Save result to S3
            yield f"data: {json.dumps({'step': 'saving', 'message': 'Saving results to cloud...'})}\n\n"
            result_json = convert_for_json(result)
            s3_upload_bytes(result_s3_key, json.dumps(result_json).encode('utf-8'), "application/json")

            # Step 6: Done
            yield f"data: {json.dumps({'step': 'done', 'message': 'Analysis complete', 'resultId': result_id})}\n\n"

        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        },
    )


@router.get("/api/demo/result/{result_id}")
async def get_result(result_id: str):
    local_path = get_local_cache_path("result", result_id, "json")

    if local_path.exists():
        with open(local_path, 'r') as f:
            return json.load(f)

    result_s3 = s3_key("results", result_id, "json")
    if s3_exists(result_s3):
        result_str = s3_download_string(result_s3)
        with open(local_path, 'w') as f:
            f.write(result_str)
        return json.loads(result_str)

    from fastapi import HTTPException
    raise HTTPException(status_code=404, detail="Result not found")
