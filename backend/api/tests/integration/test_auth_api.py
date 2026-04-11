async def test_login_success(unauth_client):
    response = await unauth_client.post(
        "/api/auth/login",
        json={"email": "admin@test.com", "password": "adminpass"},
    )
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert "refresh_token" in data


async def test_login_wrong_password(unauth_client):
    response = await unauth_client.post(
        "/api/auth/login",
        json={"email": "admin@test.com", "password": "wrong"},
    )
    assert response.status_code == 401


async def test_refresh_success(unauth_client):
    # First login to get tokens
    login_resp = await unauth_client.post(
        "/api/auth/login",
        json={"email": "admin@test.com", "password": "adminpass"},
    )
    tokens = login_resp.json()

    # Use refresh token
    response = await unauth_client.post(
        "/api/auth/refresh",
        json={"refresh_token": tokens["refresh_token"]},
    )
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert "refresh_token" in data
