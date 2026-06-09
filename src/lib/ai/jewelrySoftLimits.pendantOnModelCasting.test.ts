import { describe, expect, it } from "vitest";

import {
  buildPendantOnModelCastingAndWardrobeBlock,
  buildPendantOnModelCreativeVarietyBlock,
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