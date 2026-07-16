from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.orchestrator import run_pipeline
from app.db.database import SessionLocal, get_db
from app.db.models import Experiment, PipelineConfig

router = APIRouter(tags=["query"])


class QueryRequest(BaseModel):
    query: str


def _require_ready(pipeline: PipelineConfig | None) -> PipelineConfig:
    if not pipeline:
        raise HTTPException(404, "Pipeline not found")
    if pipeline.status != "ready":
        raise HTTPException(409, f"Pipeline is not ready (status: {pipeline.status})")
    return pipeline


def _save_experiment(pipeline_id: str, query: str, result: dict) -> None:
    db = SessionLocal()
    try:
        db.add(
            Experiment(pipeline_id=pipeline_id, query=query, result=result, latency_ms=result.get("total_ms", 0.0))
        )
        db.commit()
    finally:
        db.close()


@router.post("/pipelines/{pipeline_id}/query")
async def query_pipeline(pipeline_id: str, req: QueryRequest, db: Session = Depends(get_db)):
    pipeline = _require_ready(db.get(PipelineConfig, pipeline_id))
    result = await run_pipeline(pipeline_id, pipeline.config, req.query)
    payload = result.to_dict()
    _save_experiment(pipeline_id, req.query, payload)
    return payload


@router.websocket("/ws/query/{pipeline_id}")
async def query_pipeline_ws(websocket: WebSocket, pipeline_id: str):
    """Client sends {"query": "..."}; server streams {"type": "step", ...}
    events followed by {"type": "result", ...}. Connection stays open for
    subsequent queries."""
    await websocket.accept()
    try:
        while True:
            msg = await websocket.receive_json()
            query = (msg.get("query") or "").strip()
            if not query:
                await websocket.send_json({"type": "error", "message": "Empty query"})
                continue
            db = SessionLocal()
            try:
                pipeline = db.get(PipelineConfig, pipeline_id)
            finally:
                db.close()
            if not pipeline or pipeline.status != "ready":
                status = pipeline.status if pipeline else "missing"
                await websocket.send_json({"type": "error", "message": f"Pipeline not ready (status: {status})"})
                continue
            try:
                result = await run_pipeline(pipeline_id, pipeline.config, query, emit=websocket.send_json)
                _save_experiment(pipeline_id, query, result.to_dict())
            except Exception as exc:
                await websocket.send_json({"type": "error", "message": str(exc)})
    except WebSocketDisconnect:
        pass
