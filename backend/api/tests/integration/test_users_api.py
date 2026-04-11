async def test_create_user(client):
    response = await client.post(
        "/api/users",
        json={
            "email": "newuser@test.com",
            "name": "New User",
            "password": "securepass",
        },
    )
    assert response.status_code == 201
    data = response.json()
    assert data["email"] == "newuser@test.com"
    assert data["role"] == "operator"


async def test_get_me(client):
    response = await client.get("/api/users/me")
    assert response.status_code == 200
    data = response.json()
    assert data["email"] == "admin@test.com"


async def test_list_users(client):
    response = await client.get("/api/users")
    assert response.status_code == 200
    data = response.json()
    assert len(data) >= 1
    emails = {u["email"] for u in data}
    assert "admin@test.com" in emails
