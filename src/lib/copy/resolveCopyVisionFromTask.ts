import type { GalleryImage, GalleryImageType } from "@/store/jewelryGeneratorTypes";
import { prisma } from "@/lib/db";
import { selectGalleryImagesForCopyVision } from "@/lib/copy/copyVisionGallery";

function mapDbKindToGalleryType(kind: string): GalleryImageType {
  const k = kind.trim();
  if (
    k === "main" ||
    k === "on_model" ||
    k === "left" ||
    k === "right" ||
    k === "rear" ||
    k === "front" ||
    k === "top" ||
    k === "side"
  ) {
    return k as GalleryImageType;
  }
  return "main";
}

export async function mergeCopyGalleryWithTaskImages(args: {
  userId: string;
  taskId: string;
  gallery: GalleryImage[];
  fallbackMainUrl?: string;
}): Promise<GalleryImage[]> {
  const rows = await prisma.generatedImage.findMany({
    where: { userId: args.userId, taskId: args.taskId },
    select: {
      id: true,
      kind: true,
      url: true,
      sourceMainImageId: true,
      debugPromptZh: true,
    },
  });
  if (!rows.length) return selectGalleryImagesForCopyVision(args.gallery, args.fallbackMainUrl);

  const byId = new Map(
    rows.map((r) => [
      r.id,
      {
        id: r.id,
        type: mapDbKindToGalleryType(r.kind),
        url: r.url,
        sourceMainImageId: r.sourceMainImageId ?? undefined,
        debugPromptZh: r.debugPromptZh ?? undefined,
      } satisfies GalleryImage,
    ])
  );

  const merged: GalleryImage[] = [];
  const seen = new Set<string>();
  for (const g of args.gallery) {
    const row = byId.get(g.id);
    const url = (row?.url ?? g.url)?.trim();
    if (!url || seen.has(g.id)) continue;
    seen.add(g.id);
    merged.push({
      ...g,
      ...row,
      url,
      type: row?.type ?? g.type,
    });
  }

  for (const row of byId.values()) {
    if (seen.has(row.id)) continue;
    merged.push(row);
  }

  return selectGalleryImagesForCopyVision(merged, args.fallbackMainUrl);
}
