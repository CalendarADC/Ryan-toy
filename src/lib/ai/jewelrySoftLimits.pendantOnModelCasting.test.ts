import { describe, expect, it } from "vitest";

import { buildPendantOnModelCastingAndWardrobeBlock } from "./jewelrySoftLimits";

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

  it("maps gothic prompt to dark wardrobe", () => {
    const block = buildPendantOnModelCastingAndWardrobeBlock("gothic dark occult pendant", "female");
    expect(block).toMatch(/gothic_dark/i);
    expect(block).toMatch(/charcoal|black/i);
  });
});