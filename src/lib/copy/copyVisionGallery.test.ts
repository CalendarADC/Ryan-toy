import { describe, expect, it } from "vitest";

import { collectCopyVisionImageUrls, selectGalleryImagesForCopyVision } from "./copyVisionGallery";
import type { GalleryImage } from "@/store/jewelryGeneratorTypes";

function img(id: string, type: GalleryImage["type"], url: string): GalleryImage {
  return { id, type, url, sourceMainImageId: "m1" };
}

describe("selectGalleryImagesForCopyVision", () => {
  it("picks at most 3 distinct vision slots", () => {
    const gallery = [
      img("1", "main", "https://a/main.png"),
      img("2", "on_model", "https://a/model.png"),
      img("3", "left", "https://a/left.png"),
      img("4", "right", "https://a/right.png"),
    ];
    const picked = selectGalleryImagesForCopyVision(gallery);
    expect(picked).toHaveLength(3);
    expect(picked.map((x) => x.url)).toEqual([
      "https://a/main.png",
      "https://a/model.png",
      "https://a/left.png",
    ]);
  });

  it("uses fallback main url when gallery is empty", () => {
    expect(collectCopyVisionImageUrls([], "https://a/hero.png")).toEqual(["https://a/hero.png"]);
  });
});
