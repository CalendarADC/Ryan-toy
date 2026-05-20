import { describe, expect, it, vi } from "vitest";

import { WEB_LOCAL_MODE_HEADER } from "@/lib/runtime/desktopLocalMode";

const expandStep1PromptWithAi = vi.fn().mockResolvedValue({
    expandedPrompt: "expanded test prompt",
    model: "gpt-test",
    expandConfig: {
      baseUrl: "https://ark.cn-beijing.volces.com/api/coding/v3",
      model: "gpt-test",
      providerLabel: "字节火山方舟",
      baseUrlHost: "ark.cn-beijing.volces.com",
    },
});

vi.mock("@/lib/ai/step1PromptAiExpander", () => ({
  expandStep1PromptWithAi,
  parseStep1ExpandDepth: (input: unknown) => (input === "fast" ? "fast" : "deep"),
  resolveStep1ExpandRuntimeConfig: vi.fn().mockReturnValue({
    baseUrl: "https://ark.cn-beijing.volces.com/api/coding/v3",
    model: "gpt-test",
    providerLabel: "字节火山方舟",
    baseUrlHost: "ark.cn-beijing.volces.com",
  }),
}));

describe("POST /api/step1-expand", () => {
  it("allows web-local client without login session", async () => {
    const { POST } = await import("./route");
    const res = await POST(
      new Request("http://localhost/api/step1-expand", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          [WEB_LOCAL_MODE_HEADER]: "1",
        },
        body: JSON.stringify({ prompt: "test ring" }),
      }),
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as { expandedPrompt?: string };
    expect(data.expandedPrompt).toBe("expanded test prompt");
  });

  it("forwards expandDepth to expandStep1PromptWithAi", async () => {
    expandStep1PromptWithAi.mockClear();
    const { POST } = await import("./route");
    const res = await POST(
      new Request("http://localhost/api/step1-expand", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          [WEB_LOCAL_MODE_HEADER]: "1",
        },
        body: JSON.stringify({ prompt: "test ring", expandDepth: "fast" }),
      }),
    );
    expect(res.status).toBe(200);
    expect(expandStep1PromptWithAi).toHaveBeenCalledWith(
      expect.objectContaining({ expandDepth: "fast" }),
    );
  });
});
