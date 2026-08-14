from pydantic import BaseModel, EmailStr, Field
from uuid import UUID
from typing import Optional


class UserCreate(BaseModel):
    username: str
    email: EmailStr
    password: str


class UserCreateAdmin(BaseModel):
    username: str
    email: Optional[EmailStr] = None
    password: str
    role: str = Field(default="viewer", pattern="^(admin|editor|viewer)$")


class UserUpdateAdmin(BaseModel):
    email: Optional[EmailStr] = None
    password: Optional[str] = None
    role: Optional[str] = Field(default=None, pattern="^(admin|editor|viewer)$")


class UserLogin(BaseModel):
    username: str
    password: str


class UserOut(BaseModel):
    id: UUID
    username: str
    email: str
    role: str
    must_change_password: bool = False

    class Config:
        from_attributes = True


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    must_change_password: bool = False


class PasswordChange(BaseModel):
    current_password: str
    new_password: str = Field(min_length=6)


class PermissionItem(BaseModel):
    action: str
    resource: str


class RolePermissionsOut(BaseModel):
    role_name: str
    permissions: list[PermissionItem]


class RolePermissionsUpdate(BaseModel):
    permissions: list[PermissionItem]
