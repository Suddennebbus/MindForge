from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import inspect as sa_inspect
from alembic.config import Config as AlembicConfig
from alembic import command as alembic_command
from app.database import engine, Base, SessionLocal
from app.auth import models as auth_models, router as auth_router
from app.seed import ensure_data_dirs, seed_permissions, seed_wiki_from_filesystem
from app.auth import utils
from app.config import settings
from app.wiki import router as wiki_router
from app.raw import router as raw_router
from app.plans import router as plans_router
from app.dashboard import router as dashboard_router
from app.ai.router import router as llm_config_router, ai_router
from app.ai import models as ai_models  # noqa: F401
from app.audit import models as audit_models  # noqa: F401
from app.audit import router as audit_router
from app.agents import router as agents_router
from app.agents import models as agents_models  # noqa: F401
from app.agents.executor import recover_interrupted_runs

def _migrate_or_stamp() -> None:
    """Existing databases are upgraded to head; freshly created databases
    (schema made by create_all just above) are stamped at head so future
    upgrades run through alembic normally."""
    cfg = AlembicConfig("alembic.ini")
    if "alembic_version" in sa_inspect(engine).get_table_names():
        alembic_command.upgrade(cfg, "head")
    else:
        alembic_command.stamp(cfg, "head")


ensure_data_dirs(settings.data_dir)
Base.metadata.create_all(bind=engine)
_migrate_or_stamp()
recover_interrupted_runs()


@asynccontextmanager
async def lifespan(app: FastAPI):
    db = SessionLocal()
    try:
        seed_permissions(db)
        admin = (
            db.query(auth_models.User)
            .filter(auth_models.User.username == "admin")
            .first()
        )
        if not admin:
            admin = auth_models.User(
                username="admin",
                email="admin@mindforge.local",
                hashed_password=utils.hash_password("admin"),
                role="admin",
                must_change_password=True,
            )
            db.add(admin)
            db.commit()
            db.refresh(admin)
        seed_wiki_from_filesystem(db, settings.data_dir, admin)
    finally:
        db.close()
    yield


app = FastAPI(title="MindForge API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        o.strip() for o in settings.cors_origins.split(",") if o.strip()
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router.router)
app.include_router(wiki_router.router)
app.include_router(raw_router.router)
app.include_router(plans_router.router)
app.include_router(dashboard_router.router)
app.include_router(audit_router.router)
app.include_router(llm_config_router)
app.include_router(ai_router)
app.include_router(agents_router.router)


@app.get("/health")
def health():
    return {"status": "ok"}
