import shutil
import uuid
from pathlib import Path
from typing import Optional
from app.config import settings
from fastapi import HTTPException, UploadFile

DATA_DIR = Path(settings.data_dir)
RAW_DIR = DATA_DIR / "raw"
PRE_RAW_DIR = DATA_DIR / "pre_raw"
HUMAN_OUTPUTS_DIR = DATA_DIR / "human_outputs"


def ensure_dirs():
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    PRE_RAW_DIR.mkdir(parents=True, exist_ok=True)
    HUMAN_OUTPUTS_DIR.mkdir(parents=True, exist_ok=True)


ALLOWED_TYPES = {
    "application/pdf": ".pdf",
    "text/markdown": ".md",
    "text/plain": ".txt",
    "text/html": ".html",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
    "application/msword": ".doc",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
}


# 二进制类型的魔数头，用于拒绝坏源文件（如下载失败保存的错误页）
_MAGIC_BYTES = {
    "application/pdf": [b"%PDF-"],
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [b"PK\x03\x04"],
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [b"PK\x03\x04"],
    "application/msword": [b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1", b"PK\x03\x04"],
}


def _validate_content(path: Path, content_type: str):
    """空文件或魔数不匹配 → 删除并抛 400。文本类不做魔数校验。"""
    head = path.open("rb").read(8) if path.exists() else b""
    magics = _MAGIC_BYTES.get(content_type)
    if not head or (magics and not any(head.startswith(m) for m in magics)):
        path.unlink(missing_ok=True)
        raise HTTPException(
            status_code=400,
            detail="文件内容为空或与声明的类型不符（源文件可能是下载失败的错误页）",
        )


def save_upload(file: UploadFile, is_raw: bool = False, is_human_output: bool = False, category: Optional[str] = None) -> dict:
    ensure_dirs()
    if is_human_output:
        if category:
            target_dir = HUMAN_OUTPUTS_DIR / category.strip()
            target_dir.mkdir(parents=True, exist_ok=True)
        else:
            target_dir = HUMAN_OUTPUTS_DIR
    elif is_raw:
        if category:
            target_dir = RAW_DIR / category.strip()
            target_dir.mkdir(parents=True, exist_ok=True)
        else:
            target_dir = RAW_DIR
    else:
        if category:
            target_dir = PRE_RAW_DIR / category.strip()
            target_dir.mkdir(parents=True, exist_ok=True)
        else:
            target_dir = PRE_RAW_DIR
    ext = ALLOWED_TYPES.get(file.content_type, Path(file.filename).suffix)
    if not ext:
        ext = ".bin"
    dest = target_dir / f"{uuid.uuid4().hex}{ext}"
    with dest.open("wb") as f:
        shutil.copyfileobj(file.file, f)
    _validate_content(dest, file.content_type or "")
    return {
        "filename": dest.name,
        "storage_path": str(dest),
        "file_size": dest.stat().st_size,
        "mime_type": file.content_type or "application/octet-stream",
    }


def move_to_raw(pre_raw_path: str, category: Optional[str] = None) -> str:
    ensure_dirs()
    src = Path(pre_raw_path)
    if category:
        target_dir = RAW_DIR / category.strip()
        target_dir.mkdir(parents=True, exist_ok=True)
    else:
        target_dir = RAW_DIR
    dest = target_dir / src.name
    src.rename(dest)
    return str(dest)


def move_human_output_to_raw(human_output_path: str, category: Optional[str] = None) -> str:
    ensure_dirs()
    src = Path(human_output_path)
    if category:
        target_dir = RAW_DIR / category.strip()
        target_dir.mkdir(parents=True, exist_ok=True)
    else:
        target_dir = RAW_DIR
    dest = target_dir / src.name
    src.rename(dest)
    return str(dest)


def delete_file(path: str) -> bool:
    p = Path(path)
    if p.exists():
        p.unlink()
        return True
    return False


def download_to_pre_raw(url: str, filename: str | None = None, category: Optional[str] = None) -> dict:
    """Download a file from URL into pre_raw directory.

    Returns {"filename": ..., "storage_path": ..., "file_size": ..., "mime_type": ...}
    """
    import httpx
    from urllib.parse import urlparse

    ensure_dirs()
    if category:
        target_dir = PRE_RAW_DIR / category.strip()
        target_dir.mkdir(parents=True, exist_ok=True)
    else:
        target_dir = PRE_RAW_DIR

    resp = httpx.get(url, follow_redirects=True, timeout=60)
    resp.raise_for_status()

    content_type = resp.headers.get("content-type", "application/octet-stream").split(";")[0].strip()
    ext = ALLOWED_TYPES.get(content_type, Path(urlparse(url).path).suffix)
    if not ext:
        ext = ".pdf" if content_type == "application/pdf" else ".bin"

    if not filename:
        filename = Path(urlparse(url).path).name or f"download{ext}"
    if not Path(filename).suffix:
        filename = f"{filename}{ext}"

    dest = target_dir / filename
    counter = 1
    original_dest = dest
    while dest.exists():
        stem = original_dest.stem
        dest = target_dir / f"{stem}-{counter}{original_dest.suffix}"
        counter += 1

    dest.write_bytes(resp.content)
    _validate_content(dest, content_type)
    return {
        "filename": dest.name,
        "storage_path": str(dest),
        "file_size": dest.stat().st_size,
        "mime_type": content_type,
    }
