from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import app

AUTH = {"X-Internal-Token": "test-token-0123456789"}
SAMPLES = Path(__file__).resolve().parents[3] / "samples"
PDF = "application/pdf"
TXT = "text/plain"


@pytest.fixture
def client():
    return TestClient(app, raise_server_exceptions=False)


def post(client, data: bytes, mime: str, headers=AUTH):
    return client.post(
        "/v1/documents/extract", params={"mime": mime}, content=data, headers=headers
    )


def test_requires_the_internal_token(client):
    assert post(client, b"x", TXT, headers={}).status_code == 401


def test_extracts_segments_with_pages(client):
    r = post(client, (SAMPLES / "01_clinicbook_requirements_en.pdf").read_bytes(), PDF)
    assert r.status_code == 200
    body = r.json()
    assert body["page_count"] == 2
    assert body["token_count"] == sum(s["token_count"] for s in body["segments"])
    assert {s["page"] for s in body["segments"]} == {1, 2}
    assert set(body["segments"][0]) == {"index", "page", "text", "token_count"}


def test_cp1251_text_comes_back_as_cyrillic(client):
    r = post(client, (SAMPLES / "03_client_email_ru_cp1251.txt").read_bytes(), TXT)
    assert r.status_code == 200
    assert r.json()["encoding"] == "cp1251"
    assert "Дмитрий" in r.json()["segments"][0]["text"]


@pytest.mark.parametrize(
    ("file", "status", "code"),
    [
        ("05_scanned_addendum_no_text.pdf", 422, "PDF_NO_TEXT_LAYER"),
        ("06_corrupted.pdf", 422, "FILE_CORRUPTED"),
    ],
)
def test_unreadable_documents_return_a_typed_error(client, file, status, code):
    r = post(client, (SAMPLES / file).read_bytes(), PDF)
    assert r.status_code == status
    body = r.json()
    assert body["code"] == code
    assert body["requestId"]


def test_unsupported_mime_is_415(client):
    r = post(client, b"x", "image/png")
    assert r.status_code == 415
    assert r.json()["code"] == "UNSUPPORTED_TYPE"


def test_oversized_body_is_413(client):
    r = post(client, b"a" * (11 * 1024 * 1024 + 1), TXT)
    assert r.status_code == 413
    assert r.json()["code"] == "FILE_TOO_LARGE"


def test_missing_mime_is_a_validation_error(client):
    r = client.post("/v1/documents/extract", content=b"x", headers=AUTH)
    assert r.status_code == 422
    assert r.json()["code"] == "VALIDATION_ERROR"
