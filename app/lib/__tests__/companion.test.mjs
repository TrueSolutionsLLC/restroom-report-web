import assert from "node:assert/strict";
import test from "node:test";
import { COMPANION, reviewCompanionMoment, stationCompanionMoment } from "../companion.ts";

test("unrated and unavailable scores cannot receive rating praise", () => {
 assert.equal(stationCompanionMoment(10, 0), COMPANION.unknown);
 assert.equal(stationCompanionMoment(null, 2), COMPANION.cautious);
 assert.equal(stationCompanionMoment(NaN, 2), COMPANION.cautious);
 assert.equal(stationCompanionMoment(8, 2), COMPANION.promising);
});
test("odor and cleanliness have distinct negative reactions", () => {
 assert.equal(reviewCompanionMoment("odor", 1).gesture, "walkout");
 assert.equal(reviewCompanionMoment("rating", 1).gesture, "recoil");
 assert.equal(reviewCompanionMoment("odor", 3).gesture, "shrug");
 for (const value of [0, 6, NaN, 1.5, false]) assert.equal(reviewCompanionMoment("odor", value), COMPANION.honest);
});
test("missing paper and soap trigger their respective prop reactions", () => {
 assert.equal(reviewCompanionMoment("paper", false).gesture, "empty");
 assert.equal(reviewCompanionMoment("soap", false).gesture, "wave");
 assert.equal(reviewCompanionMoment("paper", true).gesture, "roll");
 assert.equal(reviewCompanionMoment("soap", true).gesture, "wash");
});
test("safety and access observations never trigger crude jokes", () => {
 for (const field of ["safe", "accessible", "changingTable", "sink"])
  for (const value of [true, false]) assert.equal(reviewCompanionMoment(field, value), COMPANION.honest);
});
