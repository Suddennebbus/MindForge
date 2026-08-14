import os
import secrets as _secrets
from pathlib import Path

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = os.getenv(
        "DATABASE_URL",
        "sqlite:///./data/mindforge.db"
    )
    secret_key: str = ""
    encryption_key: str = ""
    data_dir: str = "./data"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24 * 7  # 7 days
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    class Config:
        env_file = ".env"


settings = Settings()


def _load_or_generate_secrets() -> None:
    """Resolve secret_key / encryption_key without any hardcoded default.

    Priority: env/.env > <data_dir>/.secrets (persisted) > freshly generated
    random values. Generated values are written back to .secrets so they
    survive restarts, keeping JWT tokens and encrypted API keys valid.
    """
    if settings.secret_key and settings.encryption_key:
        return
    secrets_file = Path(settings.data_dir) / ".secrets"
    stored: dict[str, str] = {}
    if secrets_file.exists():
        for line in secrets_file.read_text().splitlines():
            if "=" in line:
                k, v = line.split("=", 1)
                stored[k.strip()] = v.strip()
    need_write = False
    if not settings.secret_key:
        settings.secret_key = stored.get("SECRET_KEY", "")
        if not settings.secret_key:
            settings.secret_key = _secrets.token_hex(32)
            need_write = True
    if not settings.encryption_key:
        settings.encryption_key = stored.get("ENCRYPTION_KEY", "")
        if not settings.encryption_key:
            settings.encryption_key = _secrets.token_hex(32)
            need_write = True
    if need_write:
        secrets_file.parent.mkdir(parents=True, exist_ok=True)
        secrets_file.write_text(
            f"SECRET_KEY={settings.secret_key}\n"
            f"ENCRYPTION_KEY={settings.encryption_key}\n"
        )
        secrets_file.chmod(0o600)


_load_or_generate_secrets()
