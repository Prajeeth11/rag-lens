import asyncio
import os

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.orchestrator import run_pipeline
from app.db.database import get_db
from app.db.models import EvalRun, PipelineConfig

router = APIRouter(tags=["eval"])

METRIC_NAMES = ["faithfulness", "answer_relevancy", "context_precision", "context_recall"]


class QAPair(BaseModel):
    question: str
    expected_answer: str


class EvalRequest(BaseModel):
    pipeline_id: str
    qa_pairs: list[QAPair]


def _run_ragas(rows: list[dict]) -> list[dict]:
    """Scores each row ({question, answer, contexts, ground_truth}) with RAGAS.
    Blocking — run in a worker thread."""
    from datasets import Dataset
    from ragas import evaluate
    from ragas.metrics import answer_relevancy, context_precision, context_recall, faithfulness

    dataset = Dataset.from_dict(
        {
            "question": [r["question"] for r in rows],
            "answer": [r["answer"] for r in rows],
            "contexts": [r["contexts"] for r in rows],
            "ground_truth": [r["ground_truth"] for r in rows],
        }
    )
    result = evaluate(dataset, metrics=[faithfulness, answer_relevancy, context_precision, context_recall])
    df = result.to_pandas()
    scored = []
    for i, row in enumerate(rows):
        scores = {}
        for m in METRIC_NAMES:
            val = df.iloc[i].get(m)
            scores[m] = round(float(val), 4) if val == val else None  # NaN check
        scored.append({**row, "scores": scores})
    return scored


@router.post("/eval")
async def run_eval(req: EvalRequest, db: Session = Depends(get_db)):
    if not os.environ.get("OPENAI_API_KEY"):
        raise HTTPException(
            400, "RAGAS evaluation needs OPENAI_API_KEY set in the backend environment (it uses an LLM judge)."
        )
    if not req.qa_pairs:
        raise HTTPException(400, "qa_pairs must not be empty")
    pipeline = db.get(PipelineConfig, req.pipeline_id)
    if not pipeline:
        raise HTTPException(404, "Pipeline not found")
    if pipeline.status != "ready":
        raise HTTPException(409, f"Pipeline is not ready (status: {pipeline.status})")

    # Force answer generation for eval even if the pipeline has no LLM step:
    # faithfulness/answer_relevancy score a generated answer.
    config = {**pipeline.config, "llm": {**pipeline.config.get("llm", {}), "enabled": True}}

    rows = []
    for pair in req.qa_pairs:
        result = await run_pipeline(req.pipeline_id, config, pair.question)
        rows.append(
            {
                "question": pair.question,
                "answer": result.answer or "",
                "contexts": [c["text"] for c in result.chunks],
                "ground_truth": pair.expected_answer,
            }
        )

    try:
        scored = await asyncio.to_thread(_run_ragas, rows)
    except Exception as exc:
        raise HTTPException(500, f"RAGAS evaluation failed: {exc}")

    aggregates = {}
    for m in METRIC_NAMES:
        vals = [r["scores"][m] for r in scored if r["scores"].get(m) is not None]
        aggregates[m] = round(sum(vals) / len(vals), 4) if vals else None

    payload = {
        "pipeline_id": req.pipeline_id,
        "per_question": [
            {"question": r["question"], "answer": r["answer"], "ground_truth": r["ground_truth"], **r["scores"]}
            for r in scored
        ],
        "aggregates": aggregates,
    }
    db.add(EvalRun(pipeline_id=req.pipeline_id, scores=payload))
    db.commit()
    return payload


@router.get("/eval/runs")
def list_eval_runs(db: Session = Depends(get_db)):
    runs = db.query(EvalRun).order_by(EvalRun.created_at.desc()).limit(50).all()
    return [
        {"id": r.id, "pipeline_id": r.pipeline_id, "scores": r.scores, "created_at": r.created_at.isoformat()}
        for r in runs
    ]
