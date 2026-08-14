import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_wiki_crud():
    # 1. Register（注册接口仅 admin 可用；用户已存在时跳过注册直接登录）
    admin_token = client.post("/auth/login", json={
        "username": "admin",
        "password": "admin"
    }).json()["access_token"]
    resp = client.post("/auth/register", json={
        "username": "wikitester",
        "email": "wiki@test.com",
        "password": "testpass"
    }, headers={"Authorization": f"Bearer {admin_token}"})
    assert resp.status_code in (200, 400)  # 400 = 用户已存在（上次运行残留）

    # 2. Login
    resp = client.post("/auth/login", json={
        "username": "wikitester",
        "password": "testpass"
    })
    assert resp.status_code == 200
    token = resp.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # 清理残留：test_e2e 等测试会用同名 slug
    client.delete("/wiki/test-page", headers={"Authorization": f"Bearer {admin_token}"})

    # 3. Create wiki page
    resp = client.post("/wiki", json={
        "slug": "test-page",
        "title": "Test Page",
        "type": "entity",
        "content": "---\ntitle: Test\ntype: entity\ntags: []\n---\n\n# Test\n\nContent here."
    }, headers=headers)
    assert resp.status_code == 200
    assert resp.json()["title"] == "Test Page"

    # 4. Get wiki page
    resp = client.get("/wiki/test-page", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["title"] == "Test Page"

    # 5. List wiki pages
    resp = client.get("/wiki", headers=headers)
    assert resp.status_code == 200
    assert len(resp.json()) >= 1

    # 6. Search
    resp = client.get("/wiki/search?q=test", headers=headers)
    assert resp.status_code == 200

    # 7. Update
    resp = client.put("/wiki/test-page", json={
        "title": "Updated Test Page"
    }, headers=headers)
    assert resp.status_code == 200
    assert resp.json()["title"] == "Updated Test Page"

    # 8. Delete
    resp = client.delete("/wiki/test-page", headers=headers)
    assert resp.status_code == 200
