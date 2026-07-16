import asyncio

import numpy as np
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.embedders.base import get_embedder
from app.core.vectorstores.base import get_vectorstore
from app.db.database import get_db
from app.db.models import PipelineConfig

router = APIRouter(tags=["embeddings"])


def _project(vectors: np.ndarray, method: str) -> tuple[np.ndarray, object]:
    """Returns 2D coords and a fitted reducer that can transform new points."""
    if method == "pca":
        from sklearn.decomposition import PCA

        reducer = PCA(n_components=2)
    else:
        import umap

        reducer = umap.UMAP(n_components=2, n_neighbors=min(15, max(2, len(vectors) - 1)), random_state=42)
    coords = reducer.fit_transform(vectors)
    return np.asarray(coords), reducer


@router.get("/pipelines/{pipeline_id}/embeddings")
async def pipeline_embeddings(
    pipeline_id: str,
    method: str = Query("umap", pattern="^(umap|pca)$"),
    query: str | None = None,
    db: Session = Depends(get_db),
):
    """2D projection of every indexed chunk; optionally projects a query
    string into the same space (returned as `query_point`)."""
    pipeline = db.get(PipelineConfig, pipeline_id)
    if not pipeline:
        raise HTTPException(404, "Pipeline not found")
    if pipeline.status != "ready":
        raise HTTPException(409, f"Pipeline is not ready (status: {pipeline.status})")

    store = get_vectorstore(pipeline.config["vectorstore"], pipeline_id)
    chunks = store.get_all(include_vectors=True)
    chunks = [c for c in chunks if c.vector is not None]
    if len(chunks) < 3:
        raise HTTPException(422, "Need at least 3 indexed chunks to project")

    vectors = np.asarray([c.vector for c in chunks], dtype=np.float32)

    def compute():
        coords, reducer = _project(vectors, method)
        query_point = None
        if query:
            emb_cfg = pipeline.config["embedder"]
            qvec = get_embedder(emb_cfg["provider"], emb_cfg["model"]).embed_one(query)
            qcoords = reducer.transform(np.asarray([qvec], dtype=np.float32))
            query_point = {"x": float(qcoords[0][0]), "y": float(qcoords[0][1]), "label": query}
        return coords, query_point

    coords, query_point = await asyncio.to_thread(compute)

    points = [
        {
            "id": c.id,
            "x": float(coords[i][0]),
            "y": float(coords[i][1]),
            "document_id": c.metadata.get("document_id"),
            "document_name": c.metadata.get("document_name", "unknown"),
            "preview": c.text[:100],
            "token_count": c.metadata.get("token_count"),
        }
        for i, c in enumerate(chunks)
    ]
    return {"method": method, "points": points, "query_point": query_point}
