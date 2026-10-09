/** Matches IssueReportType.reportFormCases in the native app, in the same order. */
export const ISSUE_REPORT_OPTIONS = [
  { value: "incorrectStationInfo", label: "Incorrect station info", prompt: "Describe what is wrong with the name, address, or location." },
  { value: "accessInfoWrong", label: "Access info wrong", prompt: "What is wrong with the listed restroom access?" },
  { value: "notPublic", label: "Restroom not public", prompt: "How is access restricted? Any signs or staff notes?" },
  { value: "customerOnly", label: "Restroom is customer only", prompt: "Is the restroom limited to paying customers?" },
  { value: "membershipRequired", label: "Restroom is membership required", prompt: "Is a membership required to use the restroom?" },
  { value: "keyRequired", label: "Restroom is key required", prompt: "Do you need a key or code from staff?" },
  { value: "restroomClosed", label: "Restroom closed", prompt: "When did you find it closed? Any signs or staff notes?" },
  { value: "outOfOrder", label: "Out of order", prompt: "What was broken or unavailable in the restroom?" },
  { value: "layoutInfoWrong", label: "Restroom layout info wrong", prompt: "What’s the correct layout — single-user, multi-stall, or family?" },
  { value: "stallCountWrong", label: "Stall count info wrong", prompt: "About how many stalls does this restroom have?" },
  { value: "familyRestroomInfoWrong", label: "Family restroom info wrong", prompt: "Is there a family/companion restroom, or was that listed by mistake?" },
  { value: "unsafeLocation", label: "Unsafe location", prompt: "Describe the safety concern so moderators can review." },
  { value: "fakeReview", label: "Fake review", prompt: "Which review seems misleading or fake?" },
  { value: "other", label: "Other", prompt: "Tell us what happened." },
] as const;

export type IssueReportType = typeof ISSUE_REPORT_OPTIONS[number]["value"];
export type IssueReportSubmissionInput = {
  userId: string;
  stationId: string;
  stationName: string;
  issueType: IssueReportType;
  comment?: string;
};

export class IssueReportContractError extends Error {
  code = "issue/invalid-report";

  constructor(message: string) {
    super(message);
    this.name = "IssueReportContractError";
  }
}

/** Ownership and field names match FirestoreMapper.issueReportDocument. */
export function buildIssueReportPayload(input: IssueReportSubmissionInput) {
  const validId = (value: string) => typeof value === "string" && value.length > 0 && value.length < 128 && !value.includes("/");
  if (!validId(input.userId) || !validId(input.stationId)
    || typeof input.stationName !== "string" || !input.stationName.trim()) {
    throw new IssueReportContractError("The stop or account could not be identified.");
  }
  if (!ISSUE_REPORT_OPTIONS.some(option => option.value === input.issueType)) {
    throw new IssueReportContractError("Choose the issue that needs attention.");
  }
  if (input.comment !== undefined && typeof input.comment !== "string") {
    throw new IssueReportContractError("The report details could not be read.");
  }
  const comment = input.comment?.trim() ?? "";
  if (comment.length > 700) throw new IssueReportContractError("Keep report details to 700 characters or fewer.");
  return {
    stationId: input.stationId,
    stationName: input.stationName.trim(),
    issueType: input.issueType,
    reporterUserId: input.userId,
    userId: input.userId,
    status: "new" as const,
    ...(comment ? { comment } : {}),
  };
}
