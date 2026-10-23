import test from "node:test"
import assert from "node:assert/strict"
import { clampSliderValue } from "./src/lib/slider-value.ts"

test("slider number edits stay within whole-number bounds", () => {
  assert.equal(clampSliderValue(5001, 500, 10000, 5000), 5001)
  assert.equal(clampSliderValue(12000, 500, 10000, 5000), 10000)
  assert.equal(clampSliderValue(-1, 500, 10000, 5000), 500)
  assert.equal(clampSliderValue(2500.6, 500, 10000, 5000), 2501)
  assert.equal(clampSliderValue(NaN, 500, 10000, 5000), 5000)
  assert.equal(clampSliderValue(Infinity, 500, 10000, 5000), 5000)
})
