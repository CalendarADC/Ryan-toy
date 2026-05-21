import { describe, expect, it } from "vitest";

import {
  extractBase64FromGptImage2ImagesResponseForTest,
  extractImageBase64FromGenerateResponseForTest,
  extractImageRefFromGptImage2ChatContentForTest,
  shouldRetryEmptyImageResponseForTest,
} from "./AIService";

describe("LaoZhang NO_IMAGE response handling", () => {
  it("extracts inlineData and fileData", () => {
    const b64 = "aGVsbG8=";
    expect(
      extractImageBase64FromGenerateResponseForTest({
        candidates: [
          {
            content: { parts: [{ inlineData: { data: b64 } }] },
          },
        ],
      })
    ).toBe(b64);
    expect(
      extractImageBase64FromGenerateResponseForTest({
        candidates: [
          {
            content: { parts: [{ file_data: { data: b64 } }] },
          },
        ],
      })
    ).toBe(b64);
  });

  it("retries when finishReason is NO_IMAGE", () => {
    expect(
      shouldRetryEmptyImageResponseForTest({
        candidates: [{ finishReason: "NO_IMAGE", content: { parts: [] } }],
      })
    ).toBe(true);
  });

  it("extracts gpt-image-2 Images API b64_json", async () => {
    const b64 = "aGVsbG8=";
    await expect(
      extractBase64FromGptImage2ImagesResponseForTest({ data: [{ b64_json: b64 }] })
    ).resolves.toBe(b64);
  });

  it("extracts image ref from chat markdown and plain url", () => {
    expect(
      extractImageRefFromGptImage2ChatContentForTest("![img](https://cdn.example.com/a.png)")
    ).toBe("https://cdn.example.com/a.png");
    expect(
      extractImageRefFromGptImage2ChatContentForTest("result: https://cdn.example.com/b.png done")
    ).toBe("https://cdn.example.com/b.png");
  });

  it("does not retry when image is present", () => {
    expect(
      shouldRetryEmptyImageResponseForTest({
        candidates: [
          {
            finishReason: "STOP",
            content: { parts: [{ inlineData: { data: "abc" } }] },
          },
        ],
      })
    ).toBe(false);
  });
});
