import httpx
import json
import re
from typing import Optional

GENERATED_META_RE = re.compile(r"\bGenerated\s+\d{4}-\d{2}-\d{2}T[^|\n]+\s*\|\s*Source:\s*\w+\b", re.I)


def clean_ai_text(value: object) -> str:
    text = GENERATED_META_RE.sub("", str(value or ""))
    return " ".join(text.split())


async def generate_pin_text(
    title: str,
    description: str,
    price: Optional[str],
    shop_name: Optional[str],
    niche: Optional[str],
    endpoint: str,
    api_key: str,
    model: str,
    extra_instruction: str = "",
) -> dict:
    system = (
        "You are a Pinterest SEO expert. Generate Pinterest pin copy for a marketplace product. "
        "Return ONLY valid JSON with keys: title (max 100 chars, catchy & SEO-friendly), "
        "description (max 800 chars, engaging, soft CTA, ends with product link placeholder [LINK]), "
        "tags (array of 5-10 SEO keywords, no # prefix). "
        "Language: match the product language (English for English products, Bahasa Indonesia for ID products). "
        "Do NOT include any explanation outside the JSON."
    )

    user_msg = f"""Product title: {title}
Product description: {description}
Price: {price or 'not specified'}
Shop: {shop_name or 'not specified'}
Niche/category: {niche or 'general'}
{f'Extra instruction: {extra_instruction}' if extra_instruction else ''}

Generate catchy Pinterest pin copy."""

    async with httpx.AsyncClient(timeout=60) as client:
        r = await client.post(
            f"{endpoint.rstrip('/')}/chat/completions",
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json={
                "model": model,
                "messages": [
                    {"role": "system", "content": system},
                    {"role": "user", "content": user_msg},
                ],
                "temperature": 0.7,
                "response_format": {"type": "json_object"},
            },
        )
        r.raise_for_status()

    content = r.json()["choices"][0]["message"]["content"]
    data = json.loads(content)

    pin_title = clean_ai_text(data.get("title", title))[:100]
    pin_description = clean_ai_text(data.get("description", ""))[:800]
    tags = [clean_ai_text(t).lstrip("#") for t in data.get("tags", []) if clean_ai_text(t)][:10]

    return {"title": pin_title, "description": pin_description, "tags": tags}


async def calculate_seo_score(
    title: str,
    description: str,
    tags: str,
    endpoint: str,
    api_key: str,
    model: str,
) -> dict:
    """Calculate Pinterest SEO score using rules + optional LLM critique."""

    # Rule-based scoring
    score = 0
    breakdown = []
    suggestions = []

    title_len = len(title)
    desc_len = len(description)
    tag_count = len([t for t in tags.split(",") if t.strip()]) if isinstance(tags, str) else 0

    if title_len <= 100 and title_len > 0:
        score += 20
        breakdown.append("title_length_ok")
    elif title_len > 100:
        breakdown.append("title_too_long")
        suggestions.append(f"Title too long ({title_len}/100 chars). Shorten it.")

    if 50 <= title_len <= 80:
        score += 10
        breakdown.append("title_optimal_length")

    if desc_len >= 100 and desc_len <= 700:
        score += 20
        breakdown.append("description_good_length")
    elif desc_len < 100:
        breakdown.append("description_too_short")
        suggestions.append("Description too short. Aim for 100-700 characters.")
    elif desc_len > 800:
        breakdown.append("description_too_long")
        suggestions.append(f"Description too long ({desc_len}/800 chars). Trim.")

    if tag_count >= 5:
        score += 15
        breakdown.append(f"tags_ok({tag_count})")
    else:
        suggestions.append(f"Only {tag_count} tags. Add more keywords (5-10 recommended).")

    keywords_lower = (title + " " + description).lower()

    seasonal_words = ["gift", "christmas", "holiday", "birthday", "wedding", "valentine", "mother's day", "ramadan", "eid", "summer", "spring", "back to school"]
    has_seasonal = any(w in keywords_lower for w in seasonal_words)
    if has_seasonal:
        score += 10
        breakdown.append("has_seasonal_keyword")

    cta_words = ["shop", "buy", "get", "grab", "check", "save", "order", "discover", "find", " explore"]
    has_cta = any(w in keywords_lower for w in cta_words)
    if has_cta:
        score += 10
        breakdown.append("has_cta")
    else:
        suggestions.append("Add a soft call-to-action (e.g. 'Shop now', 'Discover more').")

    if description.rstrip().endswith("[LINK]") or "link" in description.lower():
        score += 5
        breakdown.append("has_link_reference")

    # Clamp to 100
    total = min(score, 100)

    grade = (
        "Excellent" if total >= 85
        else "Good" if total >= 70
        else "Fair" if total >= 50
        else "Needs Work"
    )

    return {
        "score": total,
        "grade": grade,
        "breakdown": breakdown,
        "suggestions": suggestions,
        "title_len": title_len,
        "desc_len": desc_len,
        "tag_count": tag_count,
    }


async def recommend_board(
    product_title: str,
    product_tags: str,
    boards: list,
    endpoint: str,
    api_key: str,
    model: str,
) -> dict:
    """Use LLM to recommend the best Pinterest board for a product."""

    board_list = "\n".join([f"- {b['name']} (desc: {b.get('description','') or 'no description'})" for b in boards])

    system = (
        "You are a Pinterest strategy expert. Recommend the best board for a product. "
        "Return ONLY valid JSON with keys: board_name (string), board_id (string), reason (string, max 80 chars). "
        "Pick the board whose name/description most closely matches the product. "
        "If no board fits well, pick the most general one and note it in reason."
    )

    user_msg = f"""Product title: {product_title}
Product description/tags: {product_tags}

Available boards:
{board_list}

Recommend the best board for this product."""

    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.post(
            f"{endpoint.rstrip('/')}/chat/completions",
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json={
                "model": model,
                "messages": [
                    {"role": "system", "content": system},
                    {"role": "user", "content": user_msg},
                ],
                "temperature": 0.3,
                "response_format": {"type": "json_object"},
            },
        )
        r.raise_for_status()

    content = r.json()["choices"][0]["message"]["content"]
    data = json.loads(content)

    # Validate board_id exists in our list
    rec_board_id = data.get("board_id", "")
    valid = any(str(b.get("boardId","")) == str(rec_board_id) or b.get("name") == data.get("board_name") for b in boards)

    if not valid and boards:
        # Fallback to first board
        fallback = boards[0]
        data = {
            "board_name": fallback["name"],
            "board_id": str(fallback.get("boardId","")),
            "reason": "No perfect match found. Defaulted to first board.",
        }

    return data
