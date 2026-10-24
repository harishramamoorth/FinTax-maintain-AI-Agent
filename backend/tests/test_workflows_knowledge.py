from tests.conftest import wait_for

GOOD = {
    "nodes": [
        {"id": "p", "type": "planner", "position": {"x": 0, "y": 0}, "config": {}},
        {"id": "calc", "type": "execution", "position": {"x": 200, "y": 0}, "config": {"tool": "calculator", "tool_input": {"expression": "6*7"}}},
        {"id": "an", "type": "analysis", "position": {"x": 400, "y": 0}, "config": {}},
        {"id": "r", "type": "response", "position": {"x": 600, "y": 0}, "config": {}},
    ],
    "edges": [{"source": "p", "target": "calc"}, {"source": "calc", "target": "an"}, {"source": "an", "target": "r"}],
}


def issues(client, definition):
    r = client.post("/api/workflows/validate", json=definition)
    assert r.status_code == 200
    return r.json()


def codes(client, definition):
    return {i["code"] for i in issues(client, definition)["issues"]}


def test_valid_workflow_and_order(client):
    v = issues(client, GOOD)
    assert v["valid"] and v["order"] == ["p", "calc", "an", "r"]


def test_workflow_validation_rules(client):
    import copy

    cyc = copy.deepcopy(GOOD)
    cyc["edges"].append({"source": "r", "target": "p"})
    assert "cycle" in codes(client, cyc)

    nores = copy.deepcopy(GOOD)
    nores["nodes"][3]["type"] = "analysis"
    assert "sink_not_response" in codes(client, nores)

    bad_type = copy.deepcopy(GOOD)
    bad_type["nodes"][1]["type"] = "shell"
    assert "unknown_type" in codes(client, bad_type)

    bad_tool = copy.deepcopy(GOOD)
    bad_tool["nodes"][1]["config"] = {"tool": "web_search"}
    assert "tool_not_allowed" in codes(client, bad_tool)

    bad_input = copy.deepcopy(GOOD)
    bad_input["nodes"][1]["config"] = {"tool": "calculator", "tool_input": {"expression": ""}}
    assert "invalid_tool_input" in codes(client, bad_input)

    no_tool = copy.deepcopy(GOOD)
    no_tool["nodes"][1]["config"] = {}
    assert "missing_tool" in codes(client, no_tool)

    dangling = copy.deepcopy(GOOD)
    dangling["edges"].append({"source": "p", "target": "ghost"})
    assert "dangling_edge" in codes(client, dangling)

    two_entries = copy.deepcopy(GOOD)
    two_entries["nodes"].append({"id": "x", "type": "research", "config": {}})
    two_entries["edges"].append({"source": "x", "target": "an"})
    assert "entry_count" in codes(client, two_entries)

    assert "empty" in codes(client, {"nodes": [], "edges": []})
    junk = copy.deepcopy(GOOD)
    junk["nodes"][0]["config"] = {"shell": "rm -rf /"}
    assert "invalid_config" in codes(client, junk)
    assert client.post("/api/workflows/validate", json={"nodes": [{"id": "bad id!", "type": "planner"}], "edges": []}).status_code == 422


def test_workflow_crud_and_versions(client):
    r = client.post("/api/workflows", json={"name": "Calc flow", "description": "d", "definition": GOOD})
    assert r.status_code == 201
    wid = r.json()["id"]
    assert r.json()["version"] == 1
    assert client.get(f"/api/workflows/{wid}").json()["definition"]["nodes"][1]["config"]["tool"] == "calculator"
    upd = client.put(f"/api/workflows/{wid}", json={"name": "Renamed", "description": "", "definition": GOOD})
    assert upd.json()["name"] == "Renamed" and upd.json()["version"] == 2
    assert client.get("/api/workflows").json()["total"] == 1
    assert client.post("/api/workflows", json={"name": "bad", "definition": {"nodes": [], "edges": []}}).status_code == 422
    assert client.delete(f"/api/workflows/{wid}").status_code == 204
    assert client.get(f"/api/workflows/{wid}").status_code == 404
    assert client.delete(f"/api/workflows/{wid}").status_code == 404


