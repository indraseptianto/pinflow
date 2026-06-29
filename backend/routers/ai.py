from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session
from database import get_session
from models import AppSettings, Product, PinDraft
from pydantic import BaseModel
from typing import Optional
from routers.settings import get_settings_row
import json

router = APIRouter(prefix="/ai", tags=["ai"])


class GenerateTextRequest(BaseModel):
    product_id: int
    extra_instruction: Optional[str] = ""
    style_preset: Optional[str] = "minimal-clean"
    angle_instruction: Optional[str] = ""


class GenerateImageRequest(BaseModel):
    product_id: int
    extra_instruction: Optional[str] = ""
    style_preset: Optional[str] = "minimal-clean"
    angle_instruction: Optional[str] = ""


class GenerateAllRequest(BaseModel):
    product_id: int
    extra_instruction: Optional[str] = ""
    style_preset: Optional[str] = "minimal-clean"


class GenerateVariantsRequest(BaseModel):
    product_id: int
    extra_instruction: Optional[str] = ""
    style_preset: Optional[str] = "minimal-clean"
    count: int = 3


@router.get("/style-presets")
def style_presets():
    from services.prompt_builder import list_style_presets, VARIANT_ANGLES
    return {"styles": list_style_presets(), "variant_angles": VARIANT_ANGLES}


@router.post("/generate/text")
async def generate_text(body: GenerateTextRequest, session: Session = Depends(get_session)):
    row = get_settings_row(session)
    _require_ai(row)

    product = session.get(Product, body.product_id)
    if not product:
        raise HTTPException(404, "Product not found")

    from services.ai_text import generate_pin_text
    from services.prompt_builder import build_text_instruction
    try:
        result = await generate_pin_text(
            title=product.title,
            description=product.description_raw,
            price=product.price,
            shop_name=product.shop_name,
            niche=None,
            endpoint=row.ai_router_endpoint,
            api_key=row.ai_router_api_key,
            model=row.ai_text_model,
            extra_instruction=build_text_instruction(body.style_preset, body.angle_instruction or "", body.extra_instruction or ""),
        )
        return {"ok": True, **result}
    except Exception as e:
        raise HTTPException(502, f"AI text generation failed: {str(e)}")


class SEOScoreRequest(BaseModel):
    product_id: int
    title: Optional[str] = ""
    description: Optional[str] = ""
    tags: Optional[str] = ""


@router.post("/seo-score")
async def seo_score(body: SEOScoreRequest, session: Session = Depends(get_session)):
    """Calculate Pinterest SEO score for a pin."""
    row = get_settings_row(session)
    _require_ai(row)

    product = session.get(Product, body.product_id)
    if not product:
        raise HTTPException(404, "Product not found")

    from services.ai_text import calculate_seo_score
    try:
        score = await calculate_seo_score(
            title=body.title or product.title,
            description=body.description or product.description_raw,
            tags=body.tags or "",
            endpoint=row.ai_router_endpoint,
            api_key=row.ai_router_api_key,
            model=row.ai_text_model,
        )
        return {"ok": True, **score}
    except Exception as e:
        raise HTTPException(502, f"SEO score failed: {str(e)}")


class BoardRecRequest(BaseModel):
    product_id: int
    social_media_id: str


@router.post("/board-recommendation")
async def board_recommendation(body: BoardRecRequest, session: Session = Depends(get_session)):
    """Recommend best Pinterest board for a product."""
    row = get_settings_row(session)
    if not row.postfast_api_key:
        raise HTTPException(400, "PostFast API key not configured in Settings")

    product = session.get(Product, body.product_id)
    if not product:
        raise HTTPException(404, "Product not found")

    from services.postfast_client import get_pinterest_boards
    boards = await get_pinterest_boards(row.postfast_api_key, body.social_media_id)

    from services.ai_text import recommend_board
    try:
        rec = await recommend_board(
            product_title=product.title,
            product_tags=product.description_raw,
            boards=boards,
            endpoint=row.ai_router_endpoint,
            api_key=row.ai_router_api_key,
            model=row.ai_text_model,
        )
        return {"ok": True, "recommendation": rec, "boards": boards}
    except Exception as e:
        raise HTTPException(502, f"Board recommendation failed: {str(e)}")


