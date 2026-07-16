import asyncio

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.orchestrator import run_pipeline
from app.db.database import get_db
from app.db.models import PipelineConfig

router = APIRouter(tags=["compare"])


class CompareRequest(BaseModel):
    pipeline_ids: list[str]
    query: str


@router.post("/compare")
async def compare_pipelines(req: CompareRequest, db: Session = Depends(get_db)):
    """Runs the same query on two pipelines and annotates which chunks are
    unique to each result."""
    if len(req.pipeline_ids) != 2:
        raise HTTPException(400, "Exactly two pipeline_ids are required")
    pipelines = []
    for pid in req.pipeline_ids:
        p = db.get(PipelineConfig, pid)
        if not p:
            raise HTTPException(404, f"Pipeline {pid} not found")
        if p.status != "ready":
            raise HTTPException(409, f"Pipeline {p.name!r} is not ready (status: {p.status})")
        pipelines.append(p)

    results = await asyncio.gather(
        *(run_pipeline(p.id, p.config, req.query) for p in pipelines)
    )
    payloads = [r.to_dict() for r in results]

    def chunk_key(c: dict) -> tuple:
        return (c["metadata"].get("document_id"), c["metadata"].get("start_char"), c["metadata"].get("end_char"))

    keys_a = {chunk_key(c) for c in payloads[0]["chunks"]}
    keys_b = {chunk_key(c) for c in payloads[1]["chunks"]}
    for payload, other_keys in ((payloads[0], keys_b), (payloads[1], keys_a)):
        for c in payload["chunks"]:
            c["unique"] = chunk_key(c) not in other_keys

    return {
        "query": req.query,
        "results": [
            {"pipeline_id": p.id, "pipeline_name": p.name, "result": payload}
            for p, payload in zip(pipelines, payloads)
        ],
    }
