import { describe, expect, it } from "vitest";

import { finalizeStep1ExpandedPrompt } from "./step1PromptAiExpander";
import {
  buildDelicateRingMotifScaleIntegrationBlock,
  buildGemCountHardLockBlock,
  buildZirconInlayAiColorMatchBlock,
  getRingMotifShankScaleTier,
  parseStatedTotalGemCount,
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
  it("returns English-only reinforcement without duplicating Chinese mandatory line", () => {
    const ultra = buildDelicateRingMotifScaleIntegrationBlock("细戒指");
    expect(ultra).toContain("1.2–1.6");
    expect(ultra).not.toContain("设计主题相对戒臂");
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

  it("removes trailing canonical ratio when body already states paraphrase", () => {
    const raw =
      "设计一枚S925银戒指，戒头以樱花枝为造型主体，体量相对戒臂 1.2-1.6 倍，肩线自戒圈两侧自然收拢融合于花簇底部，禁止中间大两侧小。爪镶香槟锆主石1颗。全件宝石共3颗、色号2种。展示背景：根据设计，把戒指放到你认为合适的展示背景里。[设计主题相对戒臂 1.2-1.6 倍，并强调肩线融合、禁止中间大两侧小]";
    const out = finalizeStep1ExpandedPrompt(raw, "ring", "细戒 樱花");
    expect(out).toContain("体量相对戒臂");
    expect(out).not.toMatch(/\[设计主题相对戒臂/);
    expect(out).not.toContain(STEP1_ULTRA_THIN_RING_MOTIF_SHANK_MANDATORY_PHRASE);
    expect(out.match(/设计主题相对戒臂/g) ?? []).toHaveLength(0);
  });

  it("appends canonical ratio only when body lacks any ratio mention", () => {
    const raw =
      "设计一枚S925银戒指，细戒指适合女性日常佩戴，设计主题相对戒臂1.4倍，并强调肩线融合。爪镶香槟锆主石1颗。全件宝石共4颗、色号2种。展示背景：根据设计，把戒指放到你认为合适的展示背景里";
    const out = finalizeStep1ExpandedPrompt(raw, "ring", "细戒 向日葵");
    expect(out).not.toMatch(/1\.4\s*倍/);
    expect(out).toContain(STEP1_ULTRA_THIN_RING_MOTIF_SHANK_MANDATORY_PHRASE);
    expect((out.match(/设计主题相对戒臂/g) ?? []).length).toBe(1);
  });
});

describe("parseStatedTotalGemCount / gem locks", () => {
  it("parses 全件宝石共 N 颗", () => {
    expect(parseStatedTotalGemCount("全件宝石共4颗、色号2种")).toBe(4);
    expect(parseStatedTotalGemCount("无颗数声明")).toBeNull();
  });

  it("buildGemCountHardLockBlock only when count stated", () => {
    expect(buildGemCountHardLockBlock("全件宝石共4颗")).toContain("exactly 4");
    expect(buildGemCountHardLockBlock("无声明")).toBe("");
  });

  it("zircon block uses stated count instead of default 6", () => {
    const block = buildZirconInlayAiColorMatchBlock("细戒 向日葵", "ring", {
      expandedText: "全件宝石共4颗、色号2种",
    });
    expect(block).toContain("恰好 4 颗");
    expect(block).not.toContain("不超过 6 颗");
  });
});