def test_workflow_execution_runs_server_validated_graph(client):
    wid = client.post("/api/workflows", json={"name": "Calc flow", "definition": GOOD}).json()["id"]
    r = client.post(f"/api/workflows/{wid}/execute", json={"prompt": "run it"})
    assert r.status_code == 201 and r.json()["workflow_id"] == wid
    t = wait_for(client, r.json()["id"])
    assert t["status"] == "completed", t
    events = client.get(f"/api/tasks/{t['id']}/events").json()
    assert [e["node"] for e in events if e["type"] == "agent.started"] == ["p", "calc", "an", "r"]
    obs = t["result_data"]["observations"]
    assert obs[0]["tool"] == "calculator" and obs[0]["output"]["result"] == 42
    assert "42" in t["result"]
    assert t["workflow_snapshot"]["nodes"][1]["id"] == "calc"
    # editing the workflow later must not alter the stored snapshot
    client.put(f"/api/workflows/{wid}", json={"name": "x", "definition": {**GOOD, "nodes": [{**n, "config": {}} if n["id"] != "calc" else {**n, "config": {"tool": "datetime"}} for n in GOOD["nodes"]]}})
    assert client.get(f"/api/tasks/{t['id']}").json()["workflow_snapshot"]["nodes"][1]["config"]["tool"] == "calculator"


def test_execute_rejects_workflow_corrupted_in_db(client):
    from app.db.session import session_scope
    from app.models import Workflow

    with session_scope() as s:
        s.add(Workflow(id="corrupt", name="c", definition={"nodes": [{"id": "a", "type": "shell", "config": {}}], "edges": []}))
    r = client.post("/api/workflows/corrupt/execute", json={"prompt": "x"})
    assert r.status_code == 422 and r.json()["error"]["code"] == "invalid_workflow"
    assert client.post("/api/workflows/missing/execute", json={"prompt": "x"}).status_code == 404


def test_workflow_meta_and_starter_is_valid(client):
    meta = client.get("/api/workflows/meta").json()
    assert "response" in meta["node_types"] and "calculator" in meta["tools_by_type"]["execution"]
    assert issues(client, meta["starter"])["valid"]


def test_knowledge_crud(client):
    r = client.post("/api/knowledge", json={"title": " Onboarding ", "content": "Welcome to the team. Laptops are issued on day one.", "tags": ["hr", "HR", " ", "people"]})
    assert r.status_code == 201
    doc = r.json()
    assert doc["title"] == "Onboarding" and doc["tags"] == ["hr", "people"] and doc["agent_accessible"] is True
    assert client.get(f"/api/knowledge/{doc['id']}").json()["content"].startswith("Welcome")
    up = client.put(f"/api/knowledge/{doc['id']}", json={"title": "Onboarding v2", "content": "Updated content about laptops.", "tags": [], "agent_accessible": False})
    assert up.json()["title"] == "Onboarding v2" and up.json()["agent_accessible"] is False
    assert client.get("/api/knowledge").json()["total"] == 1
    assert client.delete(f"/api/knowledge/{doc['id']}").status_code == 204
    assert client.get(f"/api/knowledge/{doc['id']}").status_code == 404
    assert client.post("/api/knowledge", json={"title": "", "content": "x"}).status_code == 422
    assert client.put("/api/knowledge/nope", json={"title": "a", "content": "b"}).status_code == 404


def test_knowledge_search_ranking(client):
    client.post("/api/knowledge", json={"title": "Pricing", "content": "Our plans are priced monthly."})
    client.post("/api/knowledge", json={"title": "Misc", "content": "pricing is mentioned once here, among other notes."})
    client.post("/api/knowledge", json={"title": "Unrelated", "content": "Nothing to see."})
    res = client.get("/api/knowledge?q=pricing").json()
    assert [i["title"] for i in res["items"]] == ["Pricing", "Misc"] and res["items"][0]["score"] > res["items"][1]["score"]
    assert client.get("/api/knowledge?q=zzzzqq").json()["total"] == 0
    client.post("/api/knowledge", json={"title": "Tagged", "content": "x y", "tags": ["alpha"]})
    assert client.get("/api/knowledge?tag=alpha").json()["total"] == 1


def test_document_level_access_control_for_agents(client):
    client.post("/api/knowledge", json={"title": "Public handbook", "content": "The secret codeword is banana.", "agent_accessible": True})
    client.post("/api/knowledge", json={"title": "Private salaries", "content": "The secret salary table is confidential.", "agent_accessible": False})
    t = wait_for(client, client.post("/api/tasks", json={"prompt": "secret"}).json()["id"])
    titles = [h["title"] for o in t["result_data"]["observations"] if o["tool"] == "knowledge_search" for h in o["output"]["results"]]
    assert titles == ["Public handbook"]
    assert "salary" not in t["result"].lower()
    # the owner can still find it through the API
    assert client.get("/api/knowledge?q=salary").json()["total"] == 1
