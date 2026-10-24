from __future__ import annotations

import hashlib
import uuid
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pypdf import PdfReader
from pypdf.errors import PdfReadError, PdfStreamError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.auth import active_user
from app.core.config import Settings, get_settings
from app.db.session import get_db
from app.models import FinTaxAuditEvent, FinTaxClient, FinTaxDocument, FinTaxUser

router = APIRouter(tags=["FinTax documents"])

DocumentCategory = Literal[
    "company_formation",
    "accounting",
    "bank_statement",
    "purchase_invoice",
    "sales_invoice",
    "receipt",
    "cash_book",
    "payroll",
    "employee_record",
    "correspondence",
    "identity_document",
    "contract",
    "other",
]

_CHUNK_SIZE = 1024 * 1024
_PAGE_LIMIT = 200
_IMAGE_TYPES = {
    "jpeg": ("image/jpeg", ".jpg", lambda header: header.startswith(b"\xff\xd8\xff")),
    "png": ("image/png", ".png", lambda header: header.startswith(b"\x89PNG\r\n\x1a\n")),
    "webp": ("image/webp", ".webp", lambda header: header[:4] == b"RIFF" and header[8:12] == b"WEBP"),
}


def _document_access_query(user: FinTaxUser, db: Session, document_id: str) -> FinTaxDocument:
    query = select(FinTaxDocument).where(FinTaxDocument.id == document_id)
    if user.role == "client":
        query = query.where(FinTaxDocument.client_id == user.client_id)
    elif user.role == "staff":
        query = query.where(FinTaxClient.staff_users.any(FinTaxUser.id == user.id))
        query = query.join(FinTaxClient, FinTaxDocument.client_id == FinTaxClient.id)
    document = db.execute(query).scalar_one_or_none()
    if document is None:
        raise HTTPException(status_code=404, detail="Document not found")
    return document


def _document_dict(document: FinTaxDocument) -> dict[str, object]:
    return {
        "id": document.id,
        "client_id": document.client_id,
        "original_filename": document.original_filename,
        "media_type": document.media_type,
        "size_bytes": document.size_bytes,
        "sha256": document.sha256,
        "category": document.category,
        "page_count": document.page_count,
        "status": document.status,
        "created_at": document.created_at,
    }


def _detect_type(header: bytes) -> tuple[str, str]:
    if header.startswith(b"%PDF-"):
        return "application/pdf", ".pdf"
    for media_type, extension, valid in _IMAGE_TYPES.values():
        if valid(header):
            return media_type, extension
    raise HTTPException(status_code=415, detail="Upload a PDF, JPEG, PNG, or WebP image")


def _client_for_upload(user: FinTaxUser, client_id: str | None, db: Session) -> FinTaxClient:
    if user.role == "client":
        if user.client is None:
            raise HTTPException(status_code=403, detail="Client account is not linked to a company")
        return user.client
    if user.role not in {"admin", "staff"} or not client_id:
        raise HTTPException(status_code=422, detail="Select a client account for this upload")
    client = db.get(FinTaxClient, client_id)
    if client is None:
        raise HTTPException(status_code=404, detail="Client not found")
    if user.role == "staff" and all(staff.id != user.id for staff in client.staff_users):
        raise HTTPException(status_code=403, detail="This client is not assigned to you")
    return client


@router.get("/documents")
def list_documents(
    user: FinTaxUser = Depends(active_user),
    db: Session = Depends(get_db),
):
    query = select(FinTaxDocument).order_by(FinTaxDocument.created_at.desc())
    if user.role == "client":
        query = query.where(FinTaxDocument.client_id == user.client_id)
    elif user.role == "staff":
        query = query.join(FinTaxClient, FinTaxDocument.client_id == FinTaxClient.id).where(
            FinTaxClient.staff_users.any(FinTaxUser.id == user.id)
        )
    documents = db.execute(query.limit(500)).scalars()
    db.add(FinTaxAuditEvent(
        user_id=user.id,
        client_id=user.client_id if user.role == "client" else None,
        action="document_list_view",
    ))
    db.commit()
    return [_document_dict(document) for document in documents]


