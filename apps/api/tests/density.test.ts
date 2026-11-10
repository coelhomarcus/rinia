import assert from "node:assert/strict";
import { test } from "bun:test";
import { updateDensitySchema } from "@rinia/shared";

test("density is comfortable or compact", () => {
    assert.equal(updateDensitySchema.parse({ density: "compact" }).density, "compact");
    assert.equal(updateDensitySchema.parse({ density: "comfortable" }).density, "comfortable");
    assert.equal(updateDensitySchema.safeParse({ density: "dense" }).success, false);
    assert.equal(updateDensitySchema.safeParse({}).success, false);
});
