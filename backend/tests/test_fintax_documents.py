from io import BytesIO
from pathlib import Path

from pypdf import PdfReader, PdfWriter

from app.core.passwords import hash_password
from app.db.session import session_scope
from app.models import FinTaxClient, FinTaxDocument, FinTaxUser


def _staff_client(make_client, storage: Path, max_upload: int = 50 * 1024 * 1024):
    api = make_client(
        APP_ENV="development",
        DOCUMENT_STORAGE_DIR=str(storage),
        MAX_DOCUMENT_UPLOAD_BYTES=max_upload,
    )
    with session_scope() as db:
        company = FinTaxClient(client_number="FT-300", company_name="Upload GmbH")
        staff = FinTaxUser(
            username="upload-staff",
            email="upload-staff@example.test",
            password_hash=hash_password("correct horse battery staple"),
            role="staff",
            must_change_password=False,
        )
        db.add_all([company, staff])
        db.flush()
        staff.assigned_clients.append(company)
        db.commit()
        client_id = company.id
    login = api.post("/api/auth/login", json={
        "identifier": "upload-staff",
        "password": "correct horse battery staple",
    })
    assert login.status_code == 200
    return api, client_id


def test_pdf_upload_preserves_original_and_is_downloadable(make_client, tmp_path):
    api, client_id = _staff_client(make_client, tmp_path / "documents")
    writer = PdfWriter()
    writer.add_blank_page(width=72, height=72)
    content = BytesIO()
    writer.write(content)
    original = content.getvalue()

    response = api.post(
        "/api/documents",
        data={"client_id": client_id, "category": "bank_statement"},
        files={"file": ("bank.pdf", original, "application/pdf")},
    )
    assert response.status_code == 201, response.text
    record = response.json()
    assert record["original_filename"] == "bank.pdf"
    assert record["page_count"] == 1 and record["status"] == "received"

    path = tmp_path / "documents" / record["client_id"] / f"{record['id']}.pdf"
    assert path.read_bytes() == original
    assert len(record["sha256"]) == 64

    listing = api.get("/api/documents").json()
    assert len(listing) == 1 and listing[0]["id"] == record["id"]
    download = api.get(f"/api/documents/{record['id']}/download")
    assert download.status_code == 200 and download.content == original
    reader = PdfReader(BytesIO(download.content))
    assert len(reader.pages) == 1
    duplicate = api.post(
        "/api/documents",
        data={"client_id": client_id, "category": "bank_statement"},
        files={"file": ("bank-copy.pdf", original, "application/pdf")},
    )
    assert duplicate.status_code == 201
    assert duplicate.json()["status"] == "duplicate"


def test_upload_rejects_unsupported_content_and_oversized_files(make_client, tmp_path):
    api, client_id = _staff_client(make_client, tmp_path / "unsupported", max_upload=32)
    bad = api.post(
        "/api/documents",
        data={"client_id": client_id, "category": "accounting"},
        files={"file": ("bad.pdf", b"not a pdf", "application/pdf")},
    )
    assert bad.status_code == 415

    oversized_image = b"\x89PNG\r\n\x1a\n" + b"x" * 40
    oversized = api.post(
        "/api/documents",
        data={"client_id": client_id, "category": "accounting"},
        files={"file": ("big.png", oversized_image, "image/png")},
    )
    assert oversized.status_code == 413


def test_staff_cannot_upload_for_unassigned_client(make_client, tmp_path):
    api, _ = _staff_client(make_client, tmp_path / "scoped")
    with session_scope() as db:
        other = FinTaxClient(client_number="FT-999", company_name="Private GmbH")
        db.add(other)
        db.commit()
        other_id = other.id
    response = api.post(
        "/api/documents",
        data={"client_id": other_id, "category": "accounting"},
        files={"file": ("note.png", b"\x89PNG\r\n\x1a\ncontent", "image/png")},
    )
    assert response.status_code == 403
    with session_scope() as db:
        assert db.query(FinTaxDocument).count() == 0
