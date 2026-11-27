from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_hostels_route() -> None:
    response = client.get("/api/hostels")
    assert response.status_code == 200
    assert len(response.json()["hostels"]) == 3
