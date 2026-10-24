from sqlalchemy import select

from app.api.auth import COOKIE_NAME
from app.core.security import limiter
from app.core.passwords import hash_password, verify_password
from app.db.session import session_scope
from app.models import FinTaxClient, FinTaxSession, FinTaxUser


def test_password_hashing_uses_salt_and_verifies():
    first = hash_password("correct horse battery staple")
    second = hash_password("correct horse battery staple")
    assert first != second
    assert verify_password("correct horse battery staple", first)
    assert not verify_password("wrong password", first)


def test_login_uses_http_only_cookie_and_replaces_active_session(make_client):
    client = make_client(APP_ENV="development")
    with session_scope() as db:
        db.add(FinTaxUser(
            username="fintax-admin",
            email="admin@example.test",
            password_hash=hash_password("correct horse battery staple"),
            role="admin",
            must_change_password=False,
        ))

    first = client.post("/api/auth/login", json={
        "identifier": "fintax-admin",
        "password": "correct horse battery staple",
    })
    assert first.status_code == 200
    assert first.json()["user"]["role"] == "admin"
    assert first.json().get("temporary_password") is None
    first_token = first.cookies[COOKIE_NAME]
    assert "httponly" in first.headers["set-cookie"].lower()

    second = client.post("/api/auth/login", json={
        "identifier": "admin@example.test",
        "password": "correct horse battery staple",
    })
    assert second.status_code == 200
    second_token = second.cookies[COOKIE_NAME]
    assert second_token != first_token

    old = client.get("/api/auth/me", headers={"Cookie": f"{COOKIE_NAME}={first_token}"})
    assert old.status_code == 401
    current = client.get("/api/auth/me", headers={"Cookie": f"{COOKIE_NAME}={second_token}"})
    assert current.json()["user"]["username"] == "fintax-admin"

    with session_scope() as db:
        sessions = db.execute(select(FinTaxSession)).scalars().all()
        assert len(sessions) == 1
        assert sessions[0].token_hash != second_token


def test_staff_endpoints_reject_anonymous(make_client):
    client = make_client(APP_ENV="development")
    assert client.get("/api/tasks").status_code == 401


def test_production_app_does_not_mount_legacy_nexus_apis(make_client):
    client = make_client(APP_ENV="production")
    assert client.get("/api/health").status_code == 200
    assert client.get("/api/tasks").status_code == 404
    demo_login = client.post("/api/auth/login", json={
        "identifier": "demo-admin",
        "password": "admin@2026",
    })
    assert demo_login.status_code == 401


def test_development_sqlite_seeds_demo_accounts_and_assigns_client_access(make_client):
    client = make_client(APP_ENV="development")
    for identifier, password, role in [
        ("demo-admin", "admin@2026", "admin"),
        ("demo-staff", "staff@2026", "staff"),
        ("FT-DEMO-2024", "client@2024", "client"),
    ]:
        response = client.post("/api/auth/login", json={
            "identifier": identifier,
            "password": password,
        })
        assert response.status_code == 200
        assert response.json()["user"]["role"] == role
        client.post("/api/auth/logout")

    client.post("/api/auth/login", json={
        "identifier": "demo-staff",
        "password": "staff@2026",
    })
    accessible = client.get("/api/clients")
    assert accessible.status_code == 200
    assert [item["client_number"] for item in accessible.json()] == ["FT-DEMO-2024"]


def test_login_is_rate_limited_and_cross_origin_posts_are_rejected(make_client):
    client = make_client(APP_ENV="development", CORS_ORIGINS="https://portal.example")
    for _ in range(5):
        assert client.post("/api/auth/login", json={"identifier": "missing", "password": "bad"}).status_code == 401
    limited = client.post("/api/auth/login", json={"identifier": "missing", "password": "bad"})
    assert limited.status_code == 429

    limiter.reset()
    blocked = client.post(
        "/api/auth/login",
        json={"identifier": "missing", "password": "bad"},
        headers={"Origin": "https://untrusted.example"},
    )
    assert blocked.status_code == 403
    trusted = client.post(
        "/api/auth/login",
        json={"identifier": "missing", "password": "bad"},
        headers={"Origin": "https://portal.example"},
    )
    assert trusted.status_code == 401


