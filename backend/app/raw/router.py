from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from app.database import get_db
from app.auth.dependencies import get_current_user, require_role
from app.auth.models import User
from app.raw import models, storage, schemas
from app.audit import service as audit_service
from fastapi.responses import FileResponse

from sqlalchemy.orm import joinedload
from app.wiki import models as wiki_models

router = APIRouter(prefix="/raw", tags=["raw"])


@router.post("/upload", response_model=schemas.RawFileOut)
def upload_raw(
    file: UploadFile = File(...),
    category: Optional[str] = Form(None),
    db: Session = Depends(get_db),
    user: User = Depends(require_role("admin", "editor"))
):
    if file.content_type not in storage.ALLOWED_TYPES:
        raise HTTPException(status_code=400, detail="Unsupported file type")
    cat = category.strip() if category else None
    info = storage.save_upload(file, is_raw=True, category=cat)
    db_file = models.RawFile(
        filename=info["filename"],
        original_name=file.filename,
        storage_type="local",
        storage_path=info["storage_path"],
        file_size=info["file_size"],
        mime_type=info["mime_type"],
        status="pending",
        category=cat,
        uploaded_by=user.id,
    )
    db.add(db_file)
    db.commit()
    db.refresh(db_file)
    audit_service.log_action(db, user.id, "create", "raw", resource_id=db_file.id, new_value={"filename": db_file.filename, "category": db_file.category})
    return db_file


