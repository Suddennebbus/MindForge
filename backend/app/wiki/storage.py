import os
from pathlib import Path
from app.config import settings

DATA_DIR = Path(settings.data_dir)
WIKI_DIR = DATA_DIR / "wiki"
ENTITIES_DIR = WIKI_DIR / "entities"
CONCEPTS_DIR = WIKI_DIR / "concepts"
SYNTHESES_DIR = WIKI_DIR / "syntheses"
META_DIR = WIKI_DIR / "meta"


def ensure_dirs():
    for d in [ENTITIES_DIR, CONCEPTS_DIR, SYNTHESES_DIR, META_DIR]:
        d.mkdir(parents=True, exist_ok=True)


def dir_for_type(page_type: str) -> Path:
    return {
        "entity": ENTITIES_DIR,
        "concept": CONCEPTS_DIR,
        "synthesis": SYNTHESES_DIR,
    }.get(page_type, ENTITIES_DIR)


def write_page(slug: str, page_type: str, content: str) -> str:
    ensure_dirs()
    directory = dir_for_type(page_type)
    file_path = directory / f"{slug}.md"
    file_path.write_text(content, encoding="utf-8")
    return str(file_path)


def read_page(file_path: str) -> str:
    return Path(file_path).read_text(encoding="utf-8")


def delete_page(file_path: str):
    Path(file_path).unlink(missing_ok=True)


def list_pages():
    ensure_dirs()
    pages = []
    for d, ptype in [(ENTITIES_DIR, "entity"), (CONCEPTS_DIR, "concept"), (SYNTHESES_DIR, "synthesis")]:
        for f in d.glob("*.md"):
            pages.append({"slug": f.stem, "type": ptype, "path": str(f)})
    return pages
