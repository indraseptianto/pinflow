import httpx
import base64
from typing import Optional
from datetime import datetime, timezone, timedelta


class PostFastClient:
    BASE = "https://api.postfa.st"

    def __init__(self, api_key: str):
        self.api_key = api_key
        self.headers = {"pf-api-key": api_key, "Content-Type": "application/json"}

    def _client(self):
        return httpx.AsyncClient(base_url=self.BASE, headers=self.headers, timeout=30)

    async def get_accounts(self) -> list:
        async with self._client() as c:
            r = await c.get("/social-media/my-social-accounts")
            r.raise_for_status()
            return r.json()

    async def get_boards(self, social_media_id: str) -> list:
        async with self._client() as c:
            r = await c.get(f"/social-media/{social_media_id}/pinterest-boards")
            r.raise_for_status()
            return r.json()

    async def upload_image(self, image_b64: str) -> str:
        """Upload image to PostFast S3 and return the media key for mediaItems[].key."""
        async with self._client() as c:
            r = await c.post(
                "/file/get-signed-upload-urls",
                json={"contentType": "image/jpeg", "count": 1},
            )
            r.raise_for_status()
            upload_data = r.json()

        item = upload_data[0]
        signed_url = item["signedUrl"]
        media_key = item["key"]

        img_bytes = base64.b64decode(image_b64)
        async with httpx.AsyncClient(timeout=60) as c:
            r = await c.put(
                signed_url,
                content=img_bytes,
                headers={"Content-Type": "image/jpeg"},
            )
            r.raise_for_status()

        return media_key

    async def create_post(
        self,
        social_media_id: str,
        media_key: str,
        title: str,
        description: str,
        tags: list,
        board_id: str,
        pinterest_link: str,
        scheduled_at: Optional[datetime] = None,
        draft: bool = False,
    ) -> dict:
        title = (title or "")[:100]
        tag_text = " ".join(f"#{str(t).replace(' ', '')}" for t in tags if str(t).strip())
        desc = f"{description or ''}\n\n{tag_text}".strip()[:800]
        content = f"{title}\n\n{desc}".strip()[:900]

        if scheduled_at:
            if scheduled_at.tzinfo is None:
                scheduled_at = scheduled_at.replace(tzinfo=timezone.utc)
            if scheduled_at < datetime.now(timezone.utc) + timedelta(minutes=2):
                scheduled_at = datetime.now(timezone.utc) + timedelta(minutes=2)
        else:
            scheduled_at = datetime.now(timezone.utc) + timedelta(minutes=2)

        post = {
            "content": content,
            "mediaItems": [{"key": media_key, "type": "IMAGE", "sortOrder": 0}],
            "socialMediaId": social_media_id,
            "status": "DRAFT" if draft else "SCHEDULED",
            "approvalStatus": "APPROVED",
        }
        if not draft:
            post["scheduledAt"] = scheduled_at.isoformat()

        body = {
            "posts": [post],
            "controls": {
                "pinterestBoardId": board_id,
                "pinterestLink": pinterest_link,
            },
        }

        async with self._client() as c:
            r = await c.post("/social-posts", json=body)
            try:
                r.raise_for_status()
            except httpx.HTTPStatusError as exc:
                detail = exc.response.text[:1000]
                raise RuntimeError(f"PostFast create_post failed {exc.response.status_code}: {detail}") from exc
            return r.json()

    async def get_posts(self, limit: int = 50) -> list:
        async with self._client() as c:
            r = await c.get("/social-posts", params={"limit": min(limit, 50), "platforms": "PINTEREST"})
            r.raise_for_status()
            data = r.json()
            return data.get("data", data if isinstance(data, list) else [])

    async def delete_post(self, post_id: str) -> bool:
        async with self._client() as c:
            r = await c.delete(f"/social-posts/{post_id}")
            if r.status_code == 404:
                return False
            r.raise_for_status()
            return True
