import json

from tests.conftest import wait_for


def run(client, prompt, **kw):
    r = client.post("/api/tasks", json={"prompt": prompt, **kw})
    assert r.status_code == 201, r.text
    return wait_for(client, r.json()["id"])


def test_calculator_task_end_to_end(client):
    t = run(client, "What is 12 * (3 + 4)?")
    assert t["status"] == "completed" and t["mode"] == "demo"
    assert "84" in t["result"] and "Demo mode" in t["result"]
    assert t["result_data"]["simulated"] is True
    assert t["result_data"]["validation"]["passed"] is True
    obs = t["result_data"]["observations"]
    assert obs[0]["tool"] == "calculator" and obs[0]["output"]["result"] == 84
    assert t["duration_ms"] is not None and t["completed_at"]

    events = client.get(f"/api/tasks/{t['id']}/events").json()
    types = [e["type"] for e in events]
    seqs = [e["seq"] for e in events]
    assert seqs == list(range(1, len(seqs) + 1))
    assert types[0] == "task.created" and types[1] == "task.started" and types[-1] == "task.completed"
    for needed in ("agent.started", "agent.completed", "agent.handoff", "tool.started", "tool.completed"):
        assert needed in types
    started = [e["agent"] for e in events if e["type"] == "agent.started"]
    assert started == ["planner", "execution", "analysis", "validation", "response"]  # research skipped: no research step planned
    tool_ev = [e for e in events if e["type"] == "tool.completed"]
    assert tool_ev[0]["tool"] == "calculator"
    handoffs = [e for e in events if e["type"] == "agent.handoff"]
    assert {"from": "planner", "to": "execution", "kind": "data"} in handoffs[1]["data"]["edges"]


def test_knowledge_task_uses_real_documents(client):
    client.post("/api/knowledge", json={"title": "Refund policy", "content": "Refunds are issued within 14 days of purchase.", "tags": ["policy"]})
    t = run(client, "What is the refund policy?")
    assert t["status"] == "completed"
    assert any(s["type"] == "knowledge" for s in t["result_data"]["sources"])
    assert "Refund policy" in t["result"]


def test_no_fabricated_sources_without_search(client):
    t = run(client, "Tell me the latest news about robots", allow_web_search=False)
    assert t["status"] == "completed"
    assert all(s["type"] != "web" for s in t["result_data"]["sources"])
    assert "web_search" not in json.dumps(t["result_data"]["observations"])


def test_web_search_requires_configuration(client):
    r = client.post("/api/tasks", json={"prompt": "news", "allow_web_search": True})
    assert r.status_code == 422 and r.json()["error"]["code"] == "search_not_configured"


def test_tool_failure_fails_task_explicitly(client):
    t = run(client, "Compute 1 / 0")
    assert t["status"] == "failed"
    assert t["error"]["code"] == "tool_failed" and "zero" in t["error"]["message"].lower()
    events = client.get(f"/api/tasks/{t['id']}/events").json()
    types = [e["type"] for e in events]
    assert "tool.failed" in types and "agent.failed" in types and types[-1] == "task.failed"
    assert "task.completed" not in types
    assert "agent.completed" not in [e["type"] for e in events if e["agent"] == "execution"]


def test_retry_failed_task(client):
    t = run(client, "Compute 1 / 0")
    r = client.post(f"/api/tasks/{t['id']}/retry")
    assert r.status_code == 201 and r.json()["retry_of"] == t["id"]
    ok = run(client, "2+2")
    assert client.post(f"/api/tasks/{ok['id']}/retry").status_code == 409


def test_cancel_running_task(make_client):
    c = make_client(DEMO_STEP_DELAY="0.5")
    r = c.post("/api/tasks", json={"prompt": "1+1"})
    tid = r.json()["id"]
    import time

    time.sleep(0.2)
    assert c.post(f"/api/tasks/{tid}/cancel").status_code == 202
    t = wait_for(c, tid)
    assert t["status"] == "cancelled"
    types = [e["type"] for e in c.get(f"/api/tasks/{tid}/events").json()]
    assert types[-1] == "task.cancelled" and "task.completed" not in types
    assert c.post(f"/api/tasks/{tid}/cancel").status_code == 409


