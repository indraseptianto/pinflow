import httpx
import base64
import io
from typing import Optional
from PIL import Image


async def generate_pin_image(
    product_title: str,
    product_description: str,
    product_image_url: Optional[str],
    endpoint: str,
    api_key: str,
    model: str,
    extra_instruction: str = "",
    prompt_override: Optional[str] = None,
) -> str:
    """
    Generate a Pinterest-style vertical image (2:3 ratio, 1000x1500).
    Returns base64-encoded JPEG string.
    Uses OpenAI-compatible image generation endpoint.
    """
    prompt = prompt_override or (
        f"Pinterest pin image for product: {product_title}. "
        f"Style: clean, bright, aesthetic, lifestyle product photography. "
        f"Vertical format 2:3 ratio. "
        f"Product context: {product_description[:200]}. "
        f"High quality, eye-catching, suitable for Pinterest. "
        f"No text overlay."
        f"{' ' + extra_instruction if extra_instruction else ''}"
    )

    async with httpx.AsyncClient(timeout=120) as client:
        r = await client.post(
            f"{endpoint.rstrip('/')}/images/generations",
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json={
                "model": model,
                "prompt": prompt,
                "n": 1,
                "size": "1024x1536",
                "response_format": "b64_json",
            },
        )
        r.raise_for_status()

    data = r.json()
    b64 = data["data"][0].get("b64_json") or data["data"][0].get("b64json", "")

    # Compress to ≤10MB JPEG
    img_bytes = base64.b64decode(b64)
    img = Image.open(io.BytesIO(img_bytes)).convert("RGB")

    # Resize to exactly 1000x1500
    img = img.resize((1000, 1500), Image.LANCZOS)

    buf = io.BytesIO()
    quality = 90
    while True:
        buf.seek(0)
        buf.truncate()
        img.save(buf, format="JPEG", quality=quality, optimize=True)
        if buf.tell() <= 9_500_000 or quality <= 60:
            break
        quality -= 5

    return base64.b64encode(buf.getvalue()).decode()
