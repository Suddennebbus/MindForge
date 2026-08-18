import base64
import hashlib
from cryptography.fernet import Fernet
from app.config import settings


# Derive a 32-byte Fernet key from the settings encryption key
digest = hashlib.sha256(settings.encryption_key.encode()).digest()
fernet_key = base64.urlsafe_b64encode(digest)
fernet = Fernet(fernet_key)


def encrypt_api_key(plain: str) -> str:
    return fernet.encrypt(plain.encode()).decode()


def decrypt_api_key(encrypted: str) -> str:
    return fernet.decrypt(encrypted.encode()).decode()


def parse_llm_json(text: str, fallback=None):
    """解析 LLM 输出的 JSON：先剥 ```json 代码块围栏，再整体 json.loads，
    失败时尝试截取首个完整 {...} 对象（容忍首尾多余文字），最后返回 fallback。

    LLM 输出被 max_tokens 截断时 JSON 不完整，无法挽救，仍会返回 fallback，
    调用方应同时保证 max_tokens 足够。
    """
    import json

    stripped = (text or "").strip()
    if stripped.startswith("```"):
        lines = stripped.split("\n")
        lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        stripped = "\n".join(lines).strip()
    try:
        return json.loads(stripped)
    except json.JSONDecodeError:
        pass
    start = stripped.find("{")
    if start >= 0:
        try:
            obj, _ = json.JSONDecoder().raw_decode(stripped[start:])
            return obj
        except json.JSONDecodeError:
            pass
    return fallback
