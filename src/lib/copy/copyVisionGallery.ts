import type { GalleryImage } from "@/store/jewelryGeneratorTypes";

export const COPY_VISION_MAX_IMAGES = 3;

function visionTypeOrder(t: string): number {
  if (t === "main") return 0;
  if (t === "on_model") return 1;
  if (t === "handheld") return 2;
  if (t === "top" || t === "front" || t === "left" || t === "right" || t === "rear" || t === "side")
    return 3;
  return 4;
}

type VisionSlot = "main" | "on_model" | "handheld" | "left" | "right" | "rear" | "front";

function normalizeGalleryType(rawType: string): VisionSlot | null {
  const t: VisionSlot =
    rawType === "side"
      ? "left"
      : rawType === "top"
        ? "front"
        : (rawType as VisionSlot);
  const slots: VisionSlot[] = ["main", "on_model", "handheld", "left", "right", "rear", "front"];
  return slots.includes(t) ? t : null;
}

export function selectGalleryImagesForCopyVision(
  gallery: GalleryImage[],
  fallbackMainUrl?: string
): GalleryImage[] {
  const sorted = [...gallery].sort((a, b) => visionTypeOrder(a.type) - visionTypeOrder(b.type));
  const picked: GalleryImage[] = [];
  const seen = new Set<string>();
  const fb = fallbackMainUrl?.trim();
  const typeCount: Record<VisionSlot, number> = {
    main: 0,
    on_model: 0,
    handheld: 0,
    left: 0,
    right: 0,
    rear: 0,
    front: 0,
  };

  for (const g of sorted) {
    const u = g.url?.trim();
    if (!u || seen.has(u)) continue;

    const t = normalizeGalleryType(g.type as string);
    if (!t) continue;

    if (t === "main" && fb && u !== fb) continue;
    if (t === "main" && typeCount.main >= 1) continue;
    if (t === "on_model" && typeCount.on_model >= 1) continue;
    if (t === "handheld" && typeCount.handheld >= 1) continue;
    if (t === "left" && typeCount.left >= 1) continue;
    if (t === "right" && typeCount.right >= 1) continue;
    if (t === "rear" && typeCount.rear >= 1) continue;
    if (t === "front" && typeCount.front >= 1) continue;

    seen.add(u);
    typeCount[t] += 1;
    picked.push(g);
    if (picked.length >= COPY_VISION_MAX_IMAGES) break;
  }

  if (fb && !seen.has(fb)) {
    const mainFromGallery = gallery.find((x) => x.url?.trim() === fb);
    if (mainFromGallery) {
      picked.unshift(mainFromGallery);
    } else {
      picked.unshift({
        id: "copy-fallback-main",
        type: "main",
        url: fb,
        sourceMainImageId: "copy-fallback-main",
      });
    }
    seen.add(fb);
  }

  return picked.slice(0, COPY_VISION_MAX_IMAGES);
}

export function collectCopyVisionImageUrls(
  gallery: GalleryImage[],
  fallbackMainUrl?: string
): string[] {
  return selectGalleryImagesForCopyVision(gallery, fallbackMainUrl)
    .map((g) => g.url?.trim())
    .filter((u): u is string => !!u);
}
