/** 女性戒指穿戴图：不预设关键词→风格表，由模型根据 SKU + 用户 brief 自由发挥穿戴场景。 */

export function buildRingWomensOnModelStyleAdaptiveBlock(
  prompt: string,
  varietySeed = ""
): string {
  const brief = prompt.trim();
  const briefLine = brief
    ? `User creative brief (mood / story reference — not a rigid style lookup table): ${brief.slice(0, 800)}`
    : "User brief is minimal — infer the wearing story entirely from the ring SKU in the init image (motif, metal, stones, proportions).";

  const instanceLine = varietySeed
    ? `Shot instance ${varietySeed}: fresh creative direction for this request; do not reuse a memorized stock hand + nails + backdrop combo.`
    : "";

  return [
    "WOMEN'S-RING ON-MODEL — CREATIVE FREEDOM (strict): premium women's jewelry e-commerce / editorial quality.",
    briefLine,
    instanceLine,
    "CREATIVE DIRECTOR MANDATE: You have **full freedom** to choose skin tone, hand pose, manicure (shape + color or bare), and background (studio, fabric, texture, color grade) — **no app-side keyword→style mapping**. Pick what best complements **this exact ring** and the user's brief.",
    "VARIETY (strict): Do **NOT** default to one repeated stock template (same neutral beige manicure + identical champagne fabric bokeh every time). Each generation should feel intentionally art-directed for the SKU.",
    "HAND READ: natural adult woman's hand — believable knuckles, tendons, skin micro-texture (NOT plastic).",
    "FULL-HAND FRAMING (strict): most or all fingers visible in relaxed diagonal or gentle 3/4; ring readable on index, middle, or ring finger — NOT an isolated single-finger macro.",
    "POSE: softly curved fingers, calm elegant gesture; ring centered and readable.",
    "LIGHTING: soft diffused studio / editorial wrap; crisp metal and stone speculars; forbid cheap flat flash or muddy gray flatness.",
  ]
    .filter(Boolean)
    .join("\n");
}
