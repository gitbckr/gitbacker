async def test_create_destination(client):
    response = await client.post(
        "/api/destinations",
        json={"alias": "New Dest", "path": "/tmp/new-dest"},
    )
    assert response.status_code == 201
    data = response.json()
    assert data["alias"] == "New Dest"
    assert data["storage_type"] == "local"


async def test_list_destinations(client):
    response = await client.get("/api/destinations")
    assert response.status_code == 200
    data = response.json()
    # At least the default destination seeded in conftest
    assert len(data) >= 1


async def test_delete_destination(client):
    # Create one first
    create_resp = await client.post(
        "/api/destinations",
        json={"alias": "To Delete", "path": "/tmp/del"},
    )
    dest_id = create_resp.json()["id"]

    response = await client.delete(f"/api/destinations/{dest_id}")
    assert response.status_code == 204
