from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager
from pathlib import Path

from alembic import command
from alembic.config import Config as AlembicConfig
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from app.api import auth, fintax_accounts, fintax_documents, health, knowledge, system, tasks, workflows
from app.core.config import ROOT_DIR, get_settings
from app.core.errors import install_error_handlers
from app.core.logging import setup_logging
from app.core.middleware import BodySizeLimitMiddleware, OriginCheckMiddleware, RequestIdMiddleware
from app.db.session import init_engine, session_scope
from app.events.service import bus
from app.orchestration.manager import manager, recover_interrupted
from app.services.fintax_demo import seed_demo_accounts

log = logging.getLogger("nexus")
BACKEND_DIR = Path(__file__).resolve().parents[1]


def run_migrations(url: str) -> None:
    cfg = AlembicConfig(str(BACKEND_DIR / "alembic.ini"))
    cfg.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    cfg.set_main_option("sqlalchemy.url", url.replace("%", "%%"))
    command.upgrade(cfg, "head")


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    setup_logging()
    init_engine()
    if settings.auto_migrate:
        await asyncio.to_thread(run_migrations, settings.database_url)
    legacy_services_started = settings.app_env != "production"
    if settings.app_env == "development" and settings.is_sqlite:
        with session_scope() as db:
            seed_demo_accounts(db)
    if legacy_services_started:
        with session_scope() as s:
            system.seed_agent_configs(s)
        recovered = recover_interrupted()
        if recovered:
            log.warning("Marked %d interrupted task(s) as failed", recovered)
        loop = asyncio.get_running_loop()
        bus.bind_loop(loop)
        manager.start(loop)
    log.info("FinTax Portal started, database=%s", "sqlite" if settings.is_sqlite else "postgresql")
    try:
        yield
    finally:
        if legacy_services_started:
            await manager.shutdown()


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="FinTax Portal API", version=health.VERSION, lifespan=lifespan,
        description="FinTax accounts, client access, private document intake, and audit events.",
        docs_url="/api/docs", redoc_url="/api/redoc", openapi_url="/api/openapi.json",
    )
    install_error_handlers(app)
    # Order: last added runs first (outermost).
    app.add_middleware(
        BodySizeLimitMiddleware,
        max_bytes=settings.max_request_bytes,
        upload_max_bytes=settings.max_document_upload_bytes + 1_048_576,
    )
    app.add_middleware(OriginCheckMiddleware, allowed_origins=settings.cors_origin_list)
    app.add_middleware(
        CORSMiddleware, allow_origins=settings.cors_origin_list, allow_credentials=False,
        allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"], allow_headers=["Authorization", "Content-Type", "Last-Event-ID"],
        expose_headers=["X-Request-ID", "Retry-After"],
    )
    app.add_middleware(RequestIdMiddleware)

    app.include_router(health.router, prefix="/api")
    app.include_router(auth.router, prefix="/api")
    app.include_router(fintax_accounts.router, prefix="/api")
    app.include_router(fintax_documents.router, prefix="/api")
    if settings.app_env != "production":
        for r in (tasks.router, workflows.router, knowledge.router, system.router):
            app.include_router(r, prefix="/api")

    @app.api_route("/api/{rest:path}", methods=["GET", "POST", "PUT", "DELETE"], include_in_schema=False)
    async def api_not_found(rest: str, request: Request):
        return JSONResponse({"error": {"code": "not_found", "message": f"No such endpoint: /api/{rest}", "details": None}, "request_id": getattr(request.state, "request_id", None)}, status_code=404)

    dist = settings.dist_path
    if (dist / "index.html").is_file():
        if (dist / "assets").is_dir():
            app.mount("/assets", StaticFiles(directory=dist / "assets"), name="assets")
        index = dist / "index.html"
        root = dist.resolve()

        @app.get("/{full_path:path}", include_in_schema=False)
        async def spa(full_path: str):
            candidate = (dist / full_path).resolve()
            if full_path and candidate.is_file() and root in candidate.parents:
                return FileResponse(candidate)
            return FileResponse(index, headers={"Cache-Control": "no-cache"})
    else:
        @app.get("/", include_in_schema=False)
        async def root_info():
            return {"name": "FinTax Portal API", "docs": "/api/docs", "frontend": "not built - run `npm run build` or use the Vite dev server on :5173"}

    return app


app = create_app()
