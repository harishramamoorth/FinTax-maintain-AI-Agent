import json
import logging

import httpx
import pytest

from app.core.config import Settings
from app.core.logging import RedactingFilter, redact
from app.services.llm import LLMError, LLMRequest, OpenAICompatProvider


def settings(**kw):
    return Settings(_env_file=None, ai_api_key="sk-live-secretvalue123", ai_base_url="https://api.example.test/v1/", ai_model="m1", ai_max_retries=2, **kw)


def req():
    return LLMRequest(purpose="response", messages=[{"role": "user", "content": "hi"}], model="m1")


async def chat(handler, **kw):
    p = OpenAICompatProvider(settings(**kw), transport=httpx.MockTransport(handler))
    return await p.chat(req())


def test_provider_success_sends_auth_and_parses_usage():
    import asyncio

    seen = {}

    def handler(request: httpx.Request):
        seen["url"], seen["auth"], seen["body"] = str(request.url), request.headers["authorization"], json.loads(request.content)
        return httpx.Response(200, json={"model": "m1", "choices": [{"message": {"content": "hello"}}], "usage": {"prompt_tokens": 5, "completion_tokens": 7}})

    r = asyncio.run(chat(handler))
    assert r.text == "hello" and r.total_tokens == 12 and r.simulated is False
    assert seen["url"] == "https://api.example.test/v1/chat/completions" and seen["auth"] == "Bearer sk-live-secretvalue123"
    assert seen["body"]["model"] == "m1"


def test_provider_retries_rate_limit_then_succeeds():
    import asyncio

    calls = {"n": 0}

    def handler(request):
        calls["n"] += 1
        if calls["n"] < 3:
            return httpx.Response(429, headers={"retry-after": "0"})
        return httpx.Response(200, json={"choices": [{"message": {"content": "ok"}}]})

    assert asyncio.run(chat(handler)).text == "ok" and calls["n"] == 3


@pytest.mark.parametrize("resp,code", [
    (httpx.Response(401), "provider_auth"),
    (httpx.Response(400, text="bad"), "provider_bad_request"),
    (httpx.Response(200, text="not json"), "malformed_response"),
    (httpx.Response(200, json={"choices": []}), "malformed_response"),
    (httpx.Response(200, json={"choices": [{"message": {"content": None}}]}), "malformed_response"),
    (httpx.Response(503), "provider_unavailable"),
    (httpx.Response(429), "provider_rate_limited"),
])
def test_provider_error_mapping(resp, code):
    import asyncio

    with pytest.raises(LLMError) as ei:
        asyncio.run(chat(lambda r: resp))
    assert ei.value.code == code


def test_provider_network_failure():
    import asyncio

    def handler(request):
        raise httpx.ConnectError("boom")

    with pytest.raises(LLMError) as ei:
        asyncio.run(chat(handler))
    assert ei.value.code == "provider_unreachable"


def test_live_pipeline_with_mocked_provider_and_repair(make_client, monkeypatch):
    """Full live-mode run: planner returns malformed JSON first (repair path), then valid; secrets never leak."""
    from app.services import llm as llm_mod
    from tests.conftest import wait_for

    replies = iter([
        "Sure! here is the plan (not json)",
        '```json\n{"objective":"add","steps":[{"title":"calc","kind":"execution","tool":"calculator","input":{"expression":"20+22"}}],"notes":""}\n```',
        "Findings: 20+22 = 42.",
        '{"passed": true, "score": 0.95, "issues": [], "summary": "good"}',
        "## Answer\nThe result is **42**.",
    ])
    sent = []

    def handler(request):
        sent.append(json.loads(request.content))
        return httpx.Response(200, json={"model": "m1", "choices": [{"message": {"content": next(replies)}}], "usage": {"prompt_tokens": 10, "completion_tokens": 10}})

    real = llm_mod.OpenAICompatProvider
    monkeypatch.setattr(llm_mod, "OpenAICompatProvider", lambda s: real(s, transport=httpx.MockTransport(handler)))
    c = make_client(DEMO_MODE="false", AI_API_KEY="sk-live-secretvalue123", AI_MODEL="m1")
    assert c.get("/api/health").json()["mode"] == "live"
    r = c.post("/api/tasks", json={"prompt": "what is 20+22"})
    t = wait_for(c, r.json()["id"])
    assert t["status"] == "completed" and t["mode"] == "live", t
    assert "42" in t["result"] and t["tokens_used"] == 100 and t["llm_calls"] == 5
    assert t["result_data"]["simulated"] is False and t["result_data"]["model"] == "m1"
    assert "sk-live" not in json.dumps(t) and "sk-live" not in json.dumps(c.get(f"/api/tasks/{t['id']}/events").json())
    assert all(e["simulated"] is False for e in c.get(f"/api/tasks/{t['id']}/events").json())
    assert "<user_task>" in sent[0]["messages"][1]["content"]  # prompt is delimited


