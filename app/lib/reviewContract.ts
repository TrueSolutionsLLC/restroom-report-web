export const CROWD_OPTIONS = [
  { value: "empty", label: "Empty" },
  { value: "light", label: "Light" },
  { value: "moderate", label: "Moderate" },
  { value: "busy", label: "Busy" },
  { value: "packed", label: "Packed" },
] as const;

export const RESTROOM_ACCESS_OPTIONS = [
  { value: "unknown", label: "Not sure" },
  { value: "publicAccess", label: "Public" },
  { value: "customerOnly", label: "Customers only" },
  { value: "membershipRequired", label: "Membership required" },
  { value: "dayPassAvailable", label: "Day pass available" },
  { value: "keyRequired", label: "Key required" },
  { value: "employeesOnly", label: "Employees only" },
  { value: "temporarilyClosed", label: "Temporarily closed" },
] as const;

export const RESTROOM_LAYOUT_OPTIONS = [
  { value: "unknown", label: "Not sure" },
  { value: "singleUser", label: "Single-user / private" },
  { value: "multiStall", label: "Multiple stalls" },
  { value: "familyCompanion", label: "Family / companion" },
  { value: "multipleRestrooms", label: "Multiple restrooms" },
] as const;

export type CrowdLevel = typeof CROWD_OPTIONS[number]["value"];
export type RestroomAccessType = typeof RESTROOM_ACCESS_OPTIONS[number]["value"];
export type RestroomLayoutType = typeof RESTROOM_LAYOUT_OPTIONS[number]["value"];
export type RestroomStatus = "open" | "closed" | "outOfOrder" | "employeesOnly" | "unknown";

export type CleanScoreTone = "good" | "fair" | "poor" | "unrated";
export type CleanScoreBadge = {
  label: "Worth the Stop" | "Use if Needed" | "Keep Driving" | "Unrated";
  tone: CleanScoreTone;
};

export function isValidCleanScore(score: unknown): score is number {
  return typeof score === "number" && Number.isFinite(score) && score >= 0 && score <= 10;
}

/** Matches the iOS badge thresholds using the score before display rounding. */
export function cleanScoreBadge(score: unknown): CleanScoreBadge {
  if (!isValidCleanScore(score)) return { label: "Unrated", tone: "unrated" };
  if (score >= 7) return { label: "Worth the Stop", tone: "good" };
  if (score >= 5) return { label: "Use if Needed", tone: "fair" };
  return { label: "Keep Driving", tone: "poor" };
}

export const REVIEW_POLICY = {
  proximityRadiusMeters: 230,
  maximumLocationAccuracyMeters: 100,
  maximumRuleDistanceMeters: 350,
  maximumLocationAgeMs: 30_000,
  minimumIntervalBetweenReviewsMs: 30_000,
  minimumIntervalSameStationMs: 15 * 60_000,
} as const;

type Coordinates = { latitude: number; longitude: number };
type Position = { coords: Coordinates & { accuracy: number }; timestamp: number };

export type ReviewProximityVerification = {
  proximityVerified: true;
  distanceFromStationMeters: number;
  locationAccuracyMeters: number;
  verifiedAt: Date;
};

export type ReviewProximityEvaluation =
  | { status: "allowed"; verification: ReviewProximityVerification }
  | { status: "blocked"; reason: "unavailable" | "stale" | "inaccurate" | "tooFar"; message: string };

const validCoordinate = (coordinate: Coordinates) =>
  Number.isFinite(coordinate.latitude) && Math.abs(coordinate.latitude) <= 90
  && Number.isFinite(coordinate.longitude) && Math.abs(coordinate.longitude) <= 180;

function distanceMeters(a: Coordinates, b: Coordinates) {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const latitudeDifference = radians(b.latitude - a.latitude);
  const longitudeDifference = radians(b.longitude - a.longitude);
  const haversine = Math.sin(latitudeDifference / 2) ** 2
    + Math.cos(radians(a.latitude)) * Math.cos(radians(b.latitude)) * Math.sin(longitudeDifference / 2) ** 2;
  return 6_371_000 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, haversine))));
}

export function evaluateReviewProximity(station: Coordinates, position: Position, now = Date.now()): ReviewProximityEvaluation {
  if (!validCoordinate(station) || !validCoordinate(position.coords) || !Number.isFinite(now)) {
    return { status: "blocked", reason: "unavailable", message: "Your location could not be verified. Try locating yourself again." };
  }
  const age = now - position.timestamp;
  if (!Number.isFinite(age) || age < 0 || age > REVIEW_POLICY.maximumLocationAgeMs) {
    return { status: "blocked", reason: "stale", message: "Your location reading is too old. Get a fresh location and try again." };
  }
  const accuracy = position.coords.accuracy;
  if (!Number.isFinite(accuracy) || accuracy < 0 || accuracy > REVIEW_POLICY.maximumLocationAccuracyMeters) {
    return { status: "blocked", reason: "inaccurate", message: "Your location is not accurate enough to verify this stop. Try again nearby." };
  }
  const distance = distanceMeters(position.coords, station);
  if (distance > REVIEW_POLICY.proximityRadiusMeters + accuracy || distance > REVIEW_POLICY.maximumRuleDistanceMeters) {
    return { status: "blocked", reason: "tooFar", message: "You need to be near this restroom to submit a report." };
  }
  return {
    status: "allowed",
    verification: {
      proximityVerified: true,
      distanceFromStationMeters: Math.ceil(distance),
      locationAccuracyMeters: Math.ceil(accuracy),
      verifiedAt: new Date(position.timestamp),
    },
  };
}

export class ReviewContractError extends Error {
  code: string;

  constructor(message: string, code = "review/invalid-report") {
    super(message);
    this.name = "ReviewContractError";
    this.code = code;
  }
}

