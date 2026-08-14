import io
import tempfile
from pathlib import Path

import pytest
from fastapi import HTTPException, UploadFile

from app.raw import storage


def _upload(data: bytes, content_type: str, filename: str = "x.pdf") -> UploadFile:
    return UploadFile(
        file=io.BytesIO(data),
        filename=filename,
        headers={"content-type": content_type},
    )


def _patch_dirs(monkeypatch, tmp: str):
    monkeypatch.setattr(storage, "DATA_DIR", Path(tmp))
    monkeypatch.setattr(storage, "RAW_DIR", Path(tmp) / "raw")
    monkeypatch.setattr(storage, "PRE_RAW_DIR", Path(tmp) / "pre_raw")
    monkeypatch.setattr(storage, "HUMAN_OUTPUTS_DIR", Path(tmp) / "human_outputs")


def test_save_upload_rejects_fake_pdf(monkeypatch):
    """坏源文件（如 arxiv 下载失败的错误页）不得入库，且磁盘不留残渣。"""
    with tempfile.TemporaryDirectory() as tmp:
        _patch_dirs(monkeypatch, tmp)
        with pytest.raises(HTTPException) as exc_info:
            storage.save_upload(_upload(b"400: Invalid request", "application/pdf"))
        assert exc_info.value.status_code == 400
        assert list((Path(tmp) / "pre_raw").glob("*")) == []


def test_save_upload_rejects_empty_file(monkeypatch):
    with tempfile.TemporaryDirectory() as tmp:
        _patch_dirs(monkeypatch, tmp)
        with pytest.raises(HTTPException) as exc_info:
            storage.save_upload(_upload(b"", "text/plain", "x.txt"))
        assert exc_info.value.status_code == 400


def test_save_upload_accepts_valid_pdf(monkeypatch):
    with tempfile.TemporaryDirectory() as tmp:
        _patch_dirs(monkeypatch, tmp)
        data = b"%PDF-1.7\nfake pdf body"
        info = storage.save_upload(_upload(data, "application/pdf"))
        assert info["file_size"] == len(data)
        assert Path(info["storage_path"]).exists()


def test_save_upload_allows_text_types_without_magic_check(monkeypatch):
    with tempfile.TemporaryDirectory() as tmp:
        _patch_dirs(monkeypatch, tmp)
        info = storage.save_upload(_upload(b"# hello markdown", "text/markdown", "x.md"))
        assert info["file_size"] == 16
