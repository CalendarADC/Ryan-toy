import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  analyzeStep1ReferencesWithAi,
  buildStep1ExpandDisplayBackgroundClause,
  extractStep1ExpandFinalPrompt,
  finalizeStep1ExpandedPrompt,
  normalizeStep1ExpandedPromptDisplayBackground,
  normalizeStep1ExpandedZirconInlay,
  resolveStep1ExpandChatCompletionsUrl,
  sanitizeStep1ReferenceImageUrls,
  sanitizeStep1ExpandedInlayMaterials,
  userPromptAllowsPaveInlay,
  step1ExpandFailureUserHint,
  STEP1_EXPAND_ZIRCON_CATALOG_COLOR_NAMES,
  userPromptAllowsEnamelOrLiuli,
  userPromptSpecifiesNonZirconGemstone,
  parseStep1ExpandDepth,
  step1ExpandDepthUsesThinking,
  isKimiStep1ExpandModel,
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

  it("finalize maps口语色名 to catalog zircon names", () => {
    const raw = "设计戒指。爪镶淡粉锆石主石，密镶香槟色小锆点缀。展示背景：丝绒台面。";
    const out = finalizeStep1ExpandedPrompt(raw, "ring", "花朵戒指");
    expect(out).not.toMatch(/琉璃|丝绒|密镶/);
    expect(out).toContain("粉红锆");
    expect(out).toContain("香槟锆");
    expect(out).toContain("钉镶");
    expect(out).toContain("展示背景：根据设计，把戒指放到你认为合适的展示背景里");
  });

  it("removes 密镶 from expanded inlay craft unless user requested", () => {
    const raw = "戒面爪镶粉红锆，叶脉密镶白锆点缀。";
    const out = sanitizeStep1ExpandedInlayMaterials(raw, "花朵戒指");
    expect(out).not.toMatch(/密镶/);
    expect(out).toContain("钉镶");
  });

  it("keeps 密镶 when user prompt explicitly requests", () => {
    expect(userPromptAllowsPaveInlay("复古密镶排钻戒指")).toBe(true);
    const raw = "叶脉密镶白锆点缀。";
    expect(sanitizeStep1ExpandedInlayMaterials(raw, "复古密镶排钻戒指")).toBe(raw);
  });
});

describe("normalizeStep1ExpandedZirconInlay", () => {
  it("maps口语色名 to catalog names", () => {
    const raw = "爪镶香槟色锆石主石，钉镶深海蓝小锆点缀。";
    const out = normalizeStep1ExpandedZirconInlay(raw, "向日葵戒指");
    expect(out).toContain("香槟锆");
    expect(out).toContain("深海蓝锆");
  });

  it("keeps catalog color names as-is", () => {
    const raw = "爪镶粉红锆主石，钉镶白锆点缀。";
    const out = normalizeStep1ExpandedZirconInlay(raw, "向日葵戒指");
    expect(out).toContain("粉红锆");
    expect(out).toContain("白锆");
  });

  it("removes stacked legacy delegation phrases", () => {
    const raw =
      "中心镶嵌你认为颜色符合整体设计的你认为颜色符合设计的锆石，边缘密镶你认为颜色符合整体意境的你认为颜色符合设计的锆石。";
    const out = finalizeStep1ExpandedPrompt(raw, "pendant", "天使吊坠");
    expect(out).not.toMatch(/你认为颜色符合|密镶/);
  });

  it("keeps diamond when present in expand text", () => {
    const raw = "爪镶钻石主石。";
    expect(userPromptSpecifiesNonZirconGemstone("复古钻石戒指")).toBe(true);
    expect(normalizeStep1ExpandedZirconInlay(raw, "复古钻石戒指")).toContain("钻石");
  });

  it("catalog list still defined for compatibility", () => {
    expect(STEP1_EXPAND_ZIRCON_CATALOG_COLOR_NAMES).toContain("白锆");
    expect(STEP1_EXPAND_ZIRCON_CATALOG_COLOR_NAMES.length).toBeGreaterThan(20);
  });
});

describe("extractStep1ExpandFinalPrompt", () => {
  it("strips reasoning trace and keeps prompt from 设计一枚", () => {
    const raw = `用户要求我作为珠宝概念提示词扩展师。我需要严格遵守规则。
我决定开头写：设计一枚S925银吊坠，洛可可风格融合法式曲线风格，设计主体是小丘比特与玫瑰。爪镶香槟锆主石。
展示背景：根据设计，把吊坠放到你认为合适的展示背景里
后续不应保留的思考文字。`;
    const out = extractStep1ExpandFinalPrompt(raw, "pendant");
    expect(out.startsWith("设计一枚S925银吊坠")).toBe(true);
    expect(out).toContain("香槟锆");
    expect(out).not.toMatch(/用户要求|我决定/);
    expect(out).toContain("展示背景：根据设计，把吊坠放到你认为合适的展示背景里");
  });
});

