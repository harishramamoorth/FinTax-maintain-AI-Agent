from __future__ import annotations

from fastapi import Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import protected_router
from app.core.errors import not_found
from app.db.session import get_db
from app.models import KnowledgeDocument
from app.repositories.knowledge import _snippet, search_documents, tokenize
from app.schemas.common import KnowledgeIn, KnowledgeListItem, KnowledgeOut, Page

router = protected_router(tags=["knowledge"])


@router.get("/knowledge", response_model=Page[KnowledgeListItem])
def list_documents(q: str | None = Query(None, max_length=200), tag: str | None = Query(None, max_length=40),
                   page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100), db: Session = Depends(get_db)):
    """Lists documents, or keyword-searches them when `q` is given (no semantic/vector search)."""
    if q and q.strip():
        hits = {h["id"]: h for h in search_documents(db, q, limit=500)}
        docs = [d for d in db.execute(select(KnowledgeDocument).where(KnowledgeDocument.id.in_(list(hits)))).scalars()] if hits else []
        if tag:
            docs = [d for d in docs if tag.lower() in [t.lower() for t in d.tags or []]]
        docs.sort(key=lambda d: -hits[d.id]["score"])
        total, window = len(docs), docs[(page - 1) * page_size : page * page_size]
        terms = tokenize(q)
        items = [dict(id=d.id, title=d.title, snippet=hits[d.id]["snippet"] if terms else d.content[:200], tags=d.tags or [], agent_accessible=d.agent_accessible,
                      updated_at=d.updated_at, score=hits[d.id]["score"]) for d in window]
        return {"items": items, "total": total, "page": page, "page_size": page_size}
    docs = list(db.execute(select(KnowledgeDocument).order_by(KnowledgeDocument.updated_at.desc())).scalars())
    if tag:
        docs = [d for d in docs if tag.lower() in [t.lower() for t in d.tags or []]]
    total, window = len(docs), docs[(page - 1) * page_size : page * page_size]
    items = [dict(id=d.id, title=d.title, snippet=_snippet(d.content, [], 200), tags=d.tags or [], agent_accessible=d.agent_accessible, updated_at=d.updated_at) for d in window]
    return {"items": items, "total": total, "page": page, "page_size": page_size}


@router.post("/knowledge", response_model=KnowledgeOut, status_code=201)
def create_document(body: KnowledgeIn, db: Session = Depends(get_db)):
    doc = KnowledgeDocument(**body.model_dump())
    db.add(doc)
    db.commit()
    return doc


@router.get("/knowledge/{document_id}", response_model=KnowledgeOut)
def get_document(document_id: str, db: Session = Depends(get_db)):
    doc = db.get(KnowledgeDocument, document_id)
    if doc is None:
        raise not_found("Document")
    return doc


@router.put("/knowledge/{document_id}", response_model=KnowledgeOut)
def update_document(document_id: str, body: KnowledgeIn, db: Session = Depends(get_db)):
    doc = db.get(KnowledgeDocument, document_id)
    if doc is None:
        raise not_found("Document")
    for k, v in body.model_dump().items():
        setattr(doc, k, v)
    db.commit()
    return doc


@router.delete("/knowledge/{document_id}", status_code=204)
def delete_document(document_id: str, db: Session = Depends(get_db)):
    doc = db.get(KnowledgeDocument, document_id)
    if doc is None:
        raise not_found("Document")
    db.delete(doc)
    db.commit()
