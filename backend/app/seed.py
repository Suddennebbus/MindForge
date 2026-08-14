import os
import re
from pathlib import Path
from sqlalchemy.orm import Session
from app.auth.models import RolePermission, User
from app.wiki import models as wiki_models
from app.wiki import storage

PERMISSIONS = [
    # admin
    ("admin", "create", "research_plan"),
    ("admin", "read", "research_plan"),
    ("admin", "update", "research_plan"),
    ("admin", "delete", "research_plan"),
    ("admin", "create", "pre_raw"),
    ("admin", "read", "pre_raw"),
    ("admin", "update", "pre_raw"),
    ("admin", "delete", "pre_raw"),
    ("admin", "create", "raw"),
    ("admin", "read", "raw"),
    ("admin", "update", "raw"),
    ("admin", "delete", "raw"),
    ("admin", "create", "wiki"),
    ("admin", "read", "wiki"),
    ("admin", "update", "wiki"),
    ("admin", "delete", "wiki"),
    ("admin", "execute", "ingest"),
    ("admin", "execute", "explore"),
    ("admin", "execute", "lint"),
    ("admin", "create", "settings"),
    ("admin", "read", "settings"),
    ("admin", "update", "settings"),
    ("admin", "delete", "settings"),
    # editor
    ("editor", "create", "research_plan"),
    ("editor", "read", "research_plan"),
    ("editor", "update", "research_plan"),
    ("editor", "create", "pre_raw"),
    ("editor", "read", "pre_raw"),
    ("editor", "update", "pre_raw"),
    ("editor", "delete", "pre_raw"),
    ("editor", "create", "raw"),
    ("editor", "read", "raw"),
    ("editor", "create", "wiki"),
    ("editor", "read", "wiki"),
    ("editor", "update", "wiki"),
    ("editor", "delete", "wiki"),
    ("editor", "execute", "ingest"),
    ("editor", "execute", "explore"),
    ("editor", "execute", "lint"),
    # viewer
    ("viewer", "read", "research_plan"),
    ("viewer", "read", "pre_raw"),
    ("viewer", "read", "raw"),
    ("viewer", "read", "wiki"),
]


DATA_SUBDIRS = ("pre_raw", "raw", "wiki", "plan", "human_outputs")


def ensure_data_dirs(data_dir: str) -> None:
    """Create all runtime data subdirectories (idempotent)."""
    root = Path(data_dir)
    for sub in DATA_SUBDIRS:
        (root / sub).mkdir(parents=True, exist_ok=True)


def seed_permissions(db: Session):
    if db.query(RolePermission).first():
        return
    for role, perm, resource in PERMISSIONS:
        db.add(RolePermission(role_name=role, permission=perm, resource=resource))
    db.commit()


def seed_wiki_from_filesystem(db: Session, data_dir: str, admin_user: User):
    """Import pre-existing markdown wiki pages from data/wiki into the database.

    One-time migration helper; a no-op when the directories are empty or absent.
    """
    wiki_dir = Path(data_dir) / "wiki"
    if not wiki_dir.exists():
        return

    type_dirs = {
        "entities": "entity",
        "concepts": "concept",
        "syntheses": "synthesis",
    }

    for subdir, ptype in type_dirs.items():
        src_dir = wiki_dir / subdir
        if not src_dir.exists():
            continue
        for md_file in src_dir.glob("*.md"):
            slug = md_file.stem
            if (
                db.query(wiki_models.WikiPage)
                .filter(wiki_models.WikiPage.slug == slug)
                .first()
            ):
                continue

            content = md_file.read_text(encoding="utf-8")
            title = slug
            tags = []
            summary = ""
            source_paths = []
            linked_slugs = []

            if content.startswith("---"):
                parts = content.split("---", 2)
                if len(parts) >= 3:
                    yaml_text = parts[1]
                    for line in yaml_text.split("\n"):
                        if line.startswith("title:"):
                            title = line.split(":", 1)[1].strip().strip('"')
                        elif line.startswith("tags:"):
                            tags_str = line.split(":", 1)[1].strip()
                            tags = [
                                t.strip().strip('"')
                                for t in tags_str.strip("[]").split(",")
                                if t.strip()
                            ]
                        elif line.startswith("summary:"):
                            summary = line.split(":", 1)[1].strip().strip('"')
                        elif line.startswith("sources:"):
                            src_str = line.split(":", 1)[1].strip()
                            source_paths = [
                                s.strip().strip('"')
                                for s in src_str.strip("[]").split(",")
                                if s.strip()
                            ]
                        elif line.startswith("links:"):
                            link_str = line.split(":", 1)[1].strip()
                            linked_slugs = re.findall(r"\[\[([^\]]+)\]\]", link_str)

            dest_path = storage.write_page(slug, ptype, content)
            page = wiki_models.WikiPage(
                slug=slug,
                title=title,
                type=ptype,
                tags=tags,
                summary=summary,
                source_paths=source_paths,
                linked_slugs=linked_slugs,
                file_path=dest_path,
                created_by=admin_user.id,
                updated_by=admin_user.id,
            )
            db.add(page)

    db.commit()
