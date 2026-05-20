import { describe, expect, it } from "vitest";

import { finalizeStep1ExpandedPrompt } from "./step1PromptAiExpander";
import {
  buildDelicateRingMotifScaleIntegrationBlock,
  getRingMotifShankScaleTier,
  STEP1_MEDIUM_THIN_RING_MOTIF_SHANK_MANDATORY_PHRASE,
  STEP1_ULTRA_THIN_RING_MOTIF_SHANK_MANDATORY_PHRASE,
  userWantsDelicateThinWomensRing,
  userWantsMediumThinRing,
  userWantsUltraThinRing,
} from "./jewelrySoftLimits";

describe("ring motif/shank scale tier", () => {
  it("细戒 → ultra-thin 1.2–1.6", () => {
    expect(getRingMotifShankScaleTier("细戒指 紫藤")).toBe("ultra-thin");
    expect(userWantsUltraThinRing("细戒指 紫藤")).toBe(true);
  });

  it("女戒 → ultra-thin 1.2–1.6", () => {
    expect(getRingMotifShankScaleTier("女戒 紫藤")).toBe("ultra-thin");
  });

  it("中细戒 → medium-thin 1.2–1.8", () => {
    expect(getRingMotifShankScaleTier("中细戒指 紫藤")).toBe("medium-thin");
    expect(userWantsMediumThinRing("中细戒指 紫藤")).toBe(true);
    expect(userWantsUltraThinRing("中细戒指 紫藤")).toBe(false);
  });

  it("中性戒指 → medium-thin 1.2–1.8", () => {
    expect(getRingMotifShankScaleTier("中性戒指 藤蔓")).toBe("medium-thin");
  });

  it("中细优先于女戒关键词", () => {
    expect(getRingMotifShankScaleTier("中细戒指 女戒")).toBe("medium-thin");
  });

  it("仅通勤/普通戒指 → 无档位", () => {
    expect(getRingMotifShankScaleTier("日常通勤戒 紫藤")).toBe(null);
    expect(getRingMotifShankScaleTier("设计一枚哥特风雄狮戒指")).toBe(null);
    expect(userWantsDelicateThinWomensRing("设计一枚哥特风雄狮戒指")).toBe(false);
  });
});

describe("buildDelicateRingMotifScaleIntegrationBlock", () => {
  it("returns mandatory phrase for tier only", () => {
    expect(buildDelicateRingMotifScaleIntegrationBlock("细戒指")).toContain("1.2–1.6");
    expect(buildDelicateRingMotifScaleIntegrationBlock("中细戒指")).toContain("1.2–1.8");
    expect(buildDelicateRingMotifScaleIntegrationBlock("雄狮戒指")).toBe("");
  });
});

describe("finalizeStep1ExpandedPrompt", () => {
  it("injects phrases only when tier matches", () => {
    const ultra = finalizeStep1ExpandedPrompt("设计一枚银戒指。", "ring", "细戒");
    expect(ultra).toContain(STEP1_ULTRA_THIN_RING_MOTIF_SHANK_MANDATORY_PHRASE);

    const medium = finalizeStep1ExpandedPrompt("设计一枚银戒指。", "ring", "中性戒指");
    expect(medium).toContain(STEP1_MEDIUM_THIN_RING_MOTIF_SHANK_MANDATORY_PHRASE);

    const plain = finalizeStep1ExpandedPrompt("设计一枚银戒指。", "ring", "雄狮戒指");
    expect(plain).not.toContain(STEP1_ULTRA_THIN_RING_MOTIF_SHANK_MANDATORY_PHRASE);
    expect(plain).not.toContain(STEP1_MEDIUM_THIN_RING_MOTIF_SHANK_MANDATORY_PHRASE);
  });
});
