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
