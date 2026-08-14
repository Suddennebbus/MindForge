import re
import uuid
from datetime import datetime
from app.utils_time import beijing_now
from pathlib import Path

from sqlalchemy.orm import Session

from app.ai import ingest_service
from app.wiki import models as wiki_models, storage as wiki_storage


def load_pages_with_content(db: Session) -> list[dict]:
    """Load all wiki pages with their file content."""
    pages = []
    for page in db.query(wiki_models.WikiPage).all():
        try:
            content = wiki_storage.read_page(page.file_path)
        except Exception:
            content = ""
        pages.append({
            "slug": page.slug,
            "type": page.type,
            "tags": page.tags or [],
            "content": content,
            "linked_slugs": ingest_service._extract_links(content),
        })
    return pages


def compute_orphan_pages(pages: list[dict]) -> list[str]:
    """Pages that are not linked from any other page."""
    all_slugs = {p["slug"] for p in pages}
    incoming = {slug: 0 for slug in all_slugs}
    for p in pages:
        for link in p.get("linked_slugs") or []:
            if link in incoming:
                incoming[link] += 1
    return sorted([slug for slug, count in incoming.items() if count == 0])


def compute_missing_backlinks(pages: list[dict]) -> list[dict]:
    """Pairs where p links to q but q does not link back to p."""
    all_slugs = {p["slug"] for p in pages}
    links_by_slug = {p["slug"]: set(p.get("linked_slugs") or []) for p in pages}
    missing = []
    for p in pages:
        for target in links_by_slug.get(p["slug"], set()):
            if target not in all_slugs or target == p["slug"]:
                continue
            if p["slug"] not in links_by_slug.get(target, set()):
                missing.append({"from": p["slug"], "to": target, "severity": "medium"})
    # De-duplicate while preserving order
    seen = set()
    deduped = []
    for item in missing:
        key = (item["from"], item["to"])
        if key not in seen:
            seen.add(key)
            deduped.append(item)
    return deduped


def compute_missing_concepts(pages: list[dict], threshold: int = 3) -> list[dict]:
    """Targets linked from 3+ entity pages that do not have their own page."""
    all_slugs = {p["slug"] for p in pages}
    ref_counts: dict[str, list[str]] = {}
    for p in pages:
        if p.get("type") != "entity":
            continue
        for link in set(p.get("linked_slugs") or []):
            if link in all_slugs:
                continue
            ref_counts.setdefault(link, []).append(p["slug"])
    return [
        {"name": name, "referenced_by": sorted(slugs)}
        for name, slugs in sorted(ref_counts.items())
        if len(slugs) >= threshold
    ]


def compute_annotation_markers(pages: list[dict]) -> dict[str, list[dict]]:
    """Scan content for [!conflict] and [!reinforce] markers."""
    conflict_re = re.compile(r"\[!conflict\]")
    reinforce_re = re.compile(r"\[!reinforce\]")
    conflicts = []
    reinforces = []
    for p in pages:
        content = p.get("content") or ""
        if conflict_re.search(content):
            conflicts.append({
                "slug": p["slug"],
                "context": _short_context(content, "[!conflict]"),
                # 人工标注的矛盾属于 Warning 级别（需人工核对处理）
                "severity": "medium",
            })
        if reinforce_re.search(content):
            reinforces.append({
                "slug": p["slug"],
                "context": _short_context(content, "[!reinforce]"),
                "severity": "low",
            })
    return {"conflict_annotations": conflicts, "reinforce_annotations": reinforces}


def _short_context(content: str, marker: str, radius: int = 80) -> str:
    idx = content.find(marker)
    if idx == -1:
        return ""
    start = max(0, idx - radius)
    end = min(len(content), idx + len(marker) + radius)
    ctx = content[start:end].replace("\n", " ")
    prefix = "..." if start > 0 else ""
    suffix = "..." if end < len(content) else ""
    return prefix + ctx + suffix


def _extract_slugs_from_index(text: str) -> set[str]:
    return set(re.findall(r"\[\[([^\]]+)\]\]", text))


