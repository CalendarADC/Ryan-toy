import type { JewelryProductKind } from "@/lib/ai/jewelrySoftLimits";

/** 与客户端/调试日志对齐：左右视图与影调辅助块变更时递增。 */
export const ENHANCE_LR_TONE_BLOCKS_VERSION = "2026-05-2";

/**
 * A/B：`a` 为当前默认长文案；`b` 为压缩版（左右/影调锁），减少无效 token。
 * 环境变量 `STEP3_LR_PROMPT_AB=b` 启用 B。
 */
export function getStep3LeftRightPromptVariant(): "a" | "b" {
  const v = process.env.STEP3_LR_PROMPT_AB?.trim().toLowerCase();
  return v === "b" ? "b" : "a";
}

export function getInitToneLockInstruction(variant: "a" | "b"): string {
  if (variant === "b") {
    return [
      "INIT TONE LOCK: match init white balance + exposure + saturation (not warmer than init).",
      "FORBID yellow/amber global cast or tungsten shift; forbid gray haze or catalog re-grade.",
    ].join(" ");
  }
  return [
    "INIT TONE LOCK (absolute): match the init hero's **exact** photometric grade — same white balance, exposure, contrast curve, saturation, shadow depth, and background hue family as the reference frame.",
    "Do NOT add a global **yellow / amber / golden** cast, tungsten warmth, or 'warm filter' that was not already in the init.",
    "Do NOT apply gray cast, low-contrast wash, matte fog, or auto relight that dulls metal — but also **do not** push neutral/cool heroes toward warm cream/wood tones.",
  ].join("\n");
}

/** Step3 左/右/后等产品角度：宝石色相跟随 init，禁止借换视角改色。 */
export function getStep3GemstoneColorLockBlock(variant: "a" | "b"): string {
  if (variant === "b") {
    return [
      "GEM HUE LOCK (all product orbits): keep each stone's base hue vs init; forbid yellowing or hue shifts.",
      "Highlights may move; underlying stone color/saturation/count must not change.",
    ].join(" ");
  }
  return [
    "GEMSTONE COLOR / HUE LOCK (strict — left/right/rear/front product views):",
    "Every visible gem must keep the **same base hue and body color** as the init — e.g. **blue stays blue**, **green stays green**, neutral stones stay neutral.",
    "**FORBID** global yellowing of stones/metal/background, amber cast, or recoloring to simulate variety when only the camera moved.",
    "Specular highlights may relocate; **do not** change underlying stone color, saturation, or count.",
  ].join("\n");
}

/** @deprecated 使用 getStep3GemstoneColorLockBlock */
export function getStep3LeftRightGemstoneColorLockBlock(variant: "a" | "b"): string {
  return getStep3GemstoneColorLockBlock(variant);
}

/** 仅戒指需要 inner shank 约束时注入，吊坠跳过以省 token。 */
export function getRingInnerSurfaceLockBlock(kind: JewelryProductKind): string {
  if (kind !== "ring") return "";
  return [
    "RING INNER SURFACE LOCK (strict, all Step3 views):",
    "The finger-contact inner loop must remain a smooth, continuous, mirror-polished 360-degree finished band (finished jewelry quality).",
    "No true dents and no fake dents from lighting/shadow illusion: avoid shading/specular patterns that make the inner loop look concave, sunken, grooved, ridged, or seamed.",
    "FORBID: inner dent, inner pit/dimple, groove inside shank, concave trench, raised inner ridge, seam-like line, casting seam, inner engraving/text/filigree. Decorations stay on outer/top surfaces only.",
  ].join("\n");
}
