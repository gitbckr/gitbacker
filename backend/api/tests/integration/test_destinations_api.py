import tempfile
import os


async def test_create_destination(client):
    with tempfile.TemporaryDirectory() as tmpdir:
        response = await client.post(
            "/api/destinations",
            json={"alias": "New Dest", "path": tmpdir},
        )
        assert response.status_code == 201
        data = response.json()
        assert data["alias"] == "New Dest"
        assert data["storage_type"] == "local"


async def test_create_destination_rejects_missing_path(client):
    response = await client.post(
        "/api/destinations",
        json={"alias": "Bad", "path": "/nonexistent/path"},
    )
    assert response.status_code == 400


async def test_list_destinations(client):
    response = await client.get("/api/destinations")
    assert response.status_code == 200
    data = response.json()
    # At least the default destination seeded in conftest
    assert len(data) >= 1


async def test_delete_destination(client):
    with tempfile.TemporaryDirectory() as tmpdir:
        create_resp = await client.post(
            "/api/destinations",
            json={"alias": "To Delete", "path": tmpdir},
        )
        dest_id = create_resp.json()["id"]

        response = await client.delete(f"/api/destinations/{dest_id}")
        assert response.status_code == 204


async def test_cannot_delete_default_destination(client):
    # The default destination is seeded in conftest
    response = await client.get("/api/destinations")
    default = next(d for d in response.json() if d["is_default"])

    response = await client.delete(f"/api/destinations/{default['id']}")
    assert response.status_code == 400
