import { describe, expect, it } from "vitest";
import { buildTrainingChainResolver, type TrainingMasters } from "@/lib/training-chain";

const MASTERS: TrainingMasters = {
  types: ["Farmers and Farm Women", "Rural Youth", "Skill Development Training", "Other"],
  areas: [
    { type: "Farmers and Farm Women", name: "Crop Production" },
    { type: "Farmers and Farm Women", name: "Fisheries" },
    { type: "Skill Development Training", name: "Crop Production" },
    { type: "Rural Youth", name: "Other" },
  ],
  themes: [
    { type: "Farmers and Farm Women", area: "Crop Production", name: "Integrated Nutrient Management" },
    { type: "Farmers and Farm Women", area: "Crop Production", name: "Other" },
    { type: "Farmers and Farm Women", area: "Fisheries", name: "Fish Seed Production" },
    { type: "Skill Development Training", area: "Crop Production", name: "Nursery Management" },
  ],
};

const resolve = buildTrainingChainResolver(MASTERS);
const row = (trainingType: string | null, trainingArea: string | null, thematicArea: string | null) => ({ trainingType, trainingArea, thematicArea });

describe("training chain resolver", () => {
  it("keeps a chain that the masters define", () => {
    expect(resolve(row("Farmers and Farm Women", "Crop Production", "Integrated Nutrient Management"))).toEqual({
      type: "Farmers and Farm Women",
      area: "Crop Production",
      thematic: "Integrated Nutrient Management",
    });
  });

  it("groups a typed Training Type under Other, with its area and thematic area", () => {
    expect(resolve(row("Khet Bachao Abhiyan", "Soil conservation", "Other"))).toEqual({ type: "Other", area: "Other", thematic: "Other" });
    expect(resolve(row("Training under Natural Farming", "Natural Farming", "Natural farming"))).toEqual({ type: "Other", area: "Other", thematic: "Other" });
  });

  it("treats a case or spacing difference as the same name, not a new one", () => {
    expect(resolve(row("skill development Training", " crop  production ", "nursery management"))).toEqual({
      type: "Skill Development Training",
      area: "Crop Production",
      thematic: "Nursery Management",
    });
  });

  it("groups a typed Training Area under Other, keeping the real type", () => {
    expect(resolve(row("Farmers and Farm Women", "Apiary", "Bee Keeping"))).toEqual({ type: "Farmers and Farm Women", area: "Other", thematic: "Other" });
  });

  it("groups a typed Thematic Area under Other, keeping the real type and area", () => {
    expect(resolve(row("Farmers and Farm Women", "Crop Production", "INM"))).toEqual({
      type: "Farmers and Farm Women",
      area: "Crop Production",
      thematic: "Other",
    });
  });

  it("checks the area against its own type, not any type", () => {
    // Fisheries exists under Farmers and Farm Women only.
    expect(resolve(row("Skill Development Training", "Fisheries", "Fish Seed Production"))).toEqual({
      type: "Skill Development Training",
      area: "Other",
      thematic: "Other",
    });
  });

  it("keeps a real Other from the masters as Other", () => {
    expect(resolve(row("Rural Youth", "Other", "Anything typed here"))).toEqual({ type: "Rural Youth", area: "Other", thematic: "Other" });
  });

  it("leaves blanks as Not specified rather than Other", () => {
    expect(resolve(row(null, null, null))).toEqual({ type: "Not specified", area: "Not specified", thematic: "Not specified" });
    expect(resolve(row("Farmers and Farm Women", "Crop Production", ""))).toEqual({
      type: "Farmers and Farm Women",
      area: "Crop Production",
      thematic: "Not specified",
    });
  });
});
