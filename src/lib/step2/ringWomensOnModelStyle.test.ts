import { describe, expect, it } from "vitest";
import { buildRingWomensOnModelStyleAdaptiveBlock } from "./ringWomensOnModelStyle";

describe("ringWomensOnModelStyle", () => {
  it("instructs creative freedom without preset style ids", () => {
    const block = buildRingWomensOnModelStyleAdaptiveBlock("藤蔓银戒", "run_1");
    expect(block).toContain("CREATIVE FREEDOM");
    expect(block).toContain("full freedom");
    expect(block).toContain("no app-side keyword");
    expect(block).not.toContain("vintage_warm");
    expect(block).not.toContain("SELECTED STYLE PROFILE");
  });

  it("includes user brief and shot instance", () => {
    const block = buildRingWomensOnModelStyleAdaptiveBlock("复古花卉", "nonce_abc");
    expect(block).toContain("复古花卉");
    expect(block).toContain("nonce_abc");
  });
});