def test_live_provider_failure_marks_task_failed(make_client, monkeypatch):
    from app.services import llm as llm_mod
    from tests.conftest import wait_for

    real = llm_mod.OpenAICompatProvider
    monkeypatch.setattr(llm_mod, "OpenAICompatProvider", lambda s: real(s, transport=httpx.MockTransport(lambda r: httpx.Response(401))))
    c = make_client(DEMO_MODE="false", AI_API_KEY="sk-live-secretvalue123")
    t = wait_for(c, c.post("/api/tasks", json={"prompt": "hi"}).json()["id"])
    assert t["status"] == "failed" and t["error"]["code"] == "provider_auth" and t["error"]["agent"] == "planner"
    types = [e["type"] for e in c.get(f"/api/tasks/{t['id']}/events").json()]
    assert "agent.failed" in types and types[-1] == "task.failed" and "task.completed" not in types


def test_token_budget_enforced(make_client, monkeypatch):
    from app.services import llm as llm_mod
    from tests.conftest import wait_for

    def handler(request):
        return httpx.Response(200, json={"choices": [{"message": {"content": '{"objective":"","steps":[],"notes":""}'}}], "usage": {"prompt_tokens": 600, "completion_tokens": 600}})

    real = llm_mod.OpenAICompatProvider
    monkeypatch.setattr(llm_mod, "OpenAICompatProvider", lambda s: real(s, transport=httpx.MockTransport(handler)))
    c = make_client(DEMO_MODE="false", AI_API_KEY="sk-live-secretvalue123", MAX_TOKENS_PER_TASK="1000")
    t = wait_for(c, c.post("/api/tasks", json={"prompt": "hi"}).json()["id"])
    assert t["status"] == "failed" and t["error"]["code"] == "token_budget_exceeded"


def test_log_redaction(caplog):
    assert "sk-abcdefghijk" not in redact("key sk-abcdefghijklmnop here")
    assert redact("Authorization: Bearer abc.def.ghi123456") == "Authorization: Bearer [REDACTED]"
    assert "hunter2" not in redact('{"password": "hunter2"}')
    assert "topsecretvalue" not in redact("value topsecretvalue", ["topsecretvalue"])
    rec = logging.LogRecord("x", logging.INFO, "f", 1, "token=%s", ("abcd1234efgh",), None)
    RedactingFilter().filter(rec)
    assert "abcd1234efgh" not in rec.getMessage()


def test_database_url_normalisation():
    assert Settings(_env_file=None, database_url="postgres://u:p@h:5432/d").database_url == "postgresql+psycopg://u:p@h:5432/d"
    assert Settings(_env_file=None, database_url="postgresql://u:p@h/d").database_url.startswith("postgresql+psycopg://")


def test_alembic_migration_matches_models(tmp_path):
    import sqlalchemy as sa

    from app.db.base import Base
    from app.main import run_migrations
    import app.models  # noqa: F401

    url = f"sqlite:///{tmp_path / 'm.db'}"
    run_migrations(url)
    insp = sa.inspect(sa.create_engine(url))
    assert set(Base.metadata.tables) | {"alembic_version"} == set(insp.get_table_names())
    for name, table in Base.metadata.tables.items():
        assert {c.name for c in table.columns} == {c["name"] for c in insp.get_columns(name)}, name


def test_spa_fallback_and_static(tmp_path, make_client):
    dist = tmp_path / "dist"
    (dist / "assets").mkdir(parents=True)
    (dist / "index.html").write_text("<html>NEXUS-SPA</html>")
    (dist / "assets" / "a.js").write_text("console.log(1)")
    (dist / "favicon.svg").write_text("<svg/>")
    c = make_client(FRONTEND_DIST=str(dist))
    assert "NEXUS-SPA" in c.get("/").text
    assert "NEXUS-SPA" in c.get("/workspace").text  # client-side route fallback
    assert c.get("/assets/a.js").text == "console.log(1)"
    assert c.get("/favicon.svg").text == "<svg/>"
    assert c.get("/api/unknown").status_code == 404 and c.get("/api/unknown").json()["error"]["code"] == "not_found"
    # path traversal must never expose files outside the dist directory
    secret = tmp_path / "secret.txt"
    secret.write_text("TOP-SECRET")
    for probe in ("/..%2Fsecret.txt", "/../secret.txt", "/%2e%2e/secret.txt"):
        assert "TOP-SECRET" not in c.get(probe).text
    assert c.get("/api/health").status_code == 200
