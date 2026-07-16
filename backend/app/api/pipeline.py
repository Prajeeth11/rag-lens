import asyncio

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.orchestrator import build_index
from app.core.vectorstores.base import get_vectorstore
from app.db.database import SessionLocal, get_db
from app.db.models import Experiment, PipelineConfig

router = APIRouter(prefix="/pipelines", tags=["pipelines"])


class PipelineCreate(BaseModel):
    name: str
    document_ids: list[str]
    chunker: dict = Field(default_factory=lambda: {"strategy": "recursive", "params": {}})
    embedder: dict = Field(default_factory=lambda: {"provider": "sentence_transformers", "model": "all-MiniLM-L6-v2"})
    vectorstore: str = "chroma"
    retriever: dict = Field(default_factory=lambda: {"type": "similarity", "k": 5})
    reranker: dict = Field(default_factory=lambda: {"enabled": False})
    llm: dict = Field(default_factory=lambda: {"enabled": False})


def _pipeline_dict(p: PipelineConfig) -> dict:
    return {
        "id": p.id,
        "name": p.name,
        "config": p.config,
        "status": p.status,
        "status_detail": p.status_detail,
        "chunk_count": p.chunk_count,
        "created_at": p.created_at.isoformat(),
    }


async def _index_task(pipeline_id: str, config: dict) -> None:
    db = SessionLocal()
    try:
        pipeline = db.get(PipelineConfig, pipeline_id)
        pipeline.status = "building"
        db.commit()
        try:
            count = await asyncio.to_thread(build_index, pipeline_id, config)
            pipeline.status = "ready"
            pipeline.chunk_count = count
            pipeline.status_detail = f"Indexed {count} chunks"
        except Exception as exc:
            pipeline.status = "failed"
            pipeline.status_detail = str(exc)
        db.commit()
    finally:
        db.close()


@router.post("")
async def create_pipeline(req: PipelineCreate, db: Session = Depends(get_db)):
    config = req.model_dump()
    name = config.pop("name")
    if not config["document_ids"]:
        raise HTTPException(400, "document_ids must not be empty")
    pipeline = PipelineConfig(name=name, config=config, status="pending")
    db.add(pipeline)
    db.commit()
    asyncio.get_running_loop().create_task(_index_task(pipeline.id, config))
    return _pipeline_dict(pipeline)


@router.get("")
def list_pipelines(db: Session = Depends(get_db)):
    pipelines = db.query(PipelineConfig).order_by(PipelineConfig.created_at.desc()).all()
    return [_pipeline_dict(p) for p in pipelines]


@router.get("/{pipeline_id}")
def get_pipeline(pipeline_id: str, db: Session = Depends(get_db)):
    p = db.get(PipelineConfig, pipeline_id)
    if not p:
        raise HTTPException(404, "Pipeline not found")
    return _pipeline_dict(p)


@router.delete("/{pipeline_id}")
def delete_pipeline(pipeline_id: str, db: Session = Depends(get_db)):
    p = db.get(PipelineConfig, pipeline_id)
    if not p:
        raise HTTPException(404, "Pipeline not found")
    try:
        get_vectorstore(p.config.get("vectorstore", "chroma"), pipeline_id).delete()
    except Exception:
        pass  # index may never have been built
    db.query(Experiment).filter(Experiment.pipeline_id == pipeline_id).delete()
    db.delete(p)
    db.commit()
    return {"deleted": pipeline_id}


@router.get("/{pipeline_id}/experiments")
def list_experiments(pipeline_id: str, db: Session = Depends(get_db)):
    rows = (
        db.query(Experiment)
        .filter(Experiment.pipeline_id == pipeline_id)
        .order_by(Experiment.created_at.desc())
        .limit(50)
        .all()
    )
    return [
        {
            "id": e.id,
            "pipeline_id": e.pipeline_id,
            "query": e.query,
            "result": e.result,
            "latency_ms": e.latency_ms,
            "created_at": e.created_at.isoformat(),
        }
        for e in rows
    ]
