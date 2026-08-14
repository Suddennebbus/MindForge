import json
from sqlalchemy.orm import Session
from app.ai.models import AICallLog


def log_ai_call(
    db: Session,
    user_id: str,
    operation_type: str,
    llm_config_id: str | None = None,
    input_tokens: int = 0,
    output_tokens: int = 0,
    cost_usd: float = 0.0,
    duration_ms: int = 0,
    status: str = "success",
    error_message: str | None = None,
    metadata: dict | None = None,
) -> AICallLog:
    log = AICallLog(
        user_id=user_id,
        operation_type=operation_type,
        llm_config_id=llm_config_id,
        input_tokens=str(input_tokens),
        output_tokens=str(output_tokens),
        cost_usd=str(cost_usd),
        duration_ms=str(duration_ms),
        status=status,
        error_message=error_message,
        metadata_json=json.dumps(metadata or {}, ensure_ascii=False),
    )
    db.add(log)
    db.commit()
    return log