def compute_index_consistency(db: Session, pages: list[dict]) -> dict:
    """Compare _wiki_index.md entries against actual wiki pages."""
    index_path = Path(wiki_storage.WIKI_DIR) / "_wiki_index.md"
    db_slugs = {p["slug"] for p in pages}
    if not index_path.exists():
        return {"consistent": False, "missing_from_index": sorted(db_slugs), "extra_in_index": []}
    index_text = index_path.read_text(encoding="utf-8")
    index_slugs = _extract_slugs_from_index(index_text)
    missing = sorted(db_slugs - index_slugs)
    extra = sorted(index_slugs - db_slugs)
    return {
        "consistent": not missing and not extra,
        "missing_from_index": missing,
        "extra_in_index": extra,
    }


def _extract_tags_from_registry(text: str) -> set[str]:
    # Registry rows look like: | `#tag` | meaning | count |
    return set(re.findall(r"`#([^`]+)`", text))


def compute_tag_consistency(db: Session, pages: list[dict]) -> dict:
    """Compare _tag_registry.md tags against tags actually used on pages."""
    registry_path = Path(wiki_storage.WIKI_DIR) / "_tag_registry.md"
    used_tags: set[str] = set()
    for p in pages:
        for tag in p.get("tags") or []:
            used_tags.add(tag)
    if not registry_path.exists():
        return {
            "consistent": False,
            "missing_from_registry": sorted(used_tags),
            "extra_in_registry": [],
        }
    registry_text = registry_path.read_text(encoding="utf-8")
    registry_tags = _extract_tags_from_registry(registry_text)
    return {
        "consistent": used_tags == registry_tags,
        "missing_from_registry": sorted(used_tags - registry_tags),
        "extra_in_registry": sorted(registry_tags - used_tags),
    }


def run_deterministic_checks(db: Session, pages: list[dict]) -> dict:
    annotations = compute_annotation_markers(pages)
    return {
        "orphan_pages": compute_orphan_pages(pages),
        "missing_backlinks": compute_missing_backlinks(pages),
        "missing_concepts": compute_missing_concepts(pages),
        "conflict_annotations": annotations["conflict_annotations"],
        "reinforce_annotations": annotations["reinforce_annotations"],
        "index_consistency": compute_index_consistency(db, pages),
        "tag_consistency": compute_tag_consistency(db, pages),
    }


def _count_by_severity(items: list[dict]) -> dict:
    counts = {"critical": 0, "warning": 0, "info": 0}
    for item in items:
        sev = item.get("severity", "warning")
        if sev == "high":
            counts["critical"] += 1
        elif sev == "medium":
            counts["warning"] += 1
        else:
            counts["info"] += 1
    return counts


def compute_summary(result: dict) -> dict:
    summary = {"critical": 0, "warning": 0, "info": 0, "pass": 0}
    severity_fields = ["conflicts", "outdated_content", "missing_backlinks", "info_gaps"]
    for field in severity_fields:
        for item in result.get(field) or []:
            sev = item.get("severity", "warning")
            if sev == "high":
                summary["critical"] += 1
            elif sev == "medium":
                summary["warning"] += 1
            else:
                summary["info"] += 1
    # structural issues without explicit severity
    # 孤立页面归为 Info（发现性问题，不影响正确性）
    if result.get("orphan_pages"):
        summary["info"] += len(result["orphan_pages"])
    if result.get("missing_concepts"):
        summary["warning"] += len(result["missing_concepts"])
    idx = result.get("index_consistency") or {}
    if not idx.get("consistent", True):
        summary["warning"] += 1
    tag = result.get("tag_consistency") or {}
    if not tag.get("consistent", True):
        summary["warning"] += 1
    # [!conflict] 标注归 Warning（需人工核对的矛盾），[!reinforce] 标注归 Info
    summary["warning"] += len(result.get("conflict_annotations") or [])
    summary["info"] += len(result.get("reinforce_annotations") or [])
    if summary["critical"] == summary["warning"] == summary["info"] == 0:
        summary["pass"] = 1
    return summary


def _markdown_section(title: str, body: str) -> str:
    return f"## {title}\n\n{body}\n\n"