def test_client_login_is_scoped_to_own_portal_and_staff_assignment(make_client):
    client = make_client(APP_ENV="development")
    with session_scope() as db:
        assigned = FinTaxClient(client_number="FT-101", company_name="Assigned GmbH")
        unassigned = FinTaxClient(client_number="FT-202", company_name="Other GmbH")
        staff = FinTaxUser(
            username="caseworker",
            email="staff@example.test",
            password_hash=hash_password("correct horse battery staple"),
            role="staff",
            must_change_password=False,
        )
        client_user = FinTaxUser(
            username="client-login",
            password_hash=hash_password("client-password-123"),
            role="client",
            must_change_password=False,
        )
        db.add_all([assigned, unassigned, staff])
        db.flush()
        client_user.client_id = assigned.id
        staff.assigned_clients.append(assigned)
        db.add(client_user)

    staff_login = client.post("/api/auth/login", json={
        "identifier": "caseworker",
        "password": "correct horse battery staple",
    })
    assert staff_login.status_code == 200
    assert [entry["client_number"] for entry in client.get("/api/clients").json()] == ["FT-101"]

    client.cookies.clear()
    client_login = client.post("/api/auth/login", json={
        "identifier": "FT-101",
        "password": "client-password-123",
    })
    assert client_login.status_code == 200
    assert client.get("/api/client/home").json()["company_name"] == "Assigned GmbH"
    assert client.get("/api/clients").status_code == 403
    assert client.get("/api/tasks").status_code == 403


def test_admin_created_accounts_receive_one_time_temporary_password(make_client):
    client = make_client(APP_ENV="development")
    with session_scope() as db:
        db.add(FinTaxUser(
            username="root-admin",
            email="root@example.test",
            password_hash=hash_password("correct horse battery staple"),
            role="admin",
            must_change_password=False,
        ))
    login = client.post("/api/auth/login", json={
        "identifier": "root-admin",
        "password": "correct horse battery staple",
    })
    assert login.status_code == 200

    created = client.post("/api/accounts", json={
        "role": "client",
        "username": "client-ft-444",
        "initial_password": "temporary-client-password",
        "client_number": "FT-444",
        "company_name": "New Client GmbH",
        "email": "client@example.test",
    })
    assert created.status_code == 201
    body = created.json()
    assert body["user"]["must_change_password"] is True
    assert body["temporary_password"] == "temporary-client-password"
    assert "password" not in body["user"]
    events = client.get("/api/audit").json()
    account_event = next(event for event in events if event["action"] == "account_create")
    assert account_event["target_id"] == body["user"]["id"]

    client.cookies.clear()
    client_login = client.post("/api/auth/login", json={
        "identifier": "FT-444",
        "password": "temporary-client-password",
    })
    assert client_login.status_code == 200
    assert client.get("/api/client/home").status_code == 403
    assert client.get("/api/documents").status_code == 403
    changed = client.post("/api/auth/change-password", json={
        "current_password": body["temporary_password"],
        "new_password": "new-client-password-123",
    })
    assert changed.status_code == 200
    assert changed.json()["user"]["must_change_password"] is False
    assert client.get("/api/client/home").status_code == 200


def test_account_creation_rejects_short_initial_password(make_client):
    client = make_client(APP_ENV="development")
    with session_scope() as db:
        db.add(FinTaxUser(
            username="root-admin",
            email="root@example.test",
            password_hash=hash_password("correct horse battery staple"),
            role="admin",
            must_change_password=False,
        ))
    client.post("/api/auth/login", json={
        "identifier": "root-admin",
        "password": "correct horse battery staple",
    })
    response = client.post("/api/accounts", json={
        "role": "client",
        "username": "client-ft-445",
        "initial_password": "short",
        "client_number": "FT-445",
        "company_name": "Short Password GmbH",
    })
    assert response.status_code == 422
