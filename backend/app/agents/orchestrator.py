import json
from datetime import datetime
from app.utils_time import beijing_now
from sqlalchemy.orm import Session
from app.auth.models import User
from app.agents import registry
from app.agents.models import AgentRun, AgentRunStep
from app.agents.schemas import AgentRunCreate
from app.agents.executor import start_run, request_pause, request_resume, request_retry, request_cancel
from app.agents.state_machine import can_transition
from app.ai.models import LLMConfig


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


def _get_default_config(db: Session, user: User) -> LLMConfig:
    config = db.query(LLMConfig).filter(
        LLMConfig.user_id == user.id,
        LLMConfig.is_default == True,
    ).first()
    if not config:
        raise ValueError("No default LLM config")
    return config


async def _create_and_start_run(
    db: Session,
    user: User,
    plan_id: str,
    payload_dict: dict,
) -> AgentRun:
    """Create an AgentRun for an existing plan and start it."""
    config = _get_default_config(db, user)

    run = AgentRun(
        workflow="plan_creation",
        status="pending",
        user_id=user.id,
        config_id=config.id,
        direction=payload_dict.get("direction", ""),
        plan_id=plan_id,
        payload_json=json.dumps(payload_dict, ensure_ascii=False),
    )
    db.add(run)
    db.commit()
    db.refresh(run)

    workflow = registry.get_workflow("plan_creation")
    if workflow:
        for i, step in enumerate(workflow.steps):
            step_row = AgentRunStep(
                run_id=run.id,
                sequence=i,
                name=step.name,
                status="pending",
            )
            db.add(step_row)
        db.commit()
        db.refresh(run)

    await start_run(run.id)
    return run


from app.plans import storage as plans_storage


async def create_run(db: Session, user: User, payload: AgentRunCreate) -> AgentRun:
    workflow = registry.get_workflow("plan_creation")
    if not workflow:
        raise ValueError("Workflow 'plan_creation' not registered")

    from app.plans import models as plans_models

    payload_dict = {
        "direction": payload.direction,
        "answers": payload.answers,
        "exploration_result": payload.exploration_result,
        "recommendation": payload.recommendation,
    }

    title = payload.direction or "未命名研究计划"
    slug = plans_storage.unique_slug(db, title)
    plan = plans_models.Plan(
        slug=slug,
        title=title,
        description="",
        topic="",
        direction=payload.direction,
        status="pending_generation",
        goals=[],
        related_slugs=[],
        created_by=user.id,
        updated_by=user.id,
        generation_payload_json=json.dumps(payload_dict, ensure_ascii=False),
    )
    db.add(plan)
    db.commit()
    db.refresh(plan)
    plan.file_path = plans_storage.write_plan(plan.slug, plans_storage.build_plan_markdown(plan))
    db.commit()
    db.refresh(plan)

    return await _create_and_start_run(db, user, plan.id, payload_dict)


async def create_run_for_plan(db: Session, user: User, plan) -> AgentRun:
    """Continue generation for an existing pending_generation plan."""
    import json
    payload_dict = json.loads(plan.generation_payload_json or "{}")
    if not payload_dict:
        raise ValueError("Plan has no generation payload")

    plan.status = "pending_generation"
    plan.updated_at = beijing_now()
    plan.updated_by = user.id
    db.add(plan)
    db.commit()
    db.refresh(plan)

    return await _create_and_start_run(db, user, plan.id, payload_dict)


async def pause_run(db: Session, run_id: str, user: User) -> AgentRun | None:
    run = db.query(AgentRun).filter(
        AgentRun.id == run_id,
        AgentRun.user_id == user.id,
    ).first()
    if not run:
        return None
    if not can_transition(run.status, "pausing"):
        return run
    run.status = "pausing"
    run.updated_at = beijing_now()
    db.add(run)
    db.commit()
    db.refresh(run)
    _set_plan_status(db, run, "pending_generation")
    await request_pause(run_id)
    return run


async def resume_run(db: Session, run_id: str, user: User) -> AgentRun | None:
    run = db.query(AgentRun).filter(
        AgentRun.id == run_id,
        AgentRun.user_id == user.id,
    ).first()
    if not run:
        return None
    if not can_transition(run.status, "running"):
        return run
    run.status = "running"
    run.updated_at = beijing_now()
    db.add(run)
    db.commit()
    db.refresh(run)
    await request_resume(run_id)
    return run


async def retry_run(db: Session, run_id: str, user: User) -> AgentRun | None:
    run = db.query(AgentRun).filter(
        AgentRun.id == run_id,
        AgentRun.user_id == user.id,
    ).first()
    if not run:
        return None
    if not can_transition(run.status, "running"):
        return run
    run.status = "running"
    run.error_message = None
    run.updated_at = beijing_now()
    db.add(run)
    db.commit()
    db.refresh(run)
    await request_retry(run_id)
    return run


async def cancel_run(db: Session, run_id: str, user: User) -> AgentRun | None:
    run = db.query(AgentRun).filter(
        AgentRun.id == run_id,
        AgentRun.user_id == user.id,
    ).first()
    if not run:
        return None
    if run.status in {"completed", "cancelled"}:
        return run
    run.status = "cancelled"
    run.updated_at = beijing_now()
    db.add(run)
    db.commit()
    db.refresh(run)
    if run.status != "completed":
        _set_plan_status(db, run, "pending_generation")
    await request_cancel(run_id)
    return run


def get_run(db: Session, run_id: str, user: User) -> AgentRun | None:
    run = db.query(AgentRun).filter(
        AgentRun.id == run_id,
        AgentRun.user_id == user.id,
    ).first()
    return run


def list_runs(db: Session, user: User) -> list[AgentRun]:
    return db.query(AgentRun).filter(
        AgentRun.user_id == user.id,
    ).order_by(AgentRun.created_at.desc()).all()
