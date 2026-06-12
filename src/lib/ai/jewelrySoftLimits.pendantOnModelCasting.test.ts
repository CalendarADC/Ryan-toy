import { describe, expect, it } from "vitest";

import {
  buildPendantOnModelCastingAndWardrobeBlock,
  buildPendantOnModelCreativeVarietyBlock,
  buildPendantBailTopologyLockBlock,
} from "./jewelrySoftLimits";

describe("buildPendantOnModelCastingAndWardrobeBlock", () => {
  it("includes ~90% Caucasian and Latino/Mediterranean casting pool", () => {
    const block = buildPendantOnModelCastingAndWardrobeBlock("silver cat pendant");
    expect(block).toMatch(/~90%|9 out of 10/i);
    expect(block).toMatch(/Caucasian/i);
    expect(block).toMatch(/Mediterranean/i);
    expect(block).toMatch(/Latino/i);
    expect(block).toMatch(/~10%/i);
  });

  it("biases auto gender toward female for Etsy", () => {
    const block = buildPendantOnModelCastingAndWardrobeBlock("moon pendant");
    expect(block).toMatch(/~70% adult female/i);
  });

  it("locks male when user selected male", () => {
    const block = buildPendantOnModelCastingAndWardrobeBlock("gothic pendant", "male");
    expect(block).toMatch(/GENDER LOCK.*male/i);
    expect(block).not.toMatch(/~70% adult female/i);
  });

  it("rotates gothic male wardrobe by variety seed", () => {
    const a = buildPendantOnModelCastingAndWardrobeBlock("gothic dragon pendant", "male", "seed-a");
    const b = buildPendantOnModelCastingAndWardrobeBlock("gothic dragon pendant", "male", "seed-b");
    expect(a).toMatch(/gothic_dark/i);
    expect(a).toMatch(/Variant [A-D]/i);
    expect(b).toMatch(/Variant [A-D]/i);
    expect(a).not.toEqual(b);
  });

  it("forbids default charcoal crew tee repetition", () => {
    const block = buildPendantOnModelCastingAndWardrobeBlock("gothic pendant", "male", "x1");
    expect(block).toMatch(/charcoal crew-neck tee/i);
  });
});

describe("buildPendantOnModelCreativeVarietyBlock", () => {
  it("requires SKU-driven art direction and anti-template", () => {
    const block = buildPendantOnModelCreativeVarietyBlock("dragon skull pendant", "male", "run-1");
    expect(block).toMatch(/init pendant/i);
    expect(block).toMatch(/charcoal crew-neck t-shirt/i);
    expect(block).toMatch(/Shot instance run-1/i);
  });
});

describe("buildPendantBailTopologyLockBlock", () => {
  it("classifies single-top vs dual-bail modes", () => {
    const block = buildPendantBailTopologyLockBlock(true);
    expect(block).toMatch(/MODE A.*SINGLE-TOP-BAIL/i);
    expect(block).toMatch(/MODE B.*DUAL-BAIL/i);
  });

  it("covers horizontal-bar and upper-corner dual-bail subtypes", () => {
    const block = buildPendantBailTopologyLockBlock(true);
    expect(block).toMatch(/B1.*horizontal-bar/i);
    expect(block).toMatch(/B2.*upper-corner/i);
    expect(block).toMatch(/center-top ornament is decorative only/i);
  });

  it("on-model dual-bail requires split chain paths to left and right connectors", () => {
    const block = buildPendantBailTopologyLockBlock(true);
    expect(block).toMatch(/two separate chain paths/i);
    expect(block).toMatch(/left path.*left bail/i);
    expect(block).toMatch(/right path.*right bail/i);
    expect(block).toMatch(/inverted-V|split-Y/i);
    expect(block).toMatch(/FORBID.*one continuous loop threaded through center/i);
  });

  it("on-model single-top keeps V-drape through one bail", () => {
    const block = buildPendantBailTopologyLockBlock(true);
    expect(block).toMatch(/continuous necklace chain/i);
    expect(block).toMatch(/V-drape/i);
  });

  it("product mode preserves both attachment bails for dual-bail SKUs", () => {
    const block = buildPendantBailTopologyLockBlock(false);
    expect(block).toMatch(/left and right.*attachment bails/i);
    expect(block).toMatch(/does \*\*not\*\* thread through the motif center/i);
  });
});