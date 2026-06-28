from typing import Optional, List
from datetime import datetime
from sqlmodel import SQLModel, Field, JSON, Column
from sqlalchemy import Text
import json


class AppSettings(SQLModel, table=True):
    __tablename__ = "app_settings"
    id: Optional[int] = Field(default=1, primary_key=True)
    ai_router_endpoint: str = "https://9router.indraseptianto.my.id/v1"
    ai_router_api_key: str = ""
    ai_text_model: str = "cx/gpt-5.5"
    ai_image_model: str = "cx/flux-1-schnell"
    postfast_api_key: str = ""
    default_board_id: Optional[str] = None
    default_social_media_id: Optional[str] = None
    updated_at: Optional[datetime] = Field(default_factory=datetime.utcnow)


class Product(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    source_marketplace: str = "etsy"
    source_url: str
    title: str
    description_raw: str = Field(sa_column=Column(Text))
    price: Optional[str] = None
    original_images: str = "[]"   # JSON array of URLs
    shop_name: Optional[str] = None
    created_at: Optional[datetime] = Field(default_factory=datetime.utcnow)

    def get_images(self) -> List[str]:
        return json.loads(self.original_images or "[]")

    def set_images(self, images: List[str]):
        self.original_images = json.dumps(images)


class PinDraft(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    product_id: Optional[int] = Field(default=None, foreign_key="product.id")
    generated_image_url: Optional[str] = None
    generated_image_local: Optional[str] = None   # local path if stored
    title: Optional[str] = None
    description: Optional[str] = None
    tags: str = "[]"   # JSON array
    pinterest_link: Optional[str] = None
    status: str = "draft"   # draft|reviewed|ready|scheduled|published|failed
    model_used_text: Optional[str] = None
    model_used_image: Optional[str] = None
    postfast_post_id: Optional[str] = None
    created_at: Optional[datetime] = Field(default_factory=datetime.utcnow)
    updated_at: Optional[datetime] = Field(default_factory=datetime.utcnow)

    def get_tags(self) -> List[str]:
        return json.loads(self.tags or "[]")

    def set_tags(self, tags: List[str]):
        self.tags = json.dumps(tags)


class ScheduleEntry(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    pin_draft_id: Optional[int] = Field(default=None, foreign_key="pindraft.id")
    postfast_post_id: Optional[str] = None
    social_media_id: Optional[str] = None
    board_id: Optional[str] = None
    scheduled_at: Optional[datetime] = None
    status: str = "scheduled"   # scheduled|published|failed|draft
    error_message: Optional[str] = None
    created_at: Optional[datetime] = Field(default_factory=datetime.utcnow)
