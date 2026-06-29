from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select
from database import get_session
from models import Product, AppSettings
from pydantic import BaseModel
from typing import Optional
import json

router = APIRouter(prefix="/products", tags=["products"])


class ParseRequest(BaseModel):
    url: str


def detect_marketplace(url: str) -> str:
    if "etsy.com" in url:
        return "etsy"
    return "unknown"


class CreateManualRequest(BaseModel):
    title: str
    description_raw: str = ""
    price: Optional[str] = None
    shop_name: Optional[str] = None
    source_url: str = "manual"
    original_images: Optional[list] = []


class UpdateImagesRequest(BaseModel):
    original_images: list[str] = []


@router.post("/parse")
async def parse_product(body: ParseRequest, session: Session = Depends(get_session)):
    marketplace = detect_marketplace(body.url)
    if marketplace == "unknown":
        raise HTTPException(400, "Marketplace not supported. Only Etsy supported in v1.")

    from services.parser_etsy import parse_etsy
    try:
        data = await parse_etsy(body.url)
    except Exception as e:
        raise HTTPException(422, f"Failed to parse product page: {str(e)}")

    if not data.get("title"):
        raise HTTPException(422, "Could not extract product data. Try filling in manually.")

    # Check if already exists
    existing = session.exec(select(Product).where(Product.source_url == body.url)).first()
    if existing:
        return {"product": _product_to_dict(existing), "cached": True}

    product = Product(
        source_marketplace=marketplace,
        source_url=body.url,
        title=data["title"],
        description_raw=data.get("description_raw", ""),
        price=data.get("price"),
        original_images=json.dumps(data.get("original_images", [])),
        shop_name=data.get("shop_name"),
    )
    session.add(product)
    session.commit()
    session.refresh(product)

    return {"product": _product_to_dict(product), "cached": False}


@router.post("/manual")
async def create_manual_product(body: CreateManualRequest, session: Session = Depends(get_session)):
    """Manual product entry — used when marketplace parser fails."""
    product = Product(
        source_marketplace="manual",
        source_url=body.source_url,
        title=body.title,
        description_raw=body.description_raw,
        price=body.price,
        original_images=json.dumps(body.original_images or []),
        shop_name=body.shop_name,
    )
    session.add(product)
    session.commit()
    session.refresh(product)
    return {"product": _product_to_dict(product), "cached": False}


@router.get("")
def list_products(session: Session = Depends(get_session)):
    products = session.exec(select(Product).order_by(Product.created_at.desc())).all()
    return [_product_to_dict(p) for p in products]


@router.put("/{product_id}/images")
def update_product_images(product_id: int, body: UpdateImagesRequest, session: Session = Depends(get_session)):
    product = session.get(Product, product_id)
    if not product:
        raise HTTPException(404, "Product not found")
    images = [url.strip() for url in body.original_images if isinstance(url, str) and url.strip()]
    product.original_images = json.dumps(images)
    session.add(product)
    session.commit()
    session.refresh(product)
    return {"product": _product_to_dict(product)}


@router.get("/{product_id}")
def get_product(product_id: int, session: Session = Depends(get_session)):
    p = session.get(Product, product_id)
    if not p:
        raise HTTPException(404, "Product not found")
    return _product_to_dict(p)


def _product_to_dict(p: Product) -> dict:
    return {
        "id": p.id,
        "source_marketplace": p.source_marketplace,
        "source_url": p.source_url,
        "title": p.title,
        "description_raw": p.description_raw,
        "price": p.price,
        "original_images": json.loads(p.original_images or "[]"),
        "shop_name": p.shop_name,
        "created_at": p.created_at.isoformat() if p.created_at else None,
    }