@router.post("/documents", status_code=201)
async def upload_document(
    file: UploadFile = File(...),
    category: DocumentCategory = Form(...),
    client_id: str | None = Form(None),
    user: FinTaxUser = Depends(active_user),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
):
    client = _client_for_upload(user, client_id, db)
    document_id = uuid.uuid4().hex
    storage_root = Path(settings.document_storage_dir).resolve()
    client_directory = (storage_root / client.id).resolve()
    if storage_root not in client_directory.parents:
        raise HTTPException(status_code=500, detail="Document storage path is invalid")
    client_directory.mkdir(parents=True, exist_ok=True)

    temporary_path = client_directory / f"{document_id}.part"
    header = bytearray()
    digest = hashlib.sha256()
    size_bytes = 0
    media_type = ""
    extension = ""
    page_count: int | None = None
    status = "received"
    original_filename = Path((file.filename or "upload").replace("\\", "/")).name[:255]
    if not original_filename:
        original_filename = "upload"

    try:
        with temporary_path.open("xb") as output:
            while chunk := await file.read(_CHUNK_SIZE):
                size_bytes += len(chunk)
                if size_bytes > settings.max_document_upload_bytes:
                    raise HTTPException(status_code=413, detail="Document exceeds the 50 MB upload limit")
                if len(header) < 12:
                    header.extend(chunk[: 12 - len(header)])
                digest.update(chunk)
                output.write(chunk)
        if size_bytes == 0:
            raise HTTPException(status_code=422, detail="The uploaded file is empty")
        media_type, extension = _detect_type(bytes(header))

        if media_type == "application/pdf":
            try:
                reader = PdfReader(str(temporary_path), strict=True)
                if reader.is_encrypted:
                    status = "password_required"
                else:
                    page_count = len(reader.pages)
                    if page_count < 1:
                        raise HTTPException(status_code=422, detail="The PDF contains no pages")
                    if page_count > _PAGE_LIMIT:
                        raise HTTPException(status_code=422, detail="PDFs are limited to 200 pages")
            except (PdfReadError, PdfStreamError, EOFError, ValueError) as exc:
                raise HTTPException(status_code=422, detail="The PDF could not be read") from exc

        duplicate = db.execute(
            select(FinTaxDocument.id).where(
                FinTaxDocument.client_id == client.id,
                FinTaxDocument.sha256 == digest.hexdigest(),
            ).limit(1)
        ).scalar_one_or_none()
        if duplicate:
            status = "duplicate"

        storage_key = f"{client.id}/{document_id}{extension}"
        final_path = client_directory / f"{document_id}{extension}"
        temporary_path.replace(final_path)
        document = FinTaxDocument(
            id=document_id,
            client_id=client.id,
            uploaded_by_user_id=user.id,
            original_filename=original_filename,
            storage_key=storage_key,
            media_type=media_type,
            size_bytes=size_bytes,
            sha256=digest.hexdigest(),
            category=category,
            page_count=page_count,
            status=status,
        )
        db.add(document)
        db.add(FinTaxAuditEvent(
            user_id=user.id,
            client_id=client.id,
            action="document_upload",
            target_id=document_id,
            details={"category": category, "size_bytes": size_bytes},
        ))
        try:
            db.commit()
        except Exception:
            db.rollback()
            final_path.unlink(missing_ok=True)
            raise
        return _document_dict(document)
    except Exception:
        temporary_path.unlink(missing_ok=True)
        raise
    finally:
        await file.close()


@router.get("/documents/{document_id}/download")
def download_document(
    document_id: str,
    user: FinTaxUser = Depends(active_user),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
):
    document = _document_access_query(user, db, document_id)
    root = Path(settings.document_storage_dir).resolve()
    path = (root / document.storage_key).resolve()
    if root not in path.parents or not path.is_file():
        raise HTTPException(status_code=404, detail="Stored document is unavailable")
    db.add(FinTaxAuditEvent(
        user_id=user.id,
        client_id=document.client_id,
        action="document_download",
        target_id=document.id,
    ))
    db.commit()
    return FileResponse(path, media_type="application/octet-stream", filename=document.original_filename)
