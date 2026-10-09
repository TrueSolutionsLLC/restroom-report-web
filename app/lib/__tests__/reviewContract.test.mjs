import assert from "node:assert/strict";
import test from "node:test";
import {
  CROWD_OPTIONS, RESTROOM_ACCESS_OPTIONS, RESTROOM_LAYOUT_OPTIONS, REVIEW_POLICY,
  buildReviewPayload, calculateCleanScore, cleanScoreBadge, evaluateReviewProximity, reviewLockPayloads, validateProximityVerification,
} from "../reviewContract.ts";

const now = Date.UTC(2026, 9, 8, 16);
const station = { latitude: 0, longitude: 0 };
const position = (meters = 0, accuracy = 10, timestamp = now) => ({
  coords: { latitude: meters / 6_371_000 * 180 / Math.PI, longitude: 0, accuracy }, timestamp,
});
const verification = () => evaluateReviewProximity(station, position(), now).verification;
const report = () => ({
  stationId: "stop-1", userId: "firebase-uid", cleanlinessRating: 4, odorRating: 3,
  crowdLevel: "light", comment: "  Helpful detail.  ",
  answers: { accessible: true, changingTable: false, sink: true, soap: true, paper: true, safe: true },
  proximityVerification: verification(),
});

test("canonical crowd options contain all five iOS values and never quiet", () => {
  assert.deepEqual(CROWD_OPTIONS.map(option => option.value), ["empty", "light", "moderate", "busy", "packed"]);
});

test("station access and layout options serialize canonical iOS values", () => {
  assert.deepEqual(RESTROOM_ACCESS_OPTIONS.map(option => option.value), [
    "unknown", "publicAccess", "customerOnly", "membershipRequired", "dayPassAvailable", "keyRequired", "employeesOnly", "temporarilyClosed",
  ]);
  assert.deepEqual(RESTROOM_LAYOUT_OPTIONS.map(option => option.value), ["unknown", "singleUser", "multiStall", "familyCompanion", "multipleRestrooms"]);
});

test("nearby accurate fresh location is verified without retaining coordinates", () => {
  const result = evaluateReviewProximity(station, position(120, 20), now);
  assert.equal(result.status, "allowed");
  assert.equal(result.verification.distanceFromStationMeters, 120);
  assert.equal(result.verification.locationAccuracyMeters, 20);
  assert.equal(result.verification.verifiedAt.getTime(), now);
  assert.deepEqual(Object.keys(result.verification).sort(), ["distanceFromStationMeters", "locationAccuracyMeters", "proximityVerified", "verifiedAt"]);
});

test("proximity accepts only the base radius plus measured accuracy", () => {
  assert.equal(evaluateReviewProximity(station, position(240, 10), now).status, "allowed");
  assert.equal(evaluateReviewProximity(station, position(241, 10), now).reason, "tooFar");
  assert.equal(evaluateReviewProximity(station, position(331, 100), now).reason, "tooFar");
  assert.equal(evaluateReviewProximity(station, position(805, 100), now).reason, "tooFar");
});

test("poor and invalid accuracy readings cannot verify a report", () => {
  for (const accuracy of [101, -1, Infinity, NaN]) {
    assert.equal(evaluateReviewProximity(station, position(0, accuracy), now).reason, "inaccurate");
  }
});

test("stale, future and missing timestamps cannot verify a report", () => {
  assert.equal(evaluateReviewProximity(station, position(0, 10, now - 30_000), now).status, "allowed");
  for (const timestamp of [now - 30_001, now + 1, NaN]) {
    assert.equal(evaluateReviewProximity(station, position(0, 10, timestamp), now).reason, "stale");
  }
});

test("invalid coordinates do not produce a distance or successful verification", () => {
  assert.equal(evaluateReviewProximity({ latitude: 91, longitude: 0 }, position(), now).reason, "unavailable");
  assert.equal(evaluateReviewProximity(station, { ...position(), coords: { latitude: NaN, longitude: 0, accuracy: 0 } }, now).reason, "unavailable");
});

test("submission revalidates proximity freshness rather than relying on opening the form", () => {
  assert.doesNotThrow(() => buildReviewPayload(report(), now + 30_000));
  assert.throws(() => buildReviewPayload(report(), now + 30_001), { code: "review/location-stale" });
});

test("payload never writes raw GPS coordinates and carries only verification metadata", () => {
  const payload = buildReviewPayload(report(), now);
  assert.equal(payload.proximityVerified, true);
  assert.equal(payload.crowdLevel, "light");
  assert.equal(payload.comment, "Helpful detail.");
  assert.equal(payload.babyChangingAvailable, false);
  assert.deepEqual(payload.photoURLs, []);
  for (const field of ["latitude", "longitude", "coords", "position", "proximityVerification"]) assert.equal(Object.hasOwn(payload, field), false);
});

test("legacy quiet and incomplete report answers cannot be written again", () => {
  assert.throws(() => buildReviewPayload({ ...report(), crowdLevel: "quiet" }, now), /Complete/);
  const missingAnswer = report();
  delete missingAnswer.answers.paper;
  assert.throws(() => buildReviewPayload(missingAnswer, now), /Complete/);
});

