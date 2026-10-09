import assert from "node:assert/strict";
import test from "node:test";
import { parseTravelerReputationSummary, TRAVELER_LEVEL_LABELS } from "../reputation.ts";

const summary = (overrides = {}) => ({
  userId: "uid-one", level: "verifiedContributor", contributionCount: 10,
  proximityVerifiedContributionCount: 8, uniqueLocationCount: 5, corroboratedContributionCount: 1,
  nextLevel: "trustedTraveler", nextLevelProgress: .875, schemaVersion: 1,
  lastEvaluatedAt: new Date("2026-10-08T16:00:00Z"), ...overrides,
});

test("reads evaluated server summary metrics and progress without recalculating from raw ratings", () => {
  const parsed = parseTravelerReputationSummary("uid-one", summary());
  assert.equal(parsed.level, "verifiedContributor");
  assert.equal(parsed.contributionCount, 10);
  assert.equal(parsed.uniqueLocationCount, 5);
  assert.equal(parsed.corroboratedContributionCount, 1);
  assert.equal(parsed.nextLevelProgress, .875);
});

test("a missing or unevaluated reputation summary is unavailable", () => {
  assert.equal(parseTravelerReputationSummary("uid-one", undefined), null);
  assert.equal(parseTravelerReputationSummary("uid-one", {}), null);
  assert.equal(parseTravelerReputationSummary("uid-one", summary({ lastEvaluatedAt: null })), null);
});

test("an evaluated new traveler is valid and has no invented badge", () => {
  const parsed = parseTravelerReputationSummary("uid-one", summary({
    level: "none", contributionCount: 0, proximityVerifiedContributionCount: 0,
    uniqueLocationCount: 0, corroboratedContributionCount: 0, nextLevel: "contributor", nextLevelProgress: 0,
  }));
  assert.equal(parsed.level, "none");
  assert.equal(TRAVELER_LEVEL_LABELS[parsed.level], "Traveler");
});

test("highest level has no further level and keeps its actual supported report count", () => {
  const parsed = parseTravelerReputationSummary("uid-one", summary({ level: "trustedTraveler", nextLevel: null, nextLevelProgress: 1, corroboratedContributionCount: 3 }));
  assert.equal(parsed.nextLevel, null);
  assert.equal(parsed.corroboratedContributionCount, 3);
});

test("unknown schema, mismatched owner and invalid level are unavailable", () => {
  for (const changed of [{ schemaVersion: 2 }, { userId: "uid-two" }, { level: "superTraveler" }, { nextLevel: "contributor" }]) {
    assert.equal(parseTravelerReputationSummary("uid-one", summary(changed)), null);
  }
});

test("partial, negative and nonnumeric metrics cannot silently become zero", () => {
  for (const changed of [{ uniqueLocationCount: undefined }, { contributionCount: -1 }, { corroboratedContributionCount: "5" }, { nextLevelProgress: NaN }, { nextLevelProgress: 1.1 }]) {
    assert.equal(parseTravelerReputationSummary("uid-one", summary(changed)), null);
  }
});

test("Firestore timestamps are supported and malformed dates are unavailable", () => {
  const date = new Date("2026-10-08T16:00:00Z");
  assert.equal(parseTravelerReputationSummary("uid-one", summary({ lastEvaluatedAt: { toDate: () => date } })).lastEvaluatedAt, date);
  assert.equal(parseTravelerReputationSummary("uid-one", summary({ lastEvaluatedAt: new Date(NaN) })), null);
  assert.equal(parseTravelerReputationSummary("uid-one", summary({ lastEvaluatedAt: { toDate: () => { throw new Error(); } } })), null);
});
