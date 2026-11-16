from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health_is_public():
    assert client.get("/health").json() == {"status": "ok"}


def test_v1_requires_token():
    r = client.get("/v1/ping")
    assert r.status_code == 401
    assert r.json()["code"] == "UNAUTHORIZED"


def test_v1_rejects_wrong_token():
    assert client.get("/v1/ping", headers={"X-Internal-Token": "nope"}).status_code == 401


def test_v1_accepts_token_and_echoes_request_id():
    r = client.get(
        "/v1/ping", headers={"X-Internal-Token": "test-token-0123456789", "x-request-id": "abc"}
    )
    assert r.status_code == 200
    assert r.headers["x-request-id"] == "abc"