def test_task_timeout(make_client):
    c = make_client(DEMO_STEP_DELAY="1.0", TASK_TIMEOUT_SECONDS="0.3")
    r = c.post("/api/tasks", json={"prompt": "1+1"})
    t = wait_for(c, r.json()["id"])
    assert t["status"] == "failed" and t["error"]["code"] == "task_timeout"


def test_task_list_filters_and_pagination(client):
    for p in ("1+1", "2+2", "Compute 1 / 0"):
        run(client, p)
    assert client.get("/api/tasks").json()["total"] == 3
    assert client.get("/api/tasks?status=failed").json()["total"] == 1
    assert client.get("/api/tasks?q=2%2B2").json()["total"] == 1
    page = client.get("/api/tasks?page=2&page_size=2").json()
    assert len(page["items"]) == 1 and page["total"] == 3
    assert client.get("/api/tasks?status=bogus").status_code == 422
    assert client.get("/api/tasks/doesnotexist").status_code == 404


def test_dashboard_and_analytics_reflect_data(client):
    run(client, "1+1")
    run(client, "Compute 1 / 0")
    d = client.get("/api/dashboard/stats").json()
    assert d["total_tasks"] == 2 and d["completed"] == 1 and d["failed"] == 1 and d["success_rate"] == 0.5
    assert d["agents"]["execution"]["failed"] == 1
    assert any(e["type"] == "task.failed" for e in d["recent_events"])
    a = client.get("/api/analytics/summary").json()
    assert a["total_tasks"] == 2 and a["series"][-1]["total"] == 2
    tools = {t["tool"]: t for t in a["tool_usage"]}
    assert tools["calculator"]["calls"] == 2 and tools["calculator"]["failed"] == 1
    assert {x["agent"] for x in a["agent_usage"]} >= {"planner", "execution"}


def test_sse_stream_delivers_ordered_events_and_resumes(client):
    r = client.post("/api/tasks", json={"prompt": "5*5"})
    tid = r.json()["id"]
    wait_for(client, tid)
    seen = []
    with client.stream("GET", f"/api/tasks/{tid}/stream") as resp:
        assert resp.headers["content-type"].startswith("text/event-stream")
        for line in resp.iter_lines():
            if line.startswith("data: "):
                seen.append(json.loads(line[6:]))
    assert [e["seq"] for e in seen] == list(range(1, len(seen) + 1))
    assert seen[-1]["type"] == "task.completed"
    # resume with Last-Event-ID: only newer events, no duplicates
    cut = seen[3]["seq"]
    resumed = []
    with client.stream("GET", f"/api/tasks/{tid}/stream", headers={"Last-Event-ID": str(cut)}) as resp:
        for line in resp.iter_lines():
            if line.startswith("data: "):
                resumed.append(json.loads(line[6:]))
    assert resumed[0]["seq"] == cut + 1 and resumed[-1]["seq"] == seen[-1]["seq"]


def test_sse_live_stream_while_running(make_client):
    c = make_client(DEMO_STEP_DELAY="0.1")
    tid = c.post("/api/tasks", json={"prompt": "7*6"}).json()["id"]
    types = []
    with c.stream("GET", f"/api/tasks/{tid}/stream") as resp:
        for line in resp.iter_lines():
            if line.startswith("event: "):
                types.append(line[7:])
    assert types[0] == "task.created" and types[-1] == "task.completed" and "agent.progress" in types


def test_interrupted_tasks_recovered_on_startup(make_client):
    c = make_client()
    from app.db.session import session_scope
    from app.models import Task
    from app.orchestration.manager import recover_interrupted

    with session_scope() as s:
        s.add(Task(id="stale1", prompt="x", status="running", mode="demo", permissions=[]))
    assert recover_interrupted() == 1
    t = c.get("/api/tasks/stale1").json()
    assert t["status"] == "failed" and t["error"]["code"] == "interrupted"
