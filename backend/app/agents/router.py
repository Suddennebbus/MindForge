from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from typing import Optional

from app.database import get_db
from app.auth.dependencies import get_current_user, require_role
from app.auth.models import User
from app.agents import orchestrator
from app.ai.lang import get_ui_lang
from app.agents.schemas import AgentRunCreate, AgentRunOut, AgentRunStepOut, AgentRunAction
from app.agents.models import AgentRun


router = APIRouter(prefix="/ai", tags=["agent-runs"])


def _run_to_out(run: AgentRun) -> AgentRunOut:
    return AgentRunOut(
        id=run.id,
        workflow=run.workflow,
        status=run.status,
        user_id=run.user_id,
        config_id=run.config_id,
        direction=run.direction,
        payload_json=run.payload_json or "{}",
        plan_id=run.plan_id,
        current_step_id=run.current_step_id,
        error_message=run.error_message,
        created_at=run.created_at,
        updated_at=run.updated_at,
        steps=[
            AgentRunStepOut(
                id=s.id,
                sequence=s.sequence,
                name=s.name,
                status=s.status,
                input_json=s.input_json,
                output_json=s.output_json,
                error_message=s.error_message,
                started_at=s.started_at,
                completed_at=s.completed_at,
            )
            for s in run.steps
        ],
    )


@router.post("/runs")
async def create_run(
    data: AgentRunCreate,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(require_role("admin", "editor"))
):
    try:
        run = await orchestrator.create_run(db, user, data, lang=get_ui_lang(request))
        return {"run_id": run.id, "status": run.status}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/runs")
def list_runs(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    runs = orchestrator.list_runs(db, user)
    return [_run_to_out(r) for r in runs]


@router.get("/runs/{run_id}")
def get_run(
    run_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    run = orchestrator.get_run(db, run_id, user)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    return _run_to_out(run)


@router.get("/runs/{run_id}/steps")
def get_run_steps(
    run_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    run = orchestrator.get_run(db, run_id, user)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    return [
        AgentRunStepOut(
            id=s.id,
            sequence=s.sequence,
            name=s.name,
            status=s.status,
            input_json=s.input_json,
            output_json=s.output_json,
            error_message=s.error_message,
            started_at=s.started_at,
            completed_at=s.completed_at,
        )
        for s in run.steps
    ]


@router.post("/runs/{run_id}/pause")
async def pause_run(
    run_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(require_role("admin", "editor"))
):
    run = await orchestrator.pause_run(db, run_id, user)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    return _run_to_out(run)


@router.post("/runs/{run_id}/resume")
async def resume_run(
    run_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(require_role("admin", "editor"))
):
    run = await orchestrator.resume_run(db, run_id, user)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    return _run_to_out(run)


@router.post("/runs/{run_id}/retry")
async def retry_run(
    run_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(require_role("admin", "editor"))
):
    run = await orchestrator.retry_run(db, run_id, user)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    return _run_to_out(run)


@router.post("/runs/{run_id}/cancel")
async def cancel_run(
    run_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(require_role("admin", "editor"))
):
    run = await orchestrator.cancel_run(db, run_id, user)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    return _run_to_out(run)


@router.get("/runs/{run_id}/events")
async def run_events(
    run_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    """SSE endpoint for real-time run updates (placeholder; returns current state)."""
    run = orchestrator.get_run(db, run_id, user)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    from fastapi.responses import StreamingResponse

    async def event_stream():
        import asyncio
        for _ in range(60):
            db.refresh(run)
            for step in run.steps:
                db.refresh(step)
            yield f"data: {_run_to_out(run).model_dump_json()}\n\n"
            await asyncio.sleep(2)
        yield "data: [DONE]\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")
