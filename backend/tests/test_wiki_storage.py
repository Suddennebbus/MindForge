import tempfile
from pathlib import Path
from app.wiki import storage


def test_write_and_read_page(monkeypatch):
    with tempfile.TemporaryDirectory() as tmp:
        monkeypatch.setattr(storage, "DATA_DIR", Path(tmp) / "wiki")
        monkeypatch.setattr(storage, "WIKI_DIR", Path(tmp) / "wiki")
        monkeypatch.setattr(storage, "ENTITIES_DIR", Path(tmp) / "wiki" / "entities")
        monkeypatch.setattr(storage, "CONCEPTS_DIR", Path(tmp) / "wiki" / "concepts")
        monkeypatch.setattr(storage, "SYNTHESES_DIR", Path(tmp) / "wiki" / "syntheses")
        monkeypatch.setattr(storage, "META_DIR", Path(tmp) / "wiki" / "meta")

        path = storage.write_page("test-entity", "entity", "# Test\n\nContent")
        assert Path(path).exists()
        assert storage.read_page(path) == "# Test\n\nContent"
        pages = storage.list_pages()
        assert len(pages) == 1
        assert pages[0]["slug"] == "test-entity"
