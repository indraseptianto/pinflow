import httpx
from bs4 import BeautifulSoup
from typing import Optional
from urllib.parse import urlparse, unquote
import re
import json


ETSY_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
}


async def parse_etsy(url: str) -> dict:
    try:
        async with httpx.AsyncClient(follow_redirects=True, timeout=20) as client:
            r = await client.get(url, headers=ETSY_HEADERS)
            r.raise_for_status()
            html = r.text
    except httpx.HTTPStatusError as exc:
        # ponytail: Etsy DataDome blocks VPS traffic; upgrade path is official Etsy API key or browser-render worker.
        if exc.response.status_code == 403:
            return _parse_from_url(url)
        raise

    soup = BeautifulSoup(html, "lxml")

    # Try structured data first (JSON-LD)
    result = _parse_json_ld(soup)
    if result:
        result = _enrich_from_html(soup, result)
        return result

    # Fallback to Open Graph + meta
    result = _parse_og(soup, url)
    return result if result.get("title") else _parse_from_url(url)


def _parse_json_ld(soup: BeautifulSoup) -> Optional[dict]:
    for tag in soup.find_all("script", type="application/ld+json"):
        try:
            data = json.loads(tag.string or "")
            if isinstance(data, list):
                data = next((d for d in data if d.get("@type") in ("Product", "ItemPage")), None)
            if not data:
                continue
            if data.get("@type") == "Product":
                images = data.get("image", [])
                if isinstance(images, str):
                    images = [images]
                offers = data.get("offers", {})
                if isinstance(offers, list):
                    offers = offers[0] if offers else {}
                price = None
                if offers.get("price"):
                    currency = offers.get("priceCurrency", "")
                    price = f"{currency} {offers['price']}".strip()
                return {
                    "title": data.get("name", ""),
                    "description_raw": data.get("description", ""),
                    "original_images": images[:5],
                    "price": price,
                    "shop_name": None,
                    "source_marketplace": "etsy",
                }
        except Exception:
            continue
    return None


def _enrich_from_html(soup: BeautifulSoup, data: dict) -> dict:
    # Shop name
    if not data.get("shop_name"):
        shop_el = soup.select_one("a[href*='/shop/']")
        if shop_el:
            data["shop_name"] = shop_el.get_text(strip=True)

    # Extra images from listing page
    if len(data.get("original_images", [])) < 2:
        imgs = []
        for img in soup.select("img[src*='etsystatic']"):
            src = img.get("src", "")
            # Upgrade to fullsize
            src = re.sub(r"_\d+x\d+\.", "_1588xN.", src)
            if src not in imgs:
                imgs.append(src)
        if imgs:
            data["original_images"] = imgs[:5]

    return data


def _parse_from_url(url: str) -> dict:
    path = unquote(urlparse(url).path)
    match = re.search(r"/listing/\d+/([^/?#]+)", path)
    slug = match.group(1) if match else "etsy-product"
    title = re.sub(r"[-_]+", " ", slug).strip().title()
    return {
        "title": title or "Etsy Product",
        "description_raw": f"Imported from Etsy listing: {url}",
        "original_images": [],
        "price": None,
        "shop_name": None,
        "source_marketplace": "etsy",
    }


def _parse_og(soup: BeautifulSoup, url: str) -> dict:
    def og(prop):
        tag = soup.find("meta", property=f"og:{prop}") or soup.find("meta", attrs={"name": f"og:{prop}"})
        return tag["content"].strip() if tag and tag.get("content") else ""

    title = og("title") or soup.title.string if soup.title else ""
    description = og("description") or ""
    image = og("image")
    images = [image] if image else []

    return {
        "title": title,
        "description_raw": description,
        "original_images": images,
        "price": None,
        "shop_name": None,
        "source_marketplace": "etsy",
    }
