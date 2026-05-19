import { describe, expect, it } from "vitest";

import {
  getInitToneLockInstruction,
  getStep3GemstoneColorLockBlock,
} from "./enhancePromptBlocks";
import { buildStep3MultiViewTonePreservationBlock } from "./jewelrySoftLimits";

describe("enhancePromptBlocks", () => {
  it("variant b is shorter than a for tone and gem locks", () => {
    const aTone = getInitToneLockInstruction("a");
    const bTone = getInitToneLockInstruction("b");
    const aGem = getStep3GemstoneColorLockBlock("a");
    const bGem = getStep3GemstoneColorLockBlock("b");
    expect(bTone.length).toBeLessThan(aTone.length);
    expect(bGem.length).toBeLessThan(aGem.length);
  });

  it("tone locks forbid adding yellow cast beyond init", () => {
    const tone = getInitToneLockInstruction("a");
    expect(tone).toMatch(/yellow|amber|golden/i);
    expect(tone).not.toMatch(/wood warmth/i);
    const multi = buildStep3MultiViewTonePreservationBlock();
    expect(multi).toMatch(/yellow|amber/i);
    expect(multi).toMatch(/same photo session/i);
  });
});