def build_lint_report(result: dict, username: str = "unknown") -> str:
    """Render the lint result as markdown."""
    generated_at = result.get("generated_at") or beijing_now().isoformat()
    summary = result.get("summary") or {}
    lines = [
        "# Wiki 体检报告",
        "",
        f"生成时间：{generated_at}",
        f"操作人：{username}",
        "",
        "## 摘要",
        "",
        f"- Critical：{summary.get('critical', 0)}",
        f"- Warning：{summary.get('warning', 0)}",
        f"- Info：{summary.get('info', 0)}",
        f"- Pass：{summary.get('pass', 0)}",
        "",
    ]

    def render_list(title: str, key: str, empty: str = "未发现异常。"):
        items = result.get(key) or []
        if not items:
            lines.append(f"## {title}\n\n{empty}\n")
            return
        lines.append(f"## {title}\n")
        for item in items:
            lines.append(_render_item(item))
        lines.append("")

    render_list("矛盾检测", "conflicts")
    render_list("过时内容", "outdated_content")
    render_list("孤立页面", "orphan_pages")
    render_list("反向链接缺口", "missing_backlinks")
    render_list("[!conflict] 标注", "conflict_annotations")
    render_list("[!reinforce] 标注", "reinforce_annotations")
    render_list("缺失概念", "missing_concepts")
    render_list("信息缺口", "info_gaps")

    idx = result.get("index_consistency") or {}
    lines.append("## 索引一致性\n")
    if idx.get("consistent", True):
        lines.append("`_wiki_index.md` 与实际页面一致。\n")
    else:
        if idx.get("missing_from_index"):
            lines.append("缺失于索引的页面：" + ", ".join(f"[[{s}]]" for s in idx["missing_from_index"]) + "\n")
        if idx.get("extra_in_index"):
            lines.append("索引中多余的页面：" + ", ".join(f"[[{s}]]" for s in idx["extra_in_index"]) + "\n")
    lines.append("")

    tag = result.get("tag_consistency") or {}
    lines.append("## 标签一致性\n")
    if tag.get("consistent", True):
        lines.append("`_tag_registry.md` 与页面标签一致。\n")
    else:
        if tag.get("missing_from_registry"):
            lines.append("未注册的标签：" + ", ".join(f"`#{t}`" for t in tag["missing_from_registry"]) + "\n")
        if tag.get("extra_in_registry"):
            lines.append("注册表中多余的标签：" + ", ".join(f"`#{t}`" for t in tag["extra_in_registry"]) + "\n")
    lines.append("")

    return "\n".join(lines)


def _render_item(item: dict) -> str:
    if isinstance(item, str):
        return f"- {item}"
    parts = []
    if "pages" in item:
        parts.append(" vs ".join(item["pages"]))
    if "page" in item:
        parts.append(f"[[{item['page']}]]")
    if "from" in item and "to" in item:
        parts.append(f"[[{item['from']}]] → [[{item['to']}]]")
    if "slug" in item:
        parts.append(f"[[{item['slug']}]]")
    if "name" in item:
        parts.append(f"**{item['name']}**")
    if "question" in item:
        parts.append(item["question"])
    header = " / ".join(parts) if parts else "-"
    detail_parts = []
    for k in ["description", "statement", "reason", "context", "suggested_source", "referenced_by"]:
        if k in item and item[k]:
            val = item[k]
            if isinstance(val, list):
                val = ", ".join(val)
            detail_parts.append(f"- {k}：{val}")
    if detail_parts:
        return f"- {header}\n" + "\n".join("  " + d for d in detail_parts)
    return f"- {header}"


def write_lint_report(result: dict, username: str = "unknown") -> str:
    """Write the markdown report to wiki/meta/lint_report_<timestamp>.md and return its relative path."""
    wiki_storage.ensure_dirs()
    timestamp = beijing_now().strftime("%Y%m%d_%H%M%S")
    short_id = uuid.uuid4().hex[:4]
    filename = f"lint_report_{timestamp}_{short_id}.md"
    report_path = wiki_storage.META_DIR / filename
    report_path.write_text(build_lint_report(result, username), encoding="utf-8")
    return f"wiki/meta/{filename}"
