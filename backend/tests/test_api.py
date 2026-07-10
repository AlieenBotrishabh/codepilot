"""
CodePilot RAG — API Integration Tests
Uses fastapi.testclient to verify app status.
"""
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_health_endpoint():
    """Verify that the health check page responds correctly."""
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert "status" in data
    assert "version" in data
    assert "services" in data


def test_root_endpoint():
    """Verify that the index root endpoint returns welcome details."""
    response = client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert "app" in data
    assert "docs_url" in data
