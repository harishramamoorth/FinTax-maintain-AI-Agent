from tests.conftest import wait_for


def test_health(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok" and body["database"] == "ok" and body["mode"] == "demo"
    assert "ai_api_key" not in str(body).lower()


def test_unknown_api_route_json_404(client):
    r = client.get("/api/nope")
    assert r.status_code == 404 and r.json()["error"]["code"] == "not_found"


def test_validation_error_format(client):
    r = client.post("/api/tasks", json={"prompt": "   "})
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "validation_error"


def test_prompt_too_long(client):
    r = client.post("/api/tasks", json={"prompt": "x" * 4500})
    assert r.status_code == 422 and r.json()["error"]["code"] == "prompt_too_long"


def test_request_size_limit(make_client):
    c = make_client(MAX_REQUEST_BYTES=500)
    r = c.post("/api/tasks", json={"prompt": "x" * 2000})
    assert r.status_code == 413 and r.json()["error"]["code"] == "payload_too_large"


def test_rate_limit(make_client):
    c = make_client(RATE_LIMIT_PER_MINUTE=2)
    codes = [c.post("/api/tasks", json={"prompt": "1+1"}).status_code for _ in range(4)]
    assert codes[:2] == [201, 201] and codes[2] == 429
    r = c.post("/api/tasks", json={"prompt": "1+1"})
    assert r.headers.get("retry-after")


def test_access_token(make_client):
    c = make_client(ACCESS_TOKEN="s3cret-token-value")
    assert c.get("/api/health").json()["auth_required"] is True
    assert c.get("/api/tasks").status_code == 401
    assert c.get("/api/tasks", headers={"Authorization": "Bearer wrong"}).status_code == 401
    assert c.get("/api/tasks", headers={"Authorization": "Bearer s3cret-token-value"}).status_code == 200


def test_settings_never_expose_secrets(make_client):
    c = make_client(AI_API_KEY="sk-test-abcdef123456", DEMO_MODE="false", ACCESS_TOKEN="tok-abcdef123456")
    h = {"Authorization": "Bearer tok-abcdef123456"}
    body = c.get("/api/settings", headers=h).text
    assert "sk-test" not in body and "abcdef123456" not in body
    assert c.get("/api/health").text.count("sk-test") == 0
    assert c.get("/api/settings", headers=h).json()["provider"]["configured"] is True


def test_live_mode_without_credentials_fails_gracefully(make_client):
    c = make_client(DEMO_MODE="false", AI_API_KEY="")
    r = c.post("/api/tasks", json={"prompt": "hello"})
    assert r.status_code == 503
    err = r.json()["error"]
    assert err["code"] == "provider_not_configured" and "AI_API_KEY" in err["message"]
    assert c.get("/api/tasks").json()["total"] == 0  # nothing was persisted


def test_auto_mode_without_key_is_demo(make_client):
    c = make_client(DEMO_MODE="auto", AI_API_KEY="")
    assert c.get("/api/health").json()["mode"] == "demo"


def test_openapi_documented(client):
    spec = client.get("/api/openapi.json").json()
    for path in ("/api/tasks", "/api/tasks/{task_id}/cancel", "/api/workflows", "/api/knowledge", "/api/analytics/summary", "/api/dashboard/stats", "/api/health"):
        assert path in spec["paths"]


def test_empty_dashboard_and_analytics(client):
    d = client.get("/api/dashboard/stats").json()
    assert d["total_tasks"] == 0 and d["success_rate"] is None and d["recent_tasks"] == []
    a = client.get("/api/analytics/summary").json()
    assert a["total_tasks"] == 0 and a["tool_usage"] == [] and len(a["series"]) == 14


def test_agents_and_tools_listing(client):
    agents = client.get("/api/agents").json()
    assert [a["key"] for a in agents] == ["planner", "research", "execution", "analysis", "validation", "response"]
    tools = {t["name"]: t for t in client.get("/api/tools").json()}
    assert {"calculator", "datetime", "text_summarizer", "json_tool", "knowledge_search", "web_search"} <= set(tools)
    assert tools["web_search"]["available"] is False
    r = client.put("/api/agents/research", json={"model": "gpt-x", "temperature": 0.3, "max_tokens": 512, "enabled": True})
    assert r.status_code == 200 and client.get("/api/agents").json()[1]["model"] == "gpt-x"
    assert client.put("/api/agents/planner", json={"enabled": False}).status_code == 422


def test_preferences_persist(client):
    r = client.put("/api/settings/preferences", json={"animation_level": "reduced"})
    assert r.json()["animation_level"] == "reduced"
    assert client.get("/api/settings").json()["preferences"]["animation_level"] == "reduced"
    assert client.put("/api/settings/preferences", json={"animation_level": "bogus"}).status_code == 422


def test_empty_env_values_mean_not_set(make_client):
    c = make_client(AI_API_KEY="", ACCESS_TOKEN="  ", SEARCH_API_KEY="")
    h = c.get("/api/health").json()
    assert h["auth_required"] is False and h["provider_configured"] is False and h["search_configured"] is False
    assert c.get("/api/tasks").status_code == 200
