import os
import tempfile
from pathlib import Path

# Configure the environment BEFORE the app is imported.
_TMP = tempfile.mkdtemp(prefix="nexus-tests-")
os.environ.update({
    "APP_ENV": "test", "DATABASE_URL": f"sqlite:///{_TMP}/test.db", "AUTO_MIGRATE": "true",
    "DEMO_MODE": "true", "DEMO_STEP_DELAY": "0", "AI_API_KEY": "", "SEARCH_API_KEY": "", "ACCESS_TOKEN": "",
    "RATE_LIMIT_PER_MINUTE": "1000", "FRONTEND_DIST": str(Path(_TMP) / "nodist"),
})

import time  # noqa: E402

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.core.config import get_settings  # noqa: E402
from app.core.security import limiter  # noqa: E402


@pytest.fixture
def make_client(monkeypatch):
    """Factory: build a fresh app (fresh DB) with the given env overrides."""
    clients = []

    def _make(**env):
        db = Path(tempfile.mkdtemp(dir=_TMP)) / "t.db"
        monkeypatch.setenv("DATABASE_URL", f"sqlite:///{db}")
        for k, v in env.items():
            monkeypatch.setenv(k.upper(), str(v))
        get_settings.cache_clear()
        limiter.reset()
        from app.main import create_app

        c = TestClient(create_app())
        c.__enter__()
        clients.append(c)
        return c

    yield _make
    for c in clients:
        c.__exit__(None, None, None)
    get_settings.cache_clear()


@pytest.fixture
def client(make_client):
    return make_client()


def wait_for(client, task_id, statuses=("completed", "failed", "cancelled"), timeout=15):
    end = time.time() + timeout
    while time.time() < end:
        t = client.get(f"/api/tasks/{task_id}").json()
        if t["status"] in statuses:
            return t
        time.sleep(0.05)
    raise AssertionError(f"task {task_id} did not finish: {t}")
