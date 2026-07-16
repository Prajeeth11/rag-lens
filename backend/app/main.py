from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import chunking, compare, documents, embeddings, eval as eval_api, pipeline, query
from app.db.database import init_db


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(title="RAG-Lens", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(documents.router)
app.include_router(chunking.router)
app.include_router(pipeline.router)
app.include_router(query.router)
app.include_router(compare.router)
app.include_router(embeddings.router)
app.include_router(eval_api.router)


@app.get("/health")
def health():
    return {"status": "ok"}
