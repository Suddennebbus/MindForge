from pathlib import Path
from app.config import settings

DATA_DIR = Path(settings.data_dir)
PLAN_DIR = DATA_DIR / "plan"


def ensure_dirs():
    PLAN_DIR.mkdir(parents=True, exist_ok=True)


def _slugify(title: str) -> str:
    import re
    slug = re.sub(r"[^\w一-鿿-]+", "-", title)
    slug = re.sub(r"-+", "-", slug).strip("-")
    return slug.lower() or "plan"


def unique_slug(db, title: str, exclude_id: str | None = None) -> str:
    """Generate a unique slug for a plan title."""
    from app.plans import models
    base = _slugify(title) or "plan"
    slug = base
    counter = 1
    while True:
        q = db.query(models.Plan).filter(models.Plan.slug == slug)
        if exclude_id:
            q = q.filter(models.Plan.id != exclude_id)
        if not q.first():
            break
        slug = f"{base}-{counter}"
        counter += 1
    return slug


def write_plan(slug: str, content: str) -> str:
    ensure_dirs()
    file_path = PLAN_DIR / f"{slug}.md"
    file_path.write_text(content, encoding="utf-8")
    return str(file_path)


def read_plan(file_path: str) -> str:
    return Path(file_path).read_text(encoding="utf-8")


def delete_plan(file_path: str):
    Path(file_path).unlink(missing_ok=True)


def build_plan_markdown(plan) -> str:
    """Build markdown content from a Plan model instance."""
    lines = [
        "---",
        f'title: "{plan.title}"',
        f"slug: {plan.slug}",
        f'status: {plan.status}',
        f'topic: "{plan.topic or ""}"',
        f'direction: "{plan.direction or ""}"',
    ]

    def _list_field(name: str, values: list):
        if values:
            lines.append(f"{name}:")
            for v in values:
                lines.append(f"  - {v}")
        else:
            lines.append(f"{name}: []")

    _list_field("goals", plan.goals or [])
    _list_field("knowledge_gaps", plan.knowledge_gaps or [])
    _list_field("research_questions", plan.research_questions or [])
    _list_field("related_slugs", plan.related_slugs or [])

    if plan.suggested_readings:
        lines.append("suggested_readings:")
        for item in plan.suggested_readings:
            if isinstance(item, dict):
                title = item.get("title", "")
                url = item.get("url", "")
                status = item.get("status", "pending")
                lines.append(f"  - title: {title}")
                lines.append(f"    url: {url}")
                lines.append(f"    status: {status}")
                if item.get("authors"):
                    lines.append(f"    authors: {item['authors']}")
                if item.get("source"):
                    lines.append(f"    source: {item['source']}")
                if item.get("reason"):
                    lines.append(f"    reason: {item['reason']}")
            else:
                lines.append(f"  - {item}")
    else:
        lines.append("suggested_readings: []")

    lines.append("---")
    lines.append("")
    lines.append(f"# {plan.title}")
    lines.append("")
    if plan.description:
        lines.append(plan.description)
        lines.append("")
    if plan.methodology:
        lines.append("## 研究方法")
        lines.append(plan.methodology)
        lines.append("")
    if plan.milestones:
        lines.append("## 里程碑")
        for m in plan.milestones:
            lines.append(f"- {m}")
        lines.append("")
    if plan.key_challenges:
        lines.append("## 关键挑战")
        for c in plan.key_challenges:
            lines.append(f"- {c}")
        lines.append("")
    if plan.expected_contributions:
        lines.append("## 预期贡献")
        for c in plan.expected_contributions:
            lines.append(f"- {c}")
        lines.append("")

    return "\n".join(lines)
