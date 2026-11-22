import assert from "node:assert/strict";
import test from "node:test";
import { smoothLinePath } from "../src/chart-lines.js";

test("smooth paths keep the recorded points and stop at reversals", () => {
  const path = smoothLinePath([[0, 0], [3, 8], [6, 2]]);
  assert.equal(path, "M0,0C1,2.6666666666666665 2,8 3,8C4,8 5,4 6,2");
});

test("separate observations with equal timestamps do not create a false interpolated segment", () => {
  assert.equal(smoothLinePath([]), "");
  assert.equal(smoothLinePath([[0, 4], [0, 7], [3, 7]]), "M0,4 M0,7C1,7 2,7 3,7");
});