test("ratings outside integer one through five are rejected", () => {
  for (const value of [0, 6, 2.5, NaN, "4"]) {
    assert.throws(() => buildReviewPayload({ ...report(), cleanlinessRating: value }, now), /Complete/);
  }
});

test("malformed verification cannot bypass submission validation", () => {
  for (const changed of [
    { proximityVerified: false }, { verifiedAt: undefined }, { verifiedAt: "today" },
    { distanceFromStationMeters: 351 }, { distanceFromStationMeters: -1 },
    { distanceFromStationMeters: 241, locationAccuracyMeters: 10 }, { locationAccuracyMeters: 101 },
  ]) assert.throws(() => validateProximityVerification({ ...verification(), ...changed }, now));
});

test("known restroom metadata survives and incompatible old enums are rejected", () => {
  const payload = buildReviewPayload({ ...report(), restroomStatus: "open", restroomAccessType: "customerOnly", restroomLayoutType: "familyCompanion" }, now);
  assert.equal(payload.restroomStatus, "open");
  assert.equal(payload.restroomAccessType, "customerOnly");
  assert.equal(payload.restroomLayoutType, "familyCompanion");
  assert.throws(() => buildReviewPayload({ ...report(), restroomLayoutType: "singleStall" }, now));
  assert.throws(() => buildReviewPayload({ ...report(), restroomAccessType: "customersOnly" }, now));
});

test("station IDs cannot target nested paths and comments retain the limit", () => {
  assert.throws(() => buildReviewPayload({ ...report(), stationId: "stop/nested" }, now));
  assert.throws(() => buildReviewPayload({ ...report(), stationId: "x".repeat(128) }, now));
  assert.equal(buildReviewPayload({ ...report(), comment: "a".repeat(701) }, now).comment.length, 700);
});

test("lock timestamps match shared thirty-second and fifteen-minute rules", () => {
  const locks = reviewLockPayloads("stop-1", now);
  assert.equal(locks.station.stationId, "stop-1");
  assert.equal(locks.global.nextAllowedAt.getTime() - now, 30_000);
  assert.equal(locks.station.nextAllowedAt.getTime() - now, 15 * 60_000);
  assert.equal(REVIEW_POLICY.maximumRuleDistanceMeters, 350);
});

const scoreReview = (overrides = {}) => ({
  cleanlinessRating: 4, odorRating: 3, soapAvailable: true, toiletPaperAvailable: true,
  sinkWorking: true, feltSafe: true, babyChangingAvailable: false, accessibilityAvailable: false,
  crowdLevel: "moderate", ...overrides,
});

test("CleanScore includes odor and all shared bonuses, rather than doubling cleanliness", () => {
  assert.ok(Math.abs(calculateCleanScore(scoreReview()) - 8.3) < 1e-12);
  assert.ok(Math.abs(calculateCleanScore(scoreReview({ babyChangingAvailable: true, accessibilityAvailable: true })) - 8.6) < 1e-12);
});

test("each canonical crowd adjustment matches the iOS and backend formulas", () => {
  const adjustments = { empty: .2, light: .1, moderate: 0, busy: -.15, packed: -.35 };
  for (const [crowdLevel, adjustment] of Object.entries(adjustments)) {
    assert.ok(Math.abs(calculateCleanScore(scoreReview({ crowdLevel })) - (8.3 + adjustment)) < 1e-12);
  }
});

test("legacy quiet reviews score like light without allowing quiet in new submissions", () => {
  assert.equal(calculateCleanScore(scoreReview({ crowdLevel: "quiet" })), calculateCleanScore(scoreReview({ crowdLevel: "light" })));
  assert.throws(() => buildReviewPayload({ ...report(), crowdLevel: "quiet" }, now));
});

test("CleanScore is capped at ten and unavailable for malformed rating data", () => {
  assert.equal(calculateCleanScore(scoreReview({ cleanlinessRating: 5, odorRating: 5, crowdLevel: "empty" })), 10);
  assert.equal(calculateCleanScore(scoreReview({ cleanlinessRating: 0 })), null);
  assert.equal(calculateCleanScore(scoreReview({ odorRating: NaN })), null);
});

test("CleanScore badges match the exact iOS quality boundaries before rounding", () => {
  for (const score of [0, 2.8, 4.4, 4.999]) {
    assert.deepEqual(cleanScoreBadge(score), { label: "Keep Driving", tone: "poor" });
  }
  for (const score of [5, 6.95, 6.999]) {
    assert.deepEqual(cleanScoreBadge(score), { label: "Use if Needed", tone: "fair" });
  }
  for (const score of [7, 10]) {
    assert.deepEqual(cleanScoreBadge(score), { label: "Worth the Stop", tone: "good" });
  }
});

test("missing and invalid CleanScores never receive a quality recommendation", () => {
  for (const score of [null, undefined, NaN, Infinity, -Infinity, -0.001, 10.001, "7", "", {}, false]) {
    assert.deepEqual(cleanScoreBadge(score), { label: "Unrated", tone: "unrated" });
  }
});
