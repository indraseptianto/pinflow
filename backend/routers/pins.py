from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select
from database import get_session
from models import PinDraft, Product, ScheduleEntry
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
from routers.settings import get_settings_row
import base64
import httpx
import json

router = APIRouter(prefix="/pins", tags=["pins"])


class CreatePinRequest(BaseModel):
    product_id: int
    title: str
    description: str
    tags: List[str] = []
    image_b64: Optional[str] = None
    generated_image_url: Optional[str] = None
    pinterest_link: Optional[str] = None
    model_used_text: Optional[str] = None
    model_used_image: Optional[str] = None


class UpdatePinRequest(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    tags: Optional[List[str]] = None
    generated_image_url: Optional[str] = None
    image_b64: Optional[str] = None
    pinterest_link: Optional[str] = None
    status: Optional[str] = None


class ScheduleRequest(BaseModel):
    social_media_id: str
    board_id: str
    scheduled_at: Optional[datetime] = None
    draft: bool = False


@router.post("")
def create_pin(body: CreatePinRequest, session: Session = Depends(get_session)):
    pin = PinDraft(
        product_id=body.product_id,
        title=body.title,
        description=body.description,
        tags=json.dumps(body.tags),
        generated_image_url=body.generated_image_url,
        pinterest_link=body.pinterest_link or _get_product_url(session, body.product_id),
        model_used_text=body.model_used_text,
        model_used_image=body.model_used_image,
        status="draft",
    )
    # Store image_b64 as data URL for easy rendering
    if body.image_b64:
        pin.generated_image_url = f"data:image/jpeg;base64,{body.image_b64}"
    session.add(pin)
    session.commit()
    session.refresh(pin)
    return _pin_to_dict(pin)


@router.get("")
def list_pins(session: Session = Depends(get_session)):
    pins = session.exec(select(PinDraft).order_by(PinDraft.created_at.desc())).all()
    return [_pin_to_dict(p) for p in pins]


@router.get("/{pin_id}")
def get_pin(pin_id: int, session: Session = Depends(get_session)):
    pin = session.get(PinDraft, pin_id)
    if not pin:
        raise HTTPException(404, "Pin not found")
    return _pin_to_dict(pin)


@router.put("/{pin_id}")
def update_pin(pin_id: int, body: UpdatePinRequest, session: Session = Depends(get_session)):
    pin = session.get(PinDraft, pin_id)
    if not pin:
        raise HTTPException(404, "Pin not found")
    if body.title is not None:
        pin.title = body.title[:100]
    if body.description is not None:
        pin.description = body.description[:800]
    if body.tags is not None:
        pin.tags = json.dumps(body.tags[:10])
    if body.pinterest_link is not None:
        pin.pinterest_link = body.pinterest_link
    if body.status is not None:
        pin.status = body.status
    if body.image_b64 is not None:
        pin.generated_image_url = f"data:image/jpeg;base64,{body.image_b64}"
    elif body.generated_image_url is not None:
        pin.generated_image_url = body.generated_image_url
    pin.updated_at = datetime.utcnow()
    session.add(pin)
    session.commit()
    session.refresh(pin)
    return _pin_to_dict(pin)


@router.delete("/{pin_id}")
def delete_pin(pin_id: int, session: Session = Depends(get_session)):
    pin = session.get(PinDraft, pin_id)
    if not pin:
        raise HTTPException(404, "Pin not found")
    session.delete(pin)
    session.commit()
    return {"ok": True}


@router.post("/{pin_id}/schedule")
async def schedule_pin(pin_id: int, body: ScheduleRequest, session: Session = Depends(get_session)):
    pin = session.get(PinDraft, pin_id)
    if not pin:
        raise HTTPException(404, "Pin not found")
    if not pin.generated_image_url:
        raise HTTPException(400, "Pin has no image. Generate image first.")

    row = get_settings_row(session)
    if not row.postfast_api_key:
        raise HTTPException(400, "PostFast API key not configured.")

    from services.postfast_client import PostFastClient
    client = PostFastClient(row.postfast_api_key)

    # Extract base64 from data URL, or download remote image URL and convert to base64.
    img_url = pin.generated_image_url or ""
    if img_url.startswith("data:image"):
        b64 = img_url.split(",", 1)[1]
    elif img_url.startswith("http://") or img_url.startswith("https://"):
        b64 = await _remote_image_to_b64(img_url)
    else:
        raise HTTPException(400, "Pin has no valid image URL. Paste a product image URL first.")

    try:
        media_key = await client.upload_image(b64)
        post = await client.create_post(
            social_media_id=body.social_media_id,
            media_key=media_key,
            title=pin.title or "",
            description=pin.description or "",
            tags=json.loads(pin.tags or "[]"),
            board_id=body.board_id,
            pinterest_link=pin.pinterest_link or "",
            scheduled_at=body.scheduled_at,
            draft=body.draft,
        )
    except Exception as e:
        raise HTTPException(502, f"PostFast error: {str(e)}")

    postfast_id = post.get("id") or post.get("postId", "")
    pin.status = "draft" if body.draft else "scheduled"
    pin.postfast_post_id = str(postfast_id)
    pin.updated_at = datetime.utcnow()

    entry = ScheduleEntry(
        pin_draft_id=pin_id,
        postfast_post_id=str(postfast_id),
        social_media_id=body.social_media_id,
        board_id=body.board_id,
        scheduled_at=body.scheduled_at,
        status="draft" if body.draft else "scheduled",
    )
    session.add(pin)
    session.add(entry)
    session.commit()
    return {"ok": True, "postfast_post_id": postfast_id, "status": pin.status}


@router.post("/sync-status")
async def sync_status(session: Session = Depends(get_session)):
    """Poll PostFast for latest pin statuses."""
    row = get_settings_row(session)
    if not row.postfast_api_key:
        raise HTTPException(400, "PostFast API key not configured.")
    from services.postfast_client import PostFastClient
    client = PostFastClient(row.postfast_api_key)
    try:
        posts = await client.get_posts()
    except Exception as e:
        raise HTTPException(502, f"PostFast sync failed: {str(e)}")

    updated = 0
    for post in posts:
        pid = str(post.get("id", ""))
        status_raw = post.get("status", "").upper()
        mapped = {"SCHEDULED": "scheduled", "PUBLISHED": "published", "FAILED": "failed", "DRAFT": "draft"}.get(status_raw, "scheduled")
        pin = session.exec(select(PinDraft).where(PinDraft.postfast_post_id == pid)).first()
        if pin and pin.status != mapped:
            pin.status = mapped
            session.add(pin)
            updated += 1

    session.commit()
    return {"ok": True, "synced": len(posts), "updated": updated}


@router.delete("/{pin_id}/cancel")
async def cancel_pin(pin_id: int, session: Session = Depends(get_session)):
    pin = session.get(PinDraft, pin_id)
    if not pin:
        raise HTTPException(404, "Pin not found")
    if not pin.postfast_post_id:
        raise HTTPException(400, "No PostFast post ID to cancel.")
    row = get_settings_row(session)
    from services.postfast_client import PostFastClient
    client = PostFastClient(row.postfast_api_key)
    ok = await client.delete_post(pin.postfast_post_id)
    if ok:
        pin.status = "draft"
        pin.postfast_post_id = None
        pin.updated_at = datetime.utcnow()
        session.add(pin)
        session.commit()
    return {"ok": ok}


async def _remote_image_to_b64(url: str) -> str:
    async with httpx.AsyncClient(timeout=45, follow_redirects=True) as client:
        response = await client.get(url)
        response.raise_for_status()
        content_type = response.headers.get("content-type", "")
        if not content_type.startswith("image/"):
            raise HTTPException(400, "Image URL did not return an image file.")
        return base64.b64encode(response.content).decode()


def _get_product_url(session: Session, product_id: int) -> Optional[str]:
    p = session.get(Product, product_id)
    return p.source_url if p else None


def _pin_to_dict(pin: PinDraft) -> dict:
    return {
        "id": pin.id,
        "product_id": pin.product_id,
        "title": pin.title,
        "description": pin.description,
        "tags": json.loads(pin.tags or "[]"),
        "generated_image_url": pin.generated_image_url,
        "pinterest_link": pin.pinterest_link,
        "status": pin.status,
        "model_used_text": pin.model_used_text,
        "model_used_image": pin.model_used_image,
        "postfast_post_id": pin.postfast_post_id,
        "created_at": pin.created_at.isoformat() if pin.created_at else None,
        "updated_at": pin.updated_at.isoformat() if pin.updated_at else None,
    }
