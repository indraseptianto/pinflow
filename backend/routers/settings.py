from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select
from database import get_session
from models import AppSettings
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
import httpx

router = APIRouter(prefix="/settings", tags=["settings"])


class SettingsUpdate(BaseModel):
    ai_router_endpoint: Optional[str] = None
    ai_router_api_key: Optional[str] = None
    ai_text_model: Optional[str] = None
    ai_image_model: Optional[str] = None
    postfast_api_key: Optional[str] = None
    default_board_id: Optional[str] = None
    default_social_media_id: Optional[str] = None


def get_settings_row(session: Session) -> AppSettings:
    row = session.get(AppSettings, 1)
    if not row:
        row = AppSettings()
        session.add(row)
        session.commit()
        session.refresh(row)
    return row


@router.get("")
def read_settings(session: Session = Depends(get_session)):
    row = get_settings_row(session)
    return {
        "ai_router_endpoint": row.ai_router_endpoint,
        "ai_router_api_key": "***" if row.ai_router_api_key else "",
        "ai_text_model": row.ai_text_model,
        "ai_image_model": row.ai_image_model,
        "postfast_api_key": "***" if row.postfast_api_key else "",
        "default_board_id": row.default_board_id,
        "default_social_media_id": row.default_social_media_id,
    }


@router.put("")
def update_settings(body: SettingsUpdate, session: Session = Depends(get_session)):
    row = get_settings_row(session)
    for field, val in body.model_dump(exclude_none=True).items():
        if val != "***":   # skip masked placeholders
            setattr(row, field, val)
    row.updated_at = datetime.utcnow()
    session.add(row)
    session.commit()
    session.refresh(row)
    return {"ok": True}


@router.post("/test-ai")
async def test_ai_connection(session: Session = Depends(get_session)):
    row = get_settings_row(session)
    if not row.ai_router_api_key:
        raise HTTPException(400, "AI API key not set")
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(
                f"{row.ai_router_endpoint.rstrip('/')}/models",
                headers={"Authorization": f"Bearer {row.ai_router_api_key}"},
            )
        if r.status_code == 200:
            return {"ok": True, "models_count": len(r.json().get("data", []))}
        return {"ok": False, "status": r.status_code, "detail": r.text[:200]}
    except Exception as e:
        return {"ok": False, "error": str(e)}


@router.post("/sync-accounts")
async def sync_accounts(session: Session = Depends(get_session)):
    row = get_settings_row(session)
    if not row.postfast_api_key:
        raise HTTPException(400, "PostFast API key not set")
    from services.postfast_client import PostFastClient
    try:
        client = PostFastClient(row.postfast_api_key)
        accounts = await client.get_accounts()
        return {"ok": True, "accounts": accounts}
    except Exception as e:
        return {"ok": False, "error": str(e)}


@router.post("/sync-boards/{social_media_id}")
async def sync_boards(social_media_id: str, session: Session = Depends(get_session)):
    row = get_settings_row(session)
    if not row.postfast_api_key:
        raise HTTPException(400, "PostFast API key not set")
    from services.postfast_client import PostFastClient
    try:
        client = PostFastClient(row.postfast_api_key)
        boards = await client.get_boards(social_media_id)
        return {"ok": True, "boards": boards}
    except Exception as e:
        return {"ok": False, "error": str(e)}
