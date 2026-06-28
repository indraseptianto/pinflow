STYLE_PRESETS = {
    "minimal-clean": {
        "label": "Minimal Clean Product",
        "description": "clean white/neutral background, modern editorial product focus",
        "visual_direction": "minimal premium product photography, white and warm neutral tones, soft shadows, lots of breathing room",
    },
    "luxury-editorial": {
        "label": "Luxury Editorial",
        "description": "premium magazine-style composition for high perceived value",
        "visual_direction": "luxury editorial lighting, elegant props, rich contrast, refined composition, premium catalog feel",
    },
    "cozy-handmade": {
        "label": "Cozy Handmade",
        "description": "warm artisan style for handmade Etsy products",
        "visual_direction": "warm cozy handmade scene, natural texture, soft daylight, artisanal props, inviting home atmosphere",
    },
    "pastel-aesthetic": {
        "label": "Pastel Aesthetic",
        "description": "soft pastel Pinterest aesthetic with gentle lifestyle styling",
        "visual_direction": "pastel palette, airy composition, soft gradients, gentle lifestyle scene, cute but polished",
    },
    "bold-sale-poster": {
        "label": "Bold Sale Poster",
        "description": "scroll-stopping commercial pin with high contrast",
        "visual_direction": "bold graphic poster look, high contrast, bright accents, clean product hero, strong mobile-feed readability",
    },
    "gift-guide": {
        "label": "Gift Guide Style",
        "description": "position product as a gift idea for Pinterest shoppers",
        "visual_direction": "gift guide editorial layout, tasteful wrapping props, celebratory but uncluttered, product as perfect gift idea",
    },
}

VARIANT_ANGLES = [
    {
        "key": "benefit",
        "label": "Benefit-driven",
        "instruction": "Focus the copy and visual concept on the main buyer benefit and outcome.",
    },
    {
        "key": "gift",
        "label": "Gift idea",
        "instruction": "Position this product as a thoughtful gift idea for the right recipient or occasion.",
    },
    {
        "key": "lifestyle",
        "label": "Lifestyle aesthetic",
        "instruction": "Emphasize lifestyle, mood, decor, and how the product fits into a beautiful everyday scene.",
    },
]


def list_style_presets() -> list[dict]:
    return [{"key": key, **value} for key, value in STYLE_PRESETS.items()]


def get_style_preset(style_key: str | None) -> dict:
    return STYLE_PRESETS.get(style_key or "minimal-clean", STYLE_PRESETS["minimal-clean"])


def build_image_prompt(product_title: str, product_description: str, style_key: str | None, angle_instruction: str = "", extra_instruction: str = "") -> str:
    style = get_style_preset(style_key)
    return f"""Create a high-converting vertical Pinterest pin image in 2:3 aspect ratio for this Etsy product.

Product: {product_title}
Product context: {product_description[:500]}
Style preset: {style['label']} - {style['description']}
Audience: Pinterest shoppers looking for Etsy products, handmade goods, decor, gifts, or useful digital products.

Visual direction:
- {style['visual_direction']}
- product is the hero
- optimized for mobile Pinterest feed
- clean composition with strong visual hierarchy
- no fake logos, no watermark, no messy text
- tasteful, premium, not generic stock-photo style

Variant angle:
- {angle_instruction or 'Create a balanced evergreen product pin.'}

Composition:
- vertical 1000x1500 or closest supported 2:3 ratio
- product centered with breathing room
- attractive editorial Pinterest layout
- high contrast but tasteful

Extra user instruction:
{extra_instruction or 'None'}"""


def build_text_instruction(style_key: str | None, angle_instruction: str = "", extra_instruction: str = "") -> str:
    style = get_style_preset(style_key)
    return f"Use style preset: {style['label']}. {angle_instruction} {extra_instruction}".strip()
