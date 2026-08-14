"""首登强制改密流程测试（零 LLM）。"""
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def _admin_headers():
    token = client.post("/auth/login", json={
        "username": "admin",
        "password": "admin",
    }).json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_must_change_password_flow():
    headers = _admin_headers()
    username = "pwchange-test-user"
    # 清理可能存在的同名用户
    users = client.get("/auth/users", headers=headers).json()
    for u in users:
        if u["username"] == username:
            client.delete(f"/auth/users/{u['id']}", headers=headers)

    # admin 创建用户 → 带初始密码，必须改密
    client.post("/auth/users", headers=headers, json={
        "username": username,
        "password": "init-pass-1",
        "role": "viewer",
    })

    # 登录响应带 must_change_password 标志
    resp = client.post("/auth/login", json={
        "username": username,
        "password": "init-pass-1",
    })
    body = resp.json()
    assert body["must_change_password"] is True
    token = body["access_token"]
    user_headers = {"Authorization": f"Bearer {token}"}

    # 改密前：/auth/me 放行，其他接口 403
    assert client.get("/auth/me", headers=user_headers).status_code == 200
    blocked = client.get("/wiki/", headers=user_headers)
    assert blocked.status_code == 403
    assert blocked.json()["detail"] == "password_change_required"

    # 错误当前密码 → 400
    assert client.post("/auth/change-password", headers=user_headers, json={
        "current_password": "wrong",
        "new_password": "new-pass-123",
    }).status_code == 400

    # 正确改密 → 标志清除，接口恢复
    assert client.post("/auth/change-password", headers=user_headers, json={
        "current_password": "init-pass-1",
        "new_password": "new-pass-123",
    }).status_code == 200
    assert client.get("/auth/me", headers=user_headers).json()[
        "must_change_password"
    ] is False
    assert client.get("/wiki/", headers=user_headers).status_code == 200

    # 新密码可登录且不再要求改密
    resp = client.post("/auth/login", json={
        "username": username,
        "password": "new-pass-123",
    })
    assert resp.json()["must_change_password"] is False

    # 清理
    users = client.get("/auth/users", headers=headers).json()
    for u in users:
        if u["username"] == username:
            client.delete(f"/auth/users/{u['id']}", headers=headers)
