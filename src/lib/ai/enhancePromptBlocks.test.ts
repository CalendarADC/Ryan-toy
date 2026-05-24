import { describe, expect, it } from "vitest";

import {
  getInitToneLockInstruction,
  getStep3GemstoneColorLockBlock,
} from "./enhancePromptBlocks";
import {
  buildRingRearProductViewBlock,
  buildStep3MandatoryCameraOrbitBlock,
  buildStep3MultiViewTonePreservationBlock,
} from "./jewelrySoftLimits";

describe("enhancePromptBlocks", () => {
  it("variant b is shorter than a for tone and gem locks", () => {
    const aTone = getInitToneLockInstruction("a");
    const bTone = getInitToneLockInstruction("b");
    const aGem = getStep3GemstoneColorLockBlock("a");
    const bGem = getStep3GemstoneColorLockBlock("b");
    expect(bTone.length).toBeLessThan(aTone.length);
    expect(bGem.length).toBeLessThan(aGem.length);
  });

  it("mandatory orbit block requires visible camera delta", () => {
    const left = buildStep3MandatoryCameraOrbitBlock("left");
    expect(left).toMatch(/MANDATORY CAMERA DELTA/i);
    expect(left).toMatch(/not.*same camera/i);
    expect(left).toMatch(/counterclockwise/i);
  });

  it("ring rear orbit mentions flat lay and shank back", () => {
    const rear = buildStep3MandatoryCameraOrbitBlock("rear", "ring");
    expect(rear).toMatch(/lay the ring flat/i);
    expect(rear).toMatch(/through-hole/i);
  });

  it("ring rear product block forbids upright through-hole view", () => {
    const block = buildRingRearProductViewBlock();
    expect(block).toMatch(/flat on the display surface/i);
    expect(block).toMatch(/rear shank exterior/i);
    expect(block).toMatch(/through the finger opening/i);
    expect(block).toMatch(/图2-class failure/i);
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
