from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List
from app.database import get_db
from app.auth.dependencies import get_current_user, require_role
from app.auth.models import User
from app.wiki import schemas, service, models
from app.ai import ingest_service
from app.audit import service as audit_service
from app import activity

router = APIRouter(prefix="/wiki", tags=["wiki"])


@router.post("", response_model=schemas.WikiPageOut)
def create(data: schemas.WikiPageCreate, db: Session = Depends(get_db), user: User = Depends(require_role("admin", "editor"))):
    existing = db.query(models.WikiPage).filter(models.WikiPage.slug == data.slug).first()
    if existing:
        raise HTTPException(status_code=400, detail="Slug already exists")
    page = service.create_page(db, data.model_dump(), user)
    audit_service.log_action(db, user.id, "create", "wiki", resource_id=page.id, new_value={"slug": page.slug, "title": page.title})
    return service.get_page(db, page.slug)


@router.get("", response_model=List[schemas.WikiPageOut])
def list_all(type: str = Query(None), db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    pages = service.list_pages(db, type)
    return [service.get_page(db, p.slug) for p in pages]


@router.get("/search")
def search(q: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return service.search_pages(db, q)


@router.get("/graph", response_model=List[schemas.WikiGraphNode])
def get_graph(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    pages = db.query(models.WikiPage).all()
    return [
        schemas.WikiGraphNode(
            id=str(p.id),
            slug=p.slug,
            title=p.title,
            type=p.type,
            linked_slugs=p.linked_slugs or [],
        )
        for p in pages
    ]


@router.get("/sync-status", response_model=schemas.WikiSyncStatusOut)
def sync_status(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return service.get_sync_status(db)


@router.post("/update-knowledge-base", response_model=schemas.WikiUpdateResultOut)
async def update_knowledge_base(
    db: Session = Depends(get_db),
    user: User = Depends(require_role("admin", "editor"))
):
    operator = user.username or user.email or str(user.id)
    with activity.running("update-knowledge-base", "更新知识库", operator):
        result = await service.update_knowledge_base(db, user)
    audit_service.log_action(db, user.id, "execute", "update_knowledge_base", new_value=result)
    return result


@router.get("/{slug}", response_model=schemas.WikiPageOut)
def get(slug: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    page = service.get_page(db, slug)
    if not page:
        raise HTTPException(status_code=404, detail="Page not found")
    return page


@router.put("/{slug}", response_model=schemas.WikiPageOut)
def update(slug: str, data: schemas.WikiPageUpdate, db: Session = Depends(get_db), user: User = Depends(require_role("admin", "editor"))):
    old_page = service.get_page(db, slug)
    page = service.update_page(db, slug, data.model_dump(exclude_unset=True), user)
    if not page:
        raise HTTPException(status_code=404, detail="Page not found")
    audit_service.log_action(
        db, user.id, "update", "wiki", resource_id=page.id,
        old_value={"slug": slug, "title": old_page.get("title") if old_page else None},
        new_value=data.model_dump(exclude_unset=True),
    )
    return service.get_page(db, page.slug)


@router.delete("/{slug}")
def delete(slug: str, db: Session = Depends(get_db), user: User = Depends(require_role("admin", "editor"))):
    page = db.query(models.WikiPage).filter(models.WikiPage.slug == slug).first()
    if not page:
        raise HTTPException(status_code=404, detail="Page not found")
    audit_service.log_action(db, user.id, "delete", "wiki", resource_id=page.id, old_value={"slug": slug, "title": page.title})
    if not service.delete_page(db, slug):
        raise HTTPException(status_code=404, detail="Page not found")
    ingest_service.rebuild_wiki_index(db)
    return {"message": "Deleted"}


@router.post("/bulk-fix")
def bulk_fix(
    actions: list,
    db: Session = Depends(get_db),
    user: User = Depends(require_role("admin", "editor"))
):
    results = []
    for action in actions:
        action_type = action.get("type")
        if action_type == "add_backlink":
            from_slug = action.get("from")
            to_slug = action.get("to")
            page = db.query(models.WikiPage).filter(models.WikiPage.slug == to_slug).first()
            if page:
                if f"[[{from_slug}]]" not in page.content:
                    page.content += f"\n\n[[{from_slug}]]"
                    page.updated_by = user.id
                    db.commit()
                    results.append({"type": "add_backlink", "from": from_slug, "to": to_slug, "status": "fixed"})
                else:
                    results.append({"type": "add_backlink", "from": from_slug, "to": to_slug, "status": "already_exists"})
            else:
                results.append({"type": "add_backlink", "from": from_slug, "to": to_slug, "status": "page_not_found"})
        else:
            results.append({"type": action_type, "status": "unsupported"})
    return {"results": results}
