import { describe, expect, it } from "vitest";

import {
  buildStep1ExpandDisplayBackgroundClause,
  finalizeStep1ExpandedPrompt,
  formatStep1ExpandZirconColorWhitelist,
  normalizeStep1ExpandedPromptDisplayBackground,
  normalizeStep1ExpandedZirconInlay,
  sanitizeStep1ExpandedInlayMaterials,
  STEP1_EXPAND_ZIRCON_COLOR_OPTIONS,
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

  it("finalize applies both background and inlay rules", () => {
    const raw = "设计戒指。镶嵌琉璃。展示背景：丝绒台面。";
    const out = finalizeStep1ExpandedPrompt(raw, "ring", "花朵戒指");
    expect(out).not.toMatch(/琉璃|丝绒/);
    expect(out).toContain("展示背景：根据设计，把戒指放到你认为合适的展示背景里");
  });
});

describe("normalizeStep1ExpandedZirconInlay", () => {
  it("exports full zircon color whitelist for system prompt", () => {
    expect(STEP1_EXPAND_ZIRCON_COLOR_OPTIONS).toContain("香槟锆");
    expect(STEP1_EXPAND_ZIRCON_COLOR_OPTIONS).toContain("桔红锆锆");
    expect(formatStep1ExpandZirconColorWhitelist()).toContain("深海蓝锆");
  });

  it("rewrites common gemstones to zircon colors when user did not specify", () => {
    const raw = "爪镶紫水晶，密镶钻石点缀。";
    const out = normalizeStep1ExpandedZirconInlay(raw, "向日葵戒指");
    expect(out).toContain("中紫红锆");
    expect(out).toContain("白锆");
    expect(out).not.toMatch(/紫水晶|钻石/);
  });

  it("keeps diamond when user prompt explicitly requests", () => {
    const raw = "爪镶钻石主石。";
    expect(userPromptSpecifiesNonZirconGemstone("复古钻石戒指")).toBe(true);
    expect(normalizeStep1ExpandedZirconInlay(raw, "复古钻石戒指")).toContain("钻石");
  });

  it("replaces bare 锆石 with a whitelist color name", () => {
    const out = normalizeStep1ExpandedZirconInlay("包镶锆石主石。", "银戒");
    expect(out).not.toContain("锆石");
    expect(STEP1_EXPAND_ZIRCON_COLOR_OPTIONS.some((c) => out.includes(c))).toBe(true);
  });

  it("appends default zircon inlay when镶嵌 mentioned but no gem named", () => {
    const out = normalizeStep1ExpandedZirconInlay("戒面采用爪镶工艺。", "花朵戒指");
    expect(out).toMatch(/主配石采用.+锆镶嵌/);
  });
});