export function validateProximityVerification(verification: ReviewProximityVerification, now = Date.now()) {
  const age = now - (verification?.verifiedAt instanceof Date ? verification.verifiedAt.getTime() : NaN);
  if (verification?.proximityVerified !== true || !Number.isFinite(age) || age < 0 || age > REVIEW_POLICY.maximumLocationAgeMs) {
    throw new ReviewContractError("Get a fresh location before submitting your report.", "review/location-stale");
  }
  const accuracy = verification.locationAccuracyMeters;
  const distance = verification.distanceFromStationMeters;
  if (!Number.isInteger(accuracy) || accuracy < 0 || accuracy > REVIEW_POLICY.maximumLocationAccuracyMeters
    || !Number.isInteger(distance) || distance < 0
    || distance > REVIEW_POLICY.proximityRadiusMeters + accuracy || distance > REVIEW_POLICY.maximumRuleDistanceMeters) {
    throw new ReviewContractError("Your location could not be verified near this restroom.", "review/location-unverified");
  }
}

export type ReviewSubmissionInput = {
  stationId: string;
  userId: string;
  cleanlinessRating: number;
  odorRating: number;
  comment: string;
  crowdLevel: CrowdLevel;
  answers: Record<string, boolean>;
  proximityVerification: ReviewProximityVerification;
  restroomStatus?: RestroomStatus;
  restroomAccessType?: RestroomAccessType;
  restroomLayoutType?: RestroomLayoutType;
};

export function buildReviewPayload(input: ReviewSubmissionInput, now = Date.now()) {
  const validDocumentId = (id: string) => typeof id === "string" && id.length > 0 && id.length < 128 && !id.includes("/");
  if (!validDocumentId(input.stationId) || !validDocumentId(input.userId)) {
    throw new ReviewContractError("The stop or account could not be identified.");
  }
  if (typeof input.comment !== "string"
    || ![input.cleanlinessRating, input.odorRating].every(value => Number.isInteger(value) && value >= 1 && value <= 5)
    || !CROWD_OPTIONS.some(option => option.value === input.crowdLevel)
    || !["accessible", "changingTable", "sink", "soap", "paper", "safe"].every(key => typeof input.answers?.[key] === "boolean")) {
    throw new ReviewContractError("Complete the required report answers before submitting.");
  }
  if ((input.restroomStatus !== undefined && !["open", "closed", "outOfOrder", "employeesOnly", "unknown"].includes(input.restroomStatus))
    || (input.restroomAccessType !== undefined && !RESTROOM_ACCESS_OPTIONS.some(option => option.value === input.restroomAccessType))
    || (input.restroomLayoutType !== undefined && !RESTROOM_LAYOUT_OPTIONS.some(option => option.value === input.restroomLayoutType))) {
    throw new ReviewContractError("The restroom details could not be verified.");
  }
  validateProximityVerification(input.proximityVerification, now);
  return {
    stationId: input.stationId,
    userId: input.userId,
    cleanlinessRating: input.cleanlinessRating,
    odorRating: input.odorRating,
    accessibilityAvailable: input.answers.accessible,
    babyChangingAvailable: input.answers.changingTable,
    sinkWorking: input.answers.sink,
    soapAvailable: input.answers.soap,
    toiletPaperAvailable: input.answers.paper,
    feltSafe: input.answers.safe,
    crowdLevel: input.crowdLevel,
    comment: input.comment.trim().slice(0, 700),
    photoURLs: [] as string[],
    proximityVerified: true,
    distanceFromStationMeters: input.proximityVerification.distanceFromStationMeters,
    locationAccuracyMeters: input.proximityVerification.locationAccuracyMeters,
    verifiedAt: input.proximityVerification.verifiedAt,
    ...(input.restroomStatus !== undefined ? { restroomStatus: input.restroomStatus } : {}),
    ...(input.restroomAccessType !== undefined ? { restroomAccessType: input.restroomAccessType } : {}),
    ...(input.restroomLayoutType !== undefined ? { restroomLayoutType: input.restroomLayoutType } : {}),
  };
}

export function reviewLockPayloads(stationId: string, now = Date.now()) {
  return {
    station: { stationId, nextAllowedAt: new Date(now + REVIEW_POLICY.minimumIntervalSameStationMs) },
    global: { nextAllowedAt: new Date(now + REVIEW_POLICY.minimumIntervalBetweenReviewsMs) },
  };
}

type ScoreReview = {
  cleanlinessRating: number;
  odorRating: number;
  soapAvailable: boolean;
  toiletPaperAvailable: boolean;
  sinkWorking: boolean;
  feltSafe: boolean;
  babyChangingAvailable: boolean;
  accessibilityAvailable: boolean;
  crowdLevel: string;
};

/** Mirrors CleanScoreCalculator.fromReview and the shared station aggregation function. */
export function calculateCleanScore(review: ScoreReview): number | null {
  if (![review.cleanlinessRating, review.odorRating].every(value => Number.isInteger(value) && value >= 1 && value <= 5)) return null;
  let score = review.cleanlinessRating + review.odorRating;
  if (review.soapAvailable) score += .35;
  if (review.toiletPaperAvailable) score += .35;
  if (review.sinkWorking) score += .35;
  if (review.feltSafe) score += .25;
  if (review.babyChangingAvailable) score += .15;
  if (review.accessibilityAvailable) score += .15;
  if (review.crowdLevel === "empty") score += .2;
  // Historical web reviews used "quiet" for the same low-crowd choice as iOS "light".
  if (review.crowdLevel === "light" || review.crowdLevel === "quiet") score += .1;
  if (review.crowdLevel === "busy") score -= .15;
  if (review.crowdLevel === "packed") score -= .35;
  return Math.min(10, Math.max(0, score));
}
