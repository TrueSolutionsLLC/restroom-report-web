export type TravelerReputationLevel = "none" | "contributor" | "verifiedContributor" | "trustedTraveler";

export type TravelerReputationSummary = {
  userId: string;
  level: TravelerReputationLevel;
  contributionCount: number;
  proximityVerifiedContributionCount: number;
  uniqueLocationCount: number;
  corroboratedContributionCount: number;
  nextLevel: TravelerReputationLevel | null;
  nextLevelProgress: number;
  schemaVersion: number;
  lastEvaluatedAt: Date;
};

export const TRAVELER_LEVEL_LABELS: Record<TravelerReputationLevel, string> = {
  none: "Traveler",
  contributor: "Contributor",
  verifiedContributor: "Verified Contributor",
  trustedTraveler: "Trusted Traveler",
};

function evaluatedDate(value: unknown): Date | null {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value : null;
  if (value && typeof value === "object" && "toDate" in value && typeof value.toDate === "function") {
    try { return evaluatedDate(value.toDate()); } catch { return null; }
  }
  return null;
}

/** A missing, incompatible or unevaluated summary is unavailable, never an earned badge. */
export function parseTravelerReputationSummary(userId: string, data: Record<string, unknown> | undefined): TravelerReputationSummary | null {
  if (!data || data.schemaVersion !== 1 || (data.userId !== undefined && data.userId !== userId)) return null;
  const level = data.level;
  if (typeof level !== "string" || !Object.hasOwn(TRAVELER_LEVEL_LABELS, level)) return null;
  const expectedNext: Record<TravelerReputationLevel, TravelerReputationLevel | null> = {
    none: "contributor", contributor: "verifiedContributor", verifiedContributor: "trustedTraveler", trustedTraveler: null,
  };
  if (data.nextLevel !== expectedNext[level as TravelerReputationLevel]) return null;
  const fields = ["contributionCount", "proximityVerifiedContributionCount", "uniqueLocationCount", "corroboratedContributionCount"] as const;
  if (!fields.every(key => typeof data[key] === "number" && Number.isSafeInteger(data[key]) && (data[key] as number) >= 0)) return null;
  const progress = data.nextLevelProgress;
  if (typeof progress !== "number" || !Number.isFinite(progress) || progress < 0 || progress > 1) return null;
  const lastEvaluatedAt = evaluatedDate(data.lastEvaluatedAt);
  if (!lastEvaluatedAt) return null;
  return {
    userId,
    level: level as TravelerReputationLevel,
    contributionCount: data.contributionCount as number,
    proximityVerifiedContributionCount: data.proximityVerifiedContributionCount as number,
    uniqueLocationCount: data.uniqueLocationCount as number,
    corroboratedContributionCount: data.corroboratedContributionCount as number,
    nextLevel: data.nextLevel as TravelerReputationLevel | null,
    nextLevelProgress: progress,
    schemaVersion: 1,
    lastEvaluatedAt,
  };
}
