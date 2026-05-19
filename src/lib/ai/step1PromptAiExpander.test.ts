import { describe, expect, it } from "vitest";

import {
  buildStep1ExpandDisplayBackgroundClause,
  finalizeStep1ExpandedPrompt,
  normalizeStep1ExpandedPromptDisplayBackground,
  normalizeStep1ExpandedZirconInlay,
  sanitizeStep1ExpandedInlayMaterials,
  STEP1_EXPAND_ZIRCON_CATALOG_COLOR_NAMES,
  STEP1_EXPAND_ZIRCON_DESIGN_MATCHED_PHRASE,
  STEP1_EXPAND_ZIRCON_DESIGN_MATCHED_STONE,
  userPromptAllowsEnamelOrLiuli,
  userPromptSpecifiesNonZirconGemstone,
} from "./step1PromptAiExpander";

describe("normalizeStep1ExpandedPromptDisplayBackground", () => {
  it("replaces random 展示背景 line with fixed clause for ring", () => {
    const raw =
      "设计一枚银戒指，主体是向日葵。\n展示背景：深褐色丝绒台面，柔光箱棚拍。\n工艺：手工锤纹。";
    const out = normalizeStep1ExpandedPromptDisplayBackground(raw, "ring");
    expect(out).toContain("展示背景：根据设计，把戒指放到你认为合适的展示背景里");
    expect(out).not.toContain("丝绒");
    expect(out).toContain("工艺：手工锤纹");
  });

  it("appends fixed line when missing for pendant", () => {
    const raw = "设计一枚银吊坠，主体是月亮。";
    const out = normalizeStep1ExpandedPromptDisplayBackground(raw, "pendant");
    expect(out).toContain("展示背景：根据设计，把吊坠放到你认为合适的展示背景里");
  });

  it("buildStep1ExpandDisplayBackgroundClause", () => {
    expect(buildStep1ExpandDisplayBackgroundClause("ring")).toBe(
      "根据设计，把戒指放到你认为合适的展示背景里"
    );
  });
});

describe("sanitizeStep1ExpandedInlayMaterials", () => {
  it("removes 珐琅 and 琉璃 from expanded text by default", () => {
    const raw = "镶嵌采用珐琅填色与琉璃点缀，爪镶紫水晶。";
    const out = sanitizeStep1ExpandedInlayMaterials(raw, "银戒向日葵");
    expect(out).not.toMatch(/珐琅|琉璃/);
    expect(out).toContain("爪镶");
  });

  it("keeps enamel/liuli when user prompt explicitly requests", () => {
    const raw = "镶嵌珐琅与琉璃工艺。";
    expect(userPromptAllowsEnamelOrLiuli("复古珐琅琉璃戒指")).toBe(true);
    expect(sanitizeStep1ExpandedInlayMaterials(raw, "复古珐琅琉璃戒指")).toBe(raw);
  });

  it("finalize applies background, enamel, and zircon delegation", () => {
    const raw = "设计戒指。爪镶白锆主石。展示背景：丝绒台面。";
    const out = finalizeStep1ExpandedPrompt(raw, "ring", "花朵戒指");
    expect(out).not.toMatch(/琉璃|丝绒|白锆/);
    expect(out).toContain("展示背景：根据设计，把戒指放到你认为合适的展示背景里");
    expect(out).toMatch(/你认为颜色符合设计的锆石/);
  });
});

describe("normalizeStep1ExpandedZirconInlay", () => {
  it("strips catalog zircon color names to design-matched delegation", () => {
    const raw = "爪镶香槟锆，密镶深海蓝锆点缀。";
    const out = normalizeStep1ExpandedZirconInlay(raw, "向日葵戒指");
    expect(out).not.toMatch(/香槟锆|深海蓝锆/);
    expect(out).toContain(STEP1_EXPAND_ZIRCON_DESIGN_MATCHED_STONE);
  });

  it("rewrites common gemstones to zircon delegation when user did not specify", () => {
    const raw = "爪镶紫水晶，密镶钻石点缀。";
    const out = normalizeStep1ExpandedZirconInlay(raw, "向日葵戒指");
    expect(out).toContain(STEP1_EXPAND_ZIRCON_DESIGN_MATCHED_STONE);
    expect(out).not.toMatch(/紫水晶|钻石|白锆/);
  });

  it("keeps diamond when user prompt explicitly requests", () => {
    const raw = "爪镶钻石主石。";
    expect(userPromptSpecifiesNonZirconGemstone("复古钻石戒指")).toBe(true);
    expect(normalizeStep1ExpandedZirconInlay(raw, "复古钻石戒指")).toContain("钻石");
  });

  it("replaces bare 锆石 with design-matched stone phrase", () => {
    const out = normalizeStep1ExpandedZirconInlay("包镶锆石主石。", "银戒");
    expect(out).toContain(STEP1_EXPAND_ZIRCON_DESIGN_MATCHED_STONE);
    expect(out).not.toMatch(/包镶锆石主石/);
  });

  it("appends design-matched inlay phrase when镶嵌 mentioned but no zircon wording", () => {
    const out = normalizeStep1ExpandedZirconInlay("戒面采用爪镶工艺。", "花朵戒指");
    expect(out).toContain(STEP1_EXPAND_ZIRCON_DESIGN_MATCHED_PHRASE);
  });

  it("catalog list still defined for post-process stripping", () => {
    expect(STEP1_EXPAND_ZIRCON_CATALOG_COLOR_NAMES).toContain("白锆");
    expect(STEP1_EXPAND_ZIRCON_CATALOG_COLOR_NAMES.length).toBeGreaterThan(20);
  });
});
