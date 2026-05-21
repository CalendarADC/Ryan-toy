import { describe, expect, it } from "vitest";

import {
  buildReferenceEditInstructionBlock,
  userPromptIsReferenceEditInstruction,
} from "./jewelrySoftLimits";

describe("userPromptIsReferenceEditInstruction", () => {
  it("detects remove-pave edit on reference pendant", () => {
    const prompt =
      "移除月亮月牙内部、天使翅膀和身体上的所有密镶锆石，仅保留吊坠外框上的4颗圆形小锆石，其余位置均改为纯银浮雕效果，修改后整体协调统一，不改变吊坠的整体比例和造型";
    expect(userPromptIsReferenceEditInstruction(prompt)).toBe(true);
    const block = buildReferenceEditInstructionBlock(1, prompt);
    expect(block).toContain("参考图精修");
    expect(block).toContain("4颗");
    expect(block).toContain("禁止");
  });

  it("returns false for fresh design brief", () => {
    expect(userPromptIsReferenceEditInstruction("设计一枚向日葵银戒指，哥特风")).toBe(false);
  });
});
