import { describe, expect, it } from "vitest";

import {
  buildDelicateRingBalanceNegativeLines,
  buildDelicateRingMotifScaleIntegrationBlock,
  buildGlobalNegativePromptBlock,
  userWantsDelicateThinWomensRing,
} from "./jewelrySoftLimits";

describe("userWantsDelicateThinWomensRing", () => {
  it("matches preset thin_female phrase", () => {
    expect(
      userWantsDelicateThinWomensRing(
        "设计一个银的戒指，细戒指适合女性日常佩戴，以紫藤作为设计主题"
      )
    ).toBe(true);
  });

  it("does not match generic ring without delicate intent", () => {
    expect(userWantsDelicateThinWomensRing("设计一枚哥特风雄狮戒指")).toBe(false);
  });
});

describe("buildDelicateRingMotifScaleIntegrationBlock", () => {
  it("returns balance rules for delicate women's ring", () => {
    const block = buildDelicateRingMotifScaleIntegrationBlock("细戒指 紫藤 通勤");
    expect(block).toContain("纤巧精致");
    expect(block).toContain("1.2–2.0");
    expect(block).toMatch(/盾形|牌饰/);
    expect(block).toContain("DELICATE WOMEN'S RING");
  });

  it("returns empty when not delicate intent", () => {
    expect(buildDelicateRingMotifScaleIntegrationBlock("雄狮戒指")).toBe("");
  });
});

describe("buildDelicateRingBalanceNegativeLines", () => {
  it("adds head-heavy negatives to global block", () => {
    const negatives = buildDelicateRingBalanceNegativeLines("细戒指 女戒");
    expect(negatives[0]).toMatch(/shield|wire/i);
    const global = buildGlobalNegativePromptBlock("细戒指 女戒");
    expect(global).toMatch(/head-heavy|shield/i);
  });
});
