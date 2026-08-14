from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.auth import models, schemas, utils
from app.auth.dependencies import get_current_user, require_role
from app.audit import service as audit_service

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=schemas.UserOut)
def register(
    user: schemas.UserCreate,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_role("admin")),
):
    if db.query(models.User).filter(models.User.username == user.username).first():
        raise HTTPException(status_code=400, detail="Username already registered")
    db_user = models.User(
        username=user.username,
        email=user.email,
        hashed_password=utils.hash_password(user.password),
        role="editor",
        must_change_password=True,
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user


@router.post("/login", response_model=schemas.Token)
def login(credentials: schemas.UserLogin, db: Session = Depends(get_db)):
    user = (
        db.query(models.User)
        .filter(models.User.username == credentials.username)
        .first()
    )
    if not user or not utils.verify_password(
        credentials.password, user.hashed_password
    ):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = utils.create_access_token({"sub": str(user.id)})
    return {
        "access_token": token,
        "must_change_password": user.must_change_password,
    }


@router.post("/change-password")
def change_password(
    data: schemas.PasswordChange,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    if not utils.verify_password(data.current_password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    if data.new_password == data.current_password:
        raise HTTPException(
            status_code=400, detail="New password must differ from current one"
        )
    user.hashed_password = utils.hash_password(data.new_password)
    user.must_change_password = False
    db.commit()
    audit_service.log_action(
        db, str(user.id), "update", "password", str(user.id),
    )
    return {"ok": True}


@router.get("/me", response_model=schemas.UserOut)
def me(user: models.User = Depends(get_current_user)):
    return user


# ---------- Admin user management ----------


@router.get("/users", response_model=list[schemas.UserOut])
def list_users(
    db: Session = Depends(get_db),
    _: models.User = Depends(require_role("admin")),
):
    return db.query(models.User).order_by(models.User.created_at.desc()).all()


@router.post("/users", response_model=schemas.UserOut)
def create_user(
    data: schemas.UserCreateAdmin,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_role("admin")),
):
    if db.query(models.User).filter(models.User.username == data.username).first():
        raise HTTPException(status_code=400, detail="Username already registered")
    email = data.email or f"{data.username}@mindforge.local"
    if (
        data.email
        and db.query(models.User).filter(models.User.email == email).first()
    ):
        raise HTTPException(status_code=400, detail="Email already registered")
    db_user = models.User(
        username=data.username,
        email=email,
        hashed_password=utils.hash_password(data.password),
        role=data.role,
        must_change_password=True,
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user


@router.put("/users/{user_id}", response_model=schemas.UserOut)
def update_user(
    user_id: str,
    data: schemas.UserUpdateAdmin,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_role("admin")),
):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.id == current_user.id and data.role and data.role != "admin":
        raise HTTPException(status_code=400, detail="Cannot demote yourself")
    if data.email is not None:
        if (
            db.query(models.User)
            .filter(models.User.email == data.email, models.User.id != user_id)
            .first()
        ):
            raise HTTPException(status_code=400, detail="Email already registered")
        user.email = data.email
    if data.password is not None:
        user.hashed_password = utils.hash_password(data.password)
        user.must_change_password = True
    if data.role is not None:
        user.role = data.role
    db.commit()
    db.refresh(user)
    return user


@router.delete("/users/{user_id}")
def delete_user(
    user_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_role("admin")),
):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    db.delete(user)
    db.commit()
    return {"ok": True}


# ---------- Role permissions management ----------


@router.get("/roles", response_model=list[schemas.RolePermissionsOut])
def list_role_permissions(
    db: Session = Depends(get_db),
    _: models.User = Depends(require_role("admin")),
):
    rows = (
        db.query(models.RolePermission)
        .order_by(models.RolePermission.role_name, models.RolePermission.resource, models.RolePermission.permission)
        .all()
    )
    grouped: dict[str, dict[tuple[str, str], schemas.PermissionItem]] = {}
    for row in rows:
        # 历史数据可能使用 plan，统一归并为 research_plan
        resource = row.resource if row.resource != "plan" else "research_plan"
        key = (row.permission, resource)
        grouped.setdefault(row.role_name, {})[key] = schemas.PermissionItem(
            action=row.permission, resource=resource
        )
    return [
        schemas.RolePermissionsOut(role_name=role, permissions=list(perms.values()))
        for role, perms in grouped.items()
    ]


@router.put("/roles/{role_name}/permissions", response_model=schemas.RolePermissionsOut)
def update_role_permissions(
    role_name: str,
    data: schemas.RolePermissionsUpdate,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_role("admin")),
):
    # 归并 plan 到 research_plan 并去重
    seen: set[tuple[str, str]] = set()
    normalized: list[schemas.PermissionItem] = []
    for perm in data.permissions:
        resource = perm.resource if perm.resource != "plan" else "research_plan"
        key = (perm.action, resource)
        if key not in seen:
            seen.add(key)
            normalized.append(schemas.PermissionItem(action=perm.action, resource=resource))

    db.query(models.RolePermission).filter(
        models.RolePermission.role_name == role_name
    ).delete()
    for perm in normalized:
        db.add(
            models.RolePermission(
                role_name=role_name,
                permission=perm.action,
                resource=perm.resource,
            )
        )
    db.commit()
    return schemas.RolePermissionsOut(
        role_name=role_name,
        permissions=[
            schemas.PermissionItem(action=p.action, resource=p.resource)
            for p in normalized
        ],
    )
