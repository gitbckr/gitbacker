async def test_create_repositories(client):
    response = await client.post(
        "/api/repositories",
        json={"urls": ["https://github.com/user/test-repo"]},
    )
    assert response.status_code == 201
    data = response.json()
    assert len(data) == 1
    assert data[0]["status"] == "verifying"
    assert data[0]["name"] == "test-repo"


async def test_trigger_backup(client):
    # Create a repo first
    create_resp = await client.post(
        "/api/repositories",
        json={"urls": ["https://github.com/user/backup-trigger"]},
    )
    repo_id = create_resp.json()[0]["id"]

    response = await client.post(f"/api/repositories/{repo_id}/backup")
    assert response.status_code == 201
    data = response.json()
    assert data["status"] == "pending"
    assert data["trigger_type"] == "manual"


async def test_list_backup_jobs(client):
    # Create a repo first
    create_resp = await client.post(
        "/api/repositories",
        json={"urls": ["https://github.com/user/jobs-list"]},
    )
    repo_id = create_resp.json()[0]["id"]

    response = await client.get(f"/api/repositories/{repo_id}/jobs")
    assert response.status_code == 200
    assert isinstance(response.json(), list)
