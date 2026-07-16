import numpy as np
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.chunkers.base import get_chunker
from app.db.database import get_db
from app.db.models import Document
from app.utils.file_parsers import parse_file

router = APIRouter(prefix="/documents", tags=["chunking"])


class ChunkRequest(BaseModel):
    strategy: str = "fixed_size"
    params: dict = Field(default_factory=dict)


@router.post("/{doc_id}/chunk")
def preview_chunks(doc_id: str, req: ChunkRequest, db: Session = Depends(get_db)):
    """Chunks a document with the given strategy without indexing anything."""
    doc = db.get(Document, doc_id)
    if not doc:
        raise HTTPException(404, "Document not found")
    parsed = parse_file(doc.path)
    try:
        chunker = get_chunker(req.strategy)
        chunks = chunker.chunk(parsed.text, req.params)
    except ValueError as exc:
        raise HTTPException(400, str(exc))

    tokens = [c.token_count for c in chunks]
    hist, edges = np.histogram(tokens, bins=10) if tokens else (np.array([]), np.array([0, 0]))
    return {
        "document_id": doc_id,
        "strategy": req.strategy,
        "params": req.params,
        "chunks": [c.to_dict() for c in chunks],
        "stats": {
            "count": len(chunks),
            "avg_tokens": round(float(np.mean(tokens)), 1) if tokens else 0,
            "min_tokens": int(min(tokens)) if tokens else 0,
            "max_tokens": int(max(tokens)) if tokens else 0,
            "total_chars": len(parsed.text),
            "histogram": [
                {"range": f"{int(edges[i])}-{int(edges[i + 1])}", "count": int(hist[i])} for i in range(len(hist))
            ],
        },
    }
