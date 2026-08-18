import asyncio
import json
from datetime import datetime
from app.utils_time import beijing_now
from typing import Any
from sqlalchemy.orm import Session

from app.agents import registry
from app.agents.models import AgentRun, AgentRunStep
from app.agents.state_machine import can_transition, is_terminal_status
from app.database import SessionLocal
from app.wiki import models as wiki_models


_active_tasks: dict[str, asyncio.Task] = {}
_pause_events: dict[str, asyncio.Event] = {}
_cancel_events: dict[str, asyncio.Event] = {}


class PauseRequested(Exception):
    """Raised when the user requests to pause the run."""


class CancelRequested(Exception):
    """Raised when the user requests to cancel the run."""


def check_control_signals(run_id: str):
    """Raise PauseRequested or CancelRequested if the user requested control action."""
    cancel_event = _cancel_events.get(run_id)
    if cancel_event and cancel_event.is_set():
        raise CancelRequested()
    pause_event = _pause_events.get(run_id)
    if pause_event and pause_event.is_set():
        raise PauseRequested()


async def _run_in_db(fn):
    """Run a synchronous DB function in a thread to avoid blocking the event loop."""
    return await asyncio.to_thread(fn)


def _get_run_with_steps(db: Session, run_id: str) -> AgentRun | None:
    return db.query(AgentRun).filter(AgentRun.id == run_id).first()


def _update_run_status(db: Session, run: AgentRun, status: str, error_message: str | None = None):
    if not can_transition(run.status, status):
        return False
    run.status = status
    if error_message is not None:
        run.error_message = error_message
    run.updated_at = beijing_now()
    db.commit()
    return True


def _start_step(db: Session, step: AgentRunStep):
    step.status = "running"
    step.started_at = beijing_now()
    db.add(step)
    db.commit()


def _complete_step(db: Session, step: AgentRunStep, output: dict):
    step.status = "completed"
    step.output_json = json.dumps(output, ensure_ascii=False)
    step.completed_at = beijing_now()
    db.add(step)
    db.commit()


def _fail_step(db: Session, step: AgentRunStep, run: AgentRun, error: str):
    step.status = "failed"
    step.error_message = error
    step.completed_at = beijing_now()
    run.status = "failed"
    run.error_message = error
    run.updated_at = beijing_now()
    db.add(step)
    db.add(run)
    db.commit()


def _set_plan_status(db: Session, run: AgentRun, status: str):
    if not run.plan_id:
        return
    from app.plans import models as plans_models
    plan = db.query(plans_models.Plan).filter(plans_models.Plan.id == run.plan_id).first()
    if plan:
        plan.status = status
        plan.updated_at = beijing_now()
        db.add(plan)
        db.commit()


def _build_context(run: AgentRun, db: Session, user_id: str) -> dict:
    payload = json.loads(run.payload_json or "{}")

    pages = db.query(wiki_models.WikiPage).all()
    wiki_content = "\n\n".join([
        f"[[{p.slug}]]\n{p.summary}\nTags: {', '.join(p.tags or [])}"
        for p in pages
    ])

    ctx = {
        "direction": run.direction or payload.get("direction", ""),
        "answers": payload.get("answers", {}),
        "exploration_result": payload.get("exploration_result"),
        "recommendation": payload.get("recommendation"),
        "lang": payload.get("lang", "zh"),
        "wiki_content": wiki_content,
        "_db": db,
        "_user_id": user_id,
        "_run_id": run.id,
        "_plan_id": run.plan_id,
    }
    return ctx


async def _check_signals(run_id: str) -> str | None:
    """Return 'cancel' or 'pause' if requested, else None."""
    cancel_event = _cancel_events.get(run_id)
    if cancel_event and cancel_event.is_set():
        return "cancel"
    pause_event = _pause_events.get(run_id)
    if pause_event and pause_event.is_set():
        return "pause"
    return None


