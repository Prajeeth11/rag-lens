import shutil
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.db.database import UPLOAD_DIR, get_db
from app.db.models import Document
from app.utils.file_parsers import parse_file

router = APIRouter(prefix="/documents", tags=["documents"])

ALLOWED = {".pdf", ".docx", ".txt", ".md", ".markdown"}


def _doc_dict(d: Document) -> dict:
    return {
        "id": d.id,
        "name": d.name,
        "file_type": d.file_type,
        "size_bytes": d.size_bytes,
        "num_pages": d.num_pages,
        "char_count": d.char_count,
        "created_at": d.created_at.isoformat(),
    }


@router.post("/upload")
async def upload_document(file: UploadFile, db: Session = Depends(get_db)):
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in ALLOWED:
        raise HTTPException(400, f"Unsupported file type {suffix!r}; allowed: {sorted(ALLOWED)}")

    doc = Document(name=file.filename, path="", file_type=suffix.lstrip("."), size_bytes=0)
    dest = UPLOAD_DIR / f"{doc.id}{suffix}"
    with dest.open("wb") as out:
        shutil.copyfileobj(file.file, out)
    doc.path = str(dest)
    doc.size_bytes = dest.stat().st_size

    try:
        parsed = parse_file(dest)
    except Exception as exc:
        dest.unlink(missing_ok=True)
        raise HTTPException(422, f"Could not parse file: {exc}")
    doc.num_pages = len(parsed.pages)
    doc.char_count = len(parsed.text)

    db.add(doc)
    db.commit()
    return _doc_dict(doc)


@router.get("")
def list_documents(db: Session = Depends(get_db)):
    docs = db.query(Document).order_by(Document.created_at.desc()).all()
    return [_doc_dict(d) for d in docs]


@router.get("/{doc_id}")
def get_document(doc_id: str, db: Session = Depends(get_db)):
    doc = db.get(Document, doc_id)
    if not doc:
        raise HTTPException(404, "Document not found")
    return _doc_dict(doc)


@router.delete("/{doc_id}")
def delete_document(doc_id: str, db: Session = Depends(get_db)):
    doc = db.get(Document, doc_id)
    if not doc:
        raise HTTPException(404, "Document not found")
    Path(doc.path).unlink(missing_ok=True)
    db.delete(doc)
    db.commit()
    return {"deleted": doc_id}
