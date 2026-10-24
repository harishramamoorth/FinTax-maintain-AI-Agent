from __future__ import annotations

from fastapi import Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import protected_router
from app.api.tasks import create_task_record
from app.core.config import Settings, get_settings
from app.core.errors import AppError, not_found
from app.core.security import rate_limited
from app.db.session import get_db
from app.models import Workflow, WorkflowVersion
from app.orchestration.workflow import NODE_TYPES, TOOLS_BY_TYPE, parse_and_validate
from app.schemas.common import Page, TaskOut
from app.schemas.workflow import ValidationResult, WorkflowDefinition, WorkflowExecuteIn, WorkflowIn, WorkflowOut
from app.services.tasks import task_to_dict
from app.tools.registry import registry

router = protected_router(tags=["workflows"])

STARTER = {
    "nodes": [
        {"id": "planner", "type": "planner", "position": {"x": 0, "y": 0}, "config": {}},
        {"id": "research", "type": "research", "position": {"x": 240, "y": 0}, "config": {"tool": "knowledge_search"}},
        {"id": "analysis", "type": "analysis", "position": {"x": 480, "y": 0}, "config": {}},
        {"id": "validation", "type": "validation", "position": {"x": 480, "y": 150}, "config": {}},
        {"id": "response", "type": "response", "position": {"x": 240, "y": 150}, "config": {}},
    ],
    "edges": [
        {"id": "e1", "source": "planner", "target": "research"},
        {"id": "e2", "source": "research", "target": "analysis"},
        {"id": "e3", "source": "analysis", "target": "validation"},
        {"id": "e4", "source": "validation", "target": "response"},
    ],
}


@router.get("/workflows/meta")
def workflow_meta():
    """Supported node types and the tools each may use (drives the builder UI)."""
    return {"node_types": sorted(NODE_TYPES), "tools_by_type": {k: sorted(v) for k, v in TOOLS_BY_TYPE.items()}, "starter": STARTER,
            "tool_schemas": {n: registry.get(n).InputModel.model_json_schema() for n in registry.names()}}  # type: ignore[union-attr]


@router.post("/workflows/validate", response_model=ValidationResult)
def validate_workflow(definition: WorkflowDefinition):
    return parse_and_validate(definition.model_dump(), registry)[1]


@router.get("/workflows", response_model=Page[WorkflowOut])
def list_workflows(page: int = Query(1, ge=1), page_size: int = Query(50, ge=1, le=100), db: Session = Depends(get_db)):
    total = db.execute(select(func.count(Workflow.id))).scalar() or 0
    rows = db.execute(select(Workflow).order_by(Workflow.updated_at.desc()).offset((page - 1) * page_size).limit(page_size)).scalars().all()
    return {"items": rows, "total": total, "page": page, "page_size": page_size}


def _checked(body: WorkflowIn) -> dict:
    defn, verdict = parse_and_validate(body.definition.model_dump(), registry)
    if defn is None or not verdict.valid:
        raise AppError(422, "invalid_workflow", "Workflow failed validation", [i.model_dump() for i in verdict.issues])
    return defn.model_dump()


@router.post("/workflows", response_model=WorkflowOut, status_code=201)
def create_workflow(body: WorkflowIn, db: Session = Depends(get_db)):
    wf = Workflow(name=body.name.strip(), description=body.description.strip(), definition=_checked(body), version=1)
    db.add(wf)
    db.flush()
    db.add(WorkflowVersion(workflow_id=wf.id, version=1, definition=wf.definition))
    db.commit()
    return wf


@router.get("/workflows/{workflow_id}", response_model=WorkflowOut)
def get_workflow(workflow_id: str, db: Session = Depends(get_db)):
    wf = db.get(Workflow, workflow_id)
    if wf is None:
        raise not_found("Workflow")
    return wf


@router.put("/workflows/{workflow_id}", response_model=WorkflowOut)
def update_workflow(workflow_id: str, body: WorkflowIn, db: Session = Depends(get_db)):
    wf = db.get(Workflow, workflow_id)
    if wf is None:
        raise not_found("Workflow")
    wf.name, wf.description = body.name.strip(), body.description.strip()
    wf.definition = _checked(body)
    wf.version += 1
    db.add(WorkflowVersion(workflow_id=wf.id, version=wf.version, definition=wf.definition))
    db.commit()
    return wf


@router.delete("/workflows/{workflow_id}", status_code=204)
def delete_workflow(workflow_id: str, db: Session = Depends(get_db)):
    wf = db.get(Workflow, workflow_id)
    if wf is None:
        raise not_found("Workflow")
    db.delete(wf)
    db.commit()


@router.post("/workflows/{workflow_id}/execute", response_model=TaskOut, status_code=201, dependencies=[Depends(rate_limited)])
def execute_workflow(workflow_id: str, body: WorkflowExecuteIn, db: Session = Depends(get_db), settings: Settings = Depends(get_settings)):
    wf = db.get(Workflow, workflow_id)
    if wf is None:
        raise not_found("Workflow")
    task = create_task_record(db, settings, body.prompt.strip(), workflow=wf, allow_web_search=body.allow_web_search)
    return task_to_dict(task)
