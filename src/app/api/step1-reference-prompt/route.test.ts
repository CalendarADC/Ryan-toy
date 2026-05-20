import { describe, expect, it, vi } from "vitest";

import { WEB_LOCAL_MODE_HEADER } from "@/lib/runtime/desktopLocalMode";

vi.mock("@/lib/ai/step1PromptAiExpander", () => ({
  analyzeStep1ReferencesWithAi: vi.fn().mockResolvedValue({
    analyzedPrompt: "S925银戒指，十字浮雕主题，爪镶锆石点缀。",
    model: "doubao-vision-test",
    expandConfig: {
      baseUrl: "https://ark.cn-beijing.volces.com/api/v3/chat/completions",
      model: "doubao-vision-test",
      providerLabel: "字节火山方舟",
      baseUrlHost: "ark.cn-beijing.volces.com",
    },
  }),
  resolveStep1ExpandRuntimeConfig: vi.fn().mockReturnValue({
    baseUrl: "https://ark.cn-beijing.volces.com/api/coding/v3",
    model: "ark-code-latest",
    providerLabel: "字节火山方舟",
    baseUrlHost: "ark.cn-beijing.volces.com",
  }),
}));

describe("POST /api/step1-reference-prompt", () => {
  it("allows web-local client without login session", async () => {
    const { POST } = await import("./route");
    const res = await POST(
      new Request("http://localhost/api/step1-reference-prompt", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          [WEB_LOCAL_MODE_HEADER]: "1",
        },
        body: JSON.stringify({
          referenceImageDataUrls: ["data:image/png;base64,abc"],
        }),
      })
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as { analyzedPrompt?: string };
    expect(data.analyzedPrompt).toContain("S925");
  });
});