describe("Step1ExpandDepth", () => {
  it("parseStep1ExpandDepth defaults to deep", () => {
    expect(parseStep1ExpandDepth(undefined)).toBe("deep");
    expect(parseStep1ExpandDepth("fast")).toBe("fast");
    expect(parseStep1ExpandDepth("bogus")).toBe("deep");
  });

  it("step1ExpandDepthUsesThinking only for deep", () => {
    expect(step1ExpandDepthUsesThinking("fast")).toBe(false);
    expect(step1ExpandDepthUsesThinking("deep")).toBe(true);
  });

  it("isKimiStep1ExpandModel detects kimi models", () => {
    expect(isKimiStep1ExpandModel("kimi-k2.6")).toBe(true);
    expect(isKimiStep1ExpandModel("doubao-1-5-vision-pro")).toBe(false);
  });
});

describe("resolveStep1ExpandChatCompletionsUrl", () => {
  it("keeps coding/v3 base for Coding Plan vision models", () => {
    expect(
      resolveStep1ExpandChatCompletionsUrl("https://ark.cn-beijing.volces.com/api/coding/v3")
    ).toBe("https://ark.cn-beijing.volces.com/api/coding/v3/chat/completions");
  });

  it("maps plain api/v3 base to chat completions", () => {
    expect(resolveStep1ExpandChatCompletionsUrl("https://ark.cn-beijing.volces.com/api/v3")).toBe(
      "https://ark.cn-beijing.volces.com/api/v3/chat/completions"
    );
  });
});

describe("sanitizeStep1ReferenceImageUrls", () => {
  it("keeps at most 3 valid data or https urls", () => {
    const urls = [
      "data:image/png;base64,a",
      "https://cdn.example/a.png",
      "ftp://bad",
      "data:image/png;base64,b",
      "data:image/png;base64,c",
      "data:image/png;base64,d",
    ];
    expect(sanitizeStep1ReferenceImageUrls(urls)).toEqual([
      "data:image/png;base64,a",
      "https://cdn.example/a.png",
      "data:image/png;base64,b",
    ]);
  });
});

describe("step1ExpandFailureUserHint", () => {
  it("suggests vision model when upstream rejects images", () => {
    const hint = step1ExpandFailureUserHint("model does not support image input");
    expect(hint).toContain("STEP1_EXPAND_VISION_MODEL");
  });
});

describe("analyzeStep1ReferencesWithAi", () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.STEP1_EXPAND_API_KEY;
  const originalVision = process.env.STEP1_EXPAND_VISION_MODEL;

  beforeEach(() => {
    process.env.STEP1_EXPAND_API_KEY = "test-key";
    process.env.STEP1_EXPAND_VISION_MODEL = "doubao-vision-mock";
    process.env.STEP1_EXPAND_BASE_URL = "https://ark.cn-beijing.volces.com/api/coding/v3";
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    process.env.STEP1_EXPAND_API_KEY = originalKey;
    process.env.STEP1_EXPAND_VISION_MODEL = originalVision;
    vi.restoreAllMocks();
  });

  it("posts multimodal user content with image_url parts", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify({
          choices: [{ message: { content: "S925银戒指，十字浮雕，爪镶锆石。" } }],
        }),
    });
    globalThis.fetch = fetchMock as typeof fetch;

    const result = await analyzeStep1ReferencesWithAi({
      referenceImageDataUrls: ["data:image/png;base64,abc", "https://cdn.test/ref.jpg"],
      existingPrompt: "哥特十字架",
      selectedStyles: ["哥特风"],
    });

    expect(result.analyzedPrompt).toContain("S925");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body)) as {
      model: string;
      messages: Array<{ role: string; content: unknown }>;
    };
    expect(body.model).toBe("doubao-vision-mock");
    const userMsg = body.messages.find((m) => m.role === "user");
    expect(Array.isArray(userMsg?.content)).toBe(true);
    const parts = userMsg?.content as Array<{ type: string }>;
    expect(parts.filter((p) => p.type === "image_url")).toHaveLength(2);
    expect(parts.some((p) => p.type === "text")).toBe(true);
    const headers = init.headers as Record<string, string> | Headers;
    const auth =
      headers instanceof Headers
        ? headers.get("Authorization")
        : (headers as Record<string, string>).Authorization;
    expect(auth).toBe("Bearer test-key");
  });

  it("throws when no valid reference images", async () => {
    await expect(
      analyzeStep1ReferencesWithAi({ referenceImageDataUrls: ["not-an-image"] })
    ).rejects.toThrow(/参考图/);
  });
});