@router.post("/generate/image")
async def generate_image(body: GenerateImageRequest, session: Session = Depends(get_session)):
    product = session.get(Product, body.product_id)
    if not product:
        raise HTTPException(404, "Product not found")

    images = json.loads(product.original_images or "[]")
    if images:
        return {"ok": True, "image_url": images[0], "image_b64": None, "skipped_ai_image": True}
    raise HTTPException(400, "No product image found. Paste/upload a product image first.")


@router.post("/generate/all")
async def generate_all(body: GenerateAllRequest, session: Session = Depends(get_session)):
    """Generate text + image in parallel for a product, return draft data."""
    import asyncio
    row = get_settings_row(session)
    _require_ai(row)

    product = session.get(Product, body.product_id)
    if not product:
        raise HTTPException(404, "Product not found")

    images = json.loads(product.original_images or "[]")
    from services.ai_text import generate_pin_text
    from services.prompt_builder import build_text_instruction, VARIANT_ANGLES

    angle_instruction = VARIANT_ANGLES[0]["instruction"]
    text_task = generate_pin_text(
        title=product.title,
        description=product.description_raw,
        price=product.price,
        shop_name=product.shop_name,
        niche=None,
        endpoint=row.ai_router_endpoint,
        api_key=row.ai_router_api_key,
        model=row.ai_text_model,
        extra_instruction=build_text_instruction(body.style_preset, angle_instruction, body.extra_instruction or ""),
    )
    image_url = images[0] if images else None

    try:
        text_result = await text_task
    except Exception as e:
        raise HTTPException(502, f"AI generation failed: {str(e)}")

    return {
        "ok": True,
        "title": text_result["title"],
        "description": text_result["description"],
        "tags": text_result["tags"],
        "image_b64": None,
        "image_url": image_url,
        "pinterest_link": product.source_url,
        "model_used_text": row.ai_text_model,
        "model_used_image": None,
    }


@router.post("/generate/variants")
async def generate_variants(body: GenerateVariantsRequest, session: Session = Depends(get_session)):
    """Generate up to 3 Pinterest pin variants using different strategic angles."""
    import asyncio
    row = get_settings_row(session)
    _require_ai(row)

    product = session.get(Product, body.product_id)
    if not product:
        raise HTTPException(404, "Product not found")

    from services.ai_text import generate_pin_text
    from services.prompt_builder import build_text_instruction, VARIANT_ANGLES

    images = json.loads(product.original_images or "[]")
    angles = VARIANT_ANGLES[: max(1, min(body.count, 3))]

    async def one_variant(angle: dict):
        text = await generate_pin_text(
            title=product.title,
            description=product.description_raw,
            price=product.price,
            shop_name=product.shop_name,
            niche=None,
            endpoint=row.ai_router_endpoint,
            api_key=row.ai_router_api_key,
            model=row.ai_text_model,
            extra_instruction=build_text_instruction(body.style_preset, angle["instruction"], body.extra_instruction or ""),
        )
        image_url = images[0] if images else None
        return {
            "angle_key": angle["key"],
            "angle_label": angle["label"],
            "title": text["title"],
            "description": text["description"],
            "tags": text["tags"],
            "image_b64": None,
            "image_url": image_url,
            "pinterest_link": product.source_url,
            "model_used_text": row.ai_text_model,
            "model_used_image": None,
            "style_preset": body.style_preset,
        }

    try:
        variants = await asyncio.gather(*(one_variant(a) for a in angles))
    except Exception as e:
        raise HTTPException(502, f"AI variant generation failed: {str(e)}")

    return {"ok": True, "variants": variants}


def _require_ai(row: AppSettings):
    if not row.ai_router_api_key:
        raise HTTPException(400, "AI Router API key not configured. Go to Settings.")