async def execute_run(run_id: str):
    """Execute an agent run step by step."""
    db = SessionLocal()
    try:
        run = _get_run_with_steps(db, run_id)
        if not run:
            return

        if run.status != "running":
            if not can_transition(run.status, "running"):
                return
            _update_run_status(db, run, "running")

        workflow = registry.get_workflow(run.workflow)
        if not workflow:
            _update_run_status(db, run, "failed", f"Unknown workflow: {run.workflow}")
            _set_plan_status(db, run, "pending_generation")
            return

        ctx = _build_context(run, db, run.user_id)

        steps = {s.name: s for s in run.steps}

        for wf_step in workflow.steps:
            signal = await _check_signals(run_id)
            if signal == "cancel":
                _update_run_status(db, run, "cancelled")
                _set_plan_status(db, run, "pending_generation")
                return
            if signal == "pause":
                _update_run_status(db, run, "paused")
                _set_plan_status(db, run, "pending_generation")
                return

            step = steps.get(wf_step.name)
            if not step:
                # Should not happen if orchestrator pre-created steps
                continue

            if step.status == "completed":
                # Resume: skip already completed steps, but load their outputs
                if step.output_json:
                    try:
                        output = json.loads(step.output_json)
                        if isinstance(output, dict):
                            ctx.update(output)
                    except json.JSONDecodeError:
                        pass
                continue

            _start_step(db, step)
            run.current_step_id = step.id
            db.add(run)
            db.commit()

            try:
                from app.ai import models as ai_models
                config = db.query(ai_models.LLMConfig).filter(
                    ai_models.LLMConfig.id == run.config_id
                ).first() if run.config_id else None
                if not config:
                    # Fall back to user's default config
                    config = db.query(ai_models.LLMConfig).filter(
                        ai_models.LLMConfig.user_id == run.user_id,
                        ai_models.LLMConfig.is_default == True,
                    ).first()

                output = await wf_step.func(ctx, config)
                if output and isinstance(output, dict):
                    ctx.update(output)

                _complete_step(db, step, output or {})

                if wf_step.name == "save_plan" and "plan_id" in ctx:
                    run.plan_id = ctx["plan_id"]
                    db.add(run)
                    db.commit()

            except asyncio.CancelledError:
                _update_run_status(db, run, "cancelled")
                _set_plan_status(db, run, "pending_generation")
                raise
            except CancelRequested:
                _update_run_status(db, run, "cancelled")
                _set_plan_status(db, run, "pending_generation")
                return
            except PauseRequested:
                step.status = "paused"
                step.completed_at = beijing_now()
                db.add(step)
                _update_run_status(db, run, "paused")
                _set_plan_status(db, run, "pending_generation")
                return
            except Exception as exc:
                _fail_step(db, step, run, str(exc))
                _set_plan_status(db, run, "pending_generation")
                return

        _update_run_status(db, run, "completed")
        _set_plan_status(db, run, "draft")
    finally:
        db.close()
        _active_tasks.pop(run_id, None)
        _pause_events.pop(run_id, None)
        _cancel_events.pop(run_id, None)


async def start_run(run_id: str):
    """Start execution of a run as a background task."""
    if run_id in _active_tasks:
        return
    _pause_events.pop(run_id, None)
    _cancel_events.pop(run_id, None)
    task = asyncio.create_task(execute_run(run_id))
    _active_tasks[run_id] = task


async def request_pause(run_id: str):
    """Request a running run to pause after the current step."""
    if run_id not in _active_tasks:
        return False
    event = _pause_events.setdefault(run_id, asyncio.Event())
    event.set()
    return True


async def request_resume(run_id: str):
    """Resume a paused or failed run."""
    _pause_events.pop(run_id, None)
    _cancel_events.pop(run_id, None)
    await start_run(run_id)
    return True


async def request_retry(run_id: str):
    """Retry a failed run. Same as resume."""
    return await request_resume(run_id)


async def request_cancel(run_id: str):
    """Request cancellation of a run."""
    event = _cancel_events.setdefault(run_id, asyncio.Event())
    event.set()
    task = _active_tasks.get(run_id)
    if task:
        task.cancel()
    return True


def recover_interrupted_runs():
    """On startup, mark any stale 'running' or 'pausing' runs as interrupted."""
    db = SessionLocal()
    try:
        stale = db.query(AgentRun).filter(
            AgentRun.status.in_(["running", "pausing"])
        ).all()
        for run in stale:
            run.status = "interrupted"
            run.updated_at = beijing_now()
            db.add(run)
        db.commit()
    finally:
        db.close()