@router.get("", response_model=List[schemas.RawFileOut])
def list_raw(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    files = db.query(models.RawFile).options(
        joinedload(models.RawFile.wiki_pages)
    ).filter(
        models.RawFile.storage_path.like("%/raw/%")
    ).all()

    # entity_page_slug is derived from the first linked page for backward compatibility.
    slug_by_id = {p.id: p.slug for p in sum((f.wiki_pages for f in files), [])}
    for f in files:
        f.entity_page_slug = slug_by_id.get(f.entity_page_id) if f.entity_page_id else None

    return files


@router.get("/download/{file_id}")
def download(file_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    f = db.query(models.RawFile).filter(models.RawFile.id == file_id).first()
    if not f:
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(f.storage_path, filename=f.original_name)


@router.post("/pre-raw/upload", response_model=schemas.RawFileOut)
def upload_pre_raw(
    file: UploadFile = File(...),
    category: Optional[str] = Form(None),
    db: Session = Depends(get_db),
    user: User = Depends(require_role("admin", "editor"))
):
    if file.content_type not in storage.ALLOWED_TYPES:
        raise HTTPException(status_code=400, detail="Unsupported file type")
    cat = category.strip() if category else None
    info = storage.save_upload(file, is_raw=False, category=cat)
    db_file = models.RawFile(
        filename=info["filename"],
        original_name=file.filename,
        storage_type="local",
        storage_path=info["storage_path"],
        file_size=info["file_size"],
        mime_type=info["mime_type"],
        status="pending",
        category=cat,
        uploaded_by=user.id,
    )
    db.add(db_file)
    db.commit()
    db.refresh(db_file)
    audit_service.log_action(db, user.id, "create", "raw", resource_id=db_file.id, new_value={"filename": db_file.filename, "category": db_file.category})
    return db_file


@router.get("/pre-raw", response_model=List[schemas.RawFileOut])
def list_pre_raw(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return db.query(models.RawFile).filter(
        models.RawFile.storage_path.like("%/pre_raw/%")
    ).all()


@router.post("/pre-raw/{file_id}/review", response_model=schemas.RawFileOut)
def review_pre_raw(file_id: str, db: Session = Depends(get_db), user: User = Depends(require_role("admin", "editor"))):
    f = db.query(models.RawFile).filter(models.RawFile.id == file_id).first()
    if not f:
        raise HTTPException(status_code=404, detail="File not found")
    if f.status not in {"pending", "rejected"}:
        raise HTTPException(status_code=400, detail="File cannot be reviewed")
    f.status = "reviewed"
    db.commit()
    db.refresh(f)
    audit_service.log_action(db, user.id, "update", "pre_raw", resource_id=f.id, new_value={"status": "reviewed"})
    return f


@router.post("/pre-raw/{file_id}/reject", response_model=schemas.RawFileOut)
def reject_pre_raw(file_id: str, db: Session = Depends(get_db), user: User = Depends(require_role("admin", "editor"))):
    f = db.query(models.RawFile).filter(models.RawFile.id == file_id).first()
    if not f:
        raise HTTPException(status_code=404, detail="File not found")
    if f.status == "approved":
        raise HTTPException(status_code=400, detail="Already approved")
    f.status = "rejected"
    db.commit()
    db.refresh(f)
    audit_service.log_action(db, user.id, "update", "pre_raw", resource_id=f.id, new_value={"status": "rejected"})
    return f


@router.post("/pre-raw/{file_id}/approve", response_model=schemas.RawFileOut)
def approve_pre_raw(file_id: str, db: Session = Depends(get_db), user: User = Depends(require_role("admin", "editor"))):
    f = db.query(models.RawFile).filter(models.RawFile.id == file_id).first()
    if not f:
        raise HTTPException(status_code=404, detail="File not found")
    if f.status == "approved":
        raise HTTPException(status_code=400, detail="Already approved")
    new_path = storage.move_to_raw(f.storage_path, category=f.category)
    f.storage_path = new_path
    f.status = "approved"
    db.commit()
    db.refresh(f)
    audit_service.log_action(db, user.id, "execute", "pre_raw", resource_id=f.id, new_value={"status": "approved", "new_path": new_path})
    return f


@router.patch("/pre-raw/{file_id}/status", response_model=schemas.RawFileOut)
def update_pre_raw_status(
    file_id: str,
    data: schemas.StatusUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(require_role("admin", "editor"))
):
    f = db.query(models.RawFile).filter(models.RawFile.id == file_id).first()
    if not f:
        raise HTTPException(status_code=404, detail="File not found")
    f.status = data.status
    db.commit()
    db.refresh(f)
    return f


@router.delete("/pre-raw/{file_id}")
def delete_pre_raw(
    file_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(require_role("admin", "editor"))
):
    f = db.query(models.RawFile).filter(models.RawFile.id == file_id).first()
    if not f:
        raise HTTPException(status_code=404, detail="File not found")
    audit_service.log_action(db, user.id, "delete", "pre_raw", resource_id=f.id, old_value={"filename": f.filename})
    storage.delete_file(f.storage_path)
    db.delete(f)
    db.commit()
    return {"message": "Deleted"}


@router.get("/{file_id}/comments", response_model=List[schemas.PreRawCommentOut])
def list_comments(
    file_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    return db.query(models.PreRawComment).filter(
        models.PreRawComment.raw_file_id == file_id
    ).order_by(models.PreRawComment.created_at.desc()).all()


@router.post("/{file_id}/comments", response_model=schemas.PreRawCommentOut)
def create_comment(
    file_id: str,
    data: schemas.PreRawCommentCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    comment = models.PreRawComment(
        raw_file_id=file_id,
        user_id=user.id,
        username=user.username,
        content=data.content,
        parent_id=data.parent_id,
    )
    db.add(comment)
    db.commit()
    db.refresh(comment)
    return comment


@router.delete("/{file_id}/comments/{comment_id}")
def delete_comment(
    file_id: str,
    comment_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    comment = db.query(models.PreRawComment).filter(
        models.PreRawComment.id == comment_id,
        models.PreRawComment.raw_file_id == file_id,
    ).first()
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")
    if comment.user_id != user.id and user.role != "admin":
        raise HTTPException(status_code=403, detail="Permission denied")
    db.delete(comment)
    db.commit()
    return {"message": "Deleted"}


@router.get("/{file_id}/content", response_model=schemas.FileContentOut)
def get_file_content(
    file_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    f = db.query(models.RawFile).filter(models.RawFile.id == file_id).first()
    if not f:
        raise HTTPException(status_code=404, detail="File not found")

    mime = f.mime_type or ""
    if mime == "application/pdf":
        return schemas.FileContentOut(type="pdf", download_url=f"/raw/download/{file_id}", mime_type=mime)

    if mime in ("text/markdown", "text/plain", "text/html"):
        try:
            with open(f.storage_path, "r", encoding="utf-8") as fh:
                content = fh.read()
        except UnicodeDecodeError:
            raise HTTPException(status_code=400, detail="File is not readable as text")
        except Exception:
            raise HTTPException(status_code=500, detail="Failed to read file")
        return schemas.FileContentOut(type="text", content=content, mime_type=mime)

    return schemas.FileContentOut(type="unsupported", mime_type=mime)


@router.get("/{file_id}/annotations", response_model=List[schemas.AnnotationOut])
def list_annotations(
    file_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    return db.query(models.RawFileAnnotation).filter(
        models.RawFileAnnotation.raw_file_id == file_id
    ).order_by(models.RawFileAnnotation.created_at.asc()).all()


@router.post("/{file_id}/annotations", response_model=schemas.AnnotationOut)
def create_annotation(
    file_id: str,
    data: schemas.AnnotationCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    annotation = models.RawFileAnnotation(
        raw_file_id=file_id,
        user_id=user.id,
        username=user.username,
        start_offset=data.start_offset,
        end_offset=data.end_offset,
        selected_text=data.selected_text,
        content=data.content,
    )
    db.add(annotation)
    db.commit()
    db.refresh(annotation)
    return annotation


@router.delete("/{file_id}/annotations/{annotation_id}")
def delete_annotation(
    file_id: str,
    annotation_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    annotation = db.query(models.RawFileAnnotation).filter(
        models.RawFileAnnotation.id == annotation_id,
        models.RawFileAnnotation.raw_file_id == file_id,
    ).first()
    if not annotation:
        raise HTTPException(status_code=404, detail="Annotation not found")
    if annotation.user_id != user.id and user.role != "admin":
        raise HTTPException(status_code=403, detail="Permission denied")
    db.delete(annotation)
    db.commit()
    return {"message": "Deleted"}


# ----- Human Outputs -----

@router.post("/human-outputs/upload", response_model=schemas.HumanOutputOut)
def upload_human_output(
    file: UploadFile = File(...),
    category: Optional[str] = Form(None),
    db: Session = Depends(get_db),
    user: User = Depends(require_role("admin", "editor"))
):
    if file.content_type not in storage.ALLOWED_TYPES:
        raise HTTPException(status_code=400, detail="Unsupported file type")
    cat = category.strip() if category else None
    info = storage.save_upload(file, is_human_output=True, category=cat)
    db_file = models.HumanOutput(
        filename=info["filename"],
        original_name=file.filename,
        storage_type="local",
        storage_path=info["storage_path"],
        file_size=info["file_size"],
        mime_type=info["mime_type"],
        status="draft",
        category=cat,
        uploaded_by=user.id,
    )
    db.add(db_file)
    db.commit()
    db.refresh(db_file)
    audit_service.log_action(db, user.id, "create", "human_output", resource_id=db_file.id, new_value={"filename": db_file.filename, "category": db_file.category})
    return db_file


@router.get("/human-outputs", response_model=List[schemas.HumanOutputOut])
def list_human_outputs(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return db.query(models.HumanOutput).order_by(models.HumanOutput.created_at.desc()).all()


@router.get("/human-outputs/{file_id}", response_model=schemas.HumanOutputOut)
def get_human_output(file_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    f = db.query(models.HumanOutput).filter(models.HumanOutput.id == file_id).first()
    if not f:
        raise HTTPException(status_code=404, detail="File not found")
    return f


@router.get("/human-outputs/{file_id}/download")
def download_human_output(file_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    f = db.query(models.HumanOutput).filter(models.HumanOutput.id == file_id).first()
    if not f:
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(f.storage_path, filename=f.original_name)


@router.get("/human-outputs/{file_id}/content", response_model=schemas.FileContentOut)
def get_human_output_content(
    file_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    f = db.query(models.HumanOutput).filter(models.HumanOutput.id == file_id).first()
    if not f:
        raise HTTPException(status_code=404, detail="File not found")

    mime = f.mime_type or ""
    if mime == "application/pdf":
        return schemas.FileContentOut(type="pdf", download_url=f"/raw/human-outputs/{file_id}/download", mime_type=mime)

    if mime in ("text/markdown", "text/plain", "text/html"):
        try:
            with open(f.storage_path, "r", encoding="utf-8") as fh:
                content = fh.read()
        except UnicodeDecodeError:
            raise HTTPException(status_code=400, detail="File is not readable as text")
        except Exception:
            raise HTTPException(status_code=500, detail="Failed to read file")
        return schemas.FileContentOut(type="text", content=content, mime_type=mime)

    return schemas.FileContentOut(type="unsupported", mime_type=mime)


@router.get("/human-outputs/{file_id}/comments", response_model=List[schemas.HumanOutputCommentOut])
def list_human_output_comments(
    file_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    return db.query(models.HumanOutputComment).filter(
        models.HumanOutputComment.human_output_id == file_id
    ).order_by(models.HumanOutputComment.created_at.desc()).all()


@router.post("/human-outputs/{file_id}/comments", response_model=schemas.HumanOutputCommentOut)
def create_human_output_comment(
    file_id: str,
    data: schemas.HumanOutputCommentCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    comment = models.HumanOutputComment(
        human_output_id=file_id,
        user_id=user.id,
        username=user.username,
        content=data.content,
        parent_id=data.parent_id,
    )
    db.add(comment)
    db.commit()
    db.refresh(comment)
    return comment


@router.delete("/human-outputs/{file_id}/comments/{comment_id}")
def delete_human_output_comment(
    file_id: str,
    comment_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    comment = db.query(models.HumanOutputComment).filter(
        models.HumanOutputComment.id == comment_id,
        models.HumanOutputComment.human_output_id == file_id,
    ).first()
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")
    if comment.user_id != user.id and user.role != "admin":
        raise HTTPException(status_code=403, detail="Permission denied")
    db.delete(comment)
    db.commit()
    return {"message": "Deleted"}


@router.patch("/human-outputs/{file_id}/status", response_model=schemas.HumanOutputOut)
def update_human_output_status(
    file_id: str,
    data: schemas.HumanOutputStatusUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(require_role("admin", "editor"))
):
    f = db.query(models.HumanOutput).filter(models.HumanOutput.id == file_id).first()
    if not f:
        raise HTTPException(status_code=404, detail="File not found")
    f.status = data.status
    db.commit()
    db.refresh(f)
    return f


@router.post("/human-outputs/{file_id}/ingest", response_model=schemas.HumanOutputOut)
def ingest_human_output(
    file_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(require_role("admin", "editor"))
):
    f = db.query(models.HumanOutput).filter(models.HumanOutput.id == file_id).first()
    if not f:
        raise HTTPException(status_code=404, detail="File not found")
    new_path = storage.move_human_output_to_raw(f.storage_path, category=f.category)
    f.storage_path = new_path
    f.status = "ingested"
    db.commit()
    db.refresh(f)
    audit_service.log_action(db, user.id, "execute", "human_output", resource_id=f.id, new_value={"filename": f.filename, "new_path": new_path})
    return f


@router.delete("/human-outputs/{file_id}")
def delete_human_output(
    file_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(require_role("admin", "editor"))
):
    f = db.query(models.HumanOutput).filter(models.HumanOutput.id == file_id).first()
    if not f:
        raise HTTPException(status_code=404, detail="File not found")
    storage.delete_file(f.storage_path)
    audit_service.log_action(db, user.id, "delete", "human_output", resource_id=f.id, old_value={"filename": f.filename})
    db.delete(f)
    db.commit()
    return {"message": "Deleted"}


@router.get("/human-outputs/{file_id}/annotations", response_model=List[schemas.HumanOutputAnnotationOut])
def list_human_output_annotations(
    file_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    return db.query(models.HumanOutputAnnotation).filter(
        models.HumanOutputAnnotation.human_output_id == file_id
    ).order_by(models.HumanOutputAnnotation.created_at.asc()).all()


@router.post("/human-outputs/{file_id}/annotations", response_model=schemas.HumanOutputAnnotationOut)
def create_human_output_annotation(
    file_id: str,
    data: schemas.HumanOutputAnnotationCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    annotation = models.HumanOutputAnnotation(
        human_output_id=file_id,
        user_id=user.id,
        username=user.username,
        start_offset=data.start_offset,
        end_offset=data.end_offset,
        selected_text=data.selected_text,
        content=data.content,
    )
    db.add(annotation)
    db.commit()
    db.refresh(annotation)
    return annotation


@router.delete("/human-outputs/{file_id}/annotations/{annotation_id}")
def delete_human_output_annotation(
    file_id: str,
    annotation_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    annotation = db.query(models.HumanOutputAnnotation).filter(
        models.HumanOutputAnnotation.id == annotation_id,
        models.HumanOutputAnnotation.human_output_id == file_id,
    ).first()
    if not annotation:
        raise HTTPException(status_code=404, detail="Annotation not found")
    if annotation.user_id != user.id and user.role != "admin":
        raise HTTPException(status_code=403, detail="Permission denied")
    db.delete(annotation)
    db.commit()
    return {"message": "Deleted"}
