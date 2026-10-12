export type CompanionMoment = { gesture: string; lines: readonly string[] };
export const COMPANION = {
 welcome: {gesture: "wave", lines: ["I’m your restroom sidekick. Terrible résumé. Excellent standards.", "Small companion. Very personal business."]},
 nearby: {gesture: "idle", lines: ["Let’s find somewhere worthy of your cheeks.", "A little planning. A lot less panic.", "Your next stop deserves more than a desperate guess."]},
 saved: {gesture: "roll", lines: ["Emergency planning. Highly recommended.", "Your backside called. It appreciates the backup plan."]},
 profile: {gesture: "salute", lines: ["Helping strangers dodge bad bathrooms. Weirdly noble.", "You bring the reports. I bring the questionable career choice."]},
 settings: {gesture: "idle", lines: ["Your app. Your rules. My eyebrows are negotiable.", "Need less of me? Switch off mascot reactions below."]},
 unknown: {gesture: "shrug", lines: ["No ratings yet. My eyebrows remain undecided.", "Uncharted bathroom territory. An honest report helps."]},
 promising: {gesture: "cheer", lines: ["Those ratings look promising. My standards approve.", "Oh. We might be fancy-pooping."]},
 cautious: {gesture: "shrug", lines: ["Check the recent reports before committing your cheeks.", "I’d read the reviews. I have a vested interest."]},
 paperNone: {gesture: "empty", lines: ["Bold of them to assume you brought your own.", "This is a terrible time to discover minimalism."]},
 paperYes: {gesture: "roll", lines: ["Backup for your backside. Excellent.", "Finally. A place that understands the assignment."]},
 soapNone: {gesture: "wave", lines: ["Let’s make that a wave.", "The handshake has been cancelled."]},
 soapYes: {gesture: "wash", lines: ["Look at us. Civilized.", "A little soap. A lot less side-eye."]},
 smellBad: {gesture: "walkout", lines: ["I came from an ass. I still have standards.", "I live in a toilet. This crossed a line."]},
 cleanBad: {gesture: "recoil", lines: ["The mop has apparently entered witness protection."]},
 okay: {gesture: "shrug", lines: ["I’ve smelled worse. In court, I’ll deny saying that."]},
 cleanGood: {gesture: "cheer", lines: ["Someone understood the assignment.", "My nostrils would book this again."]},
 honest: {gesture: "salute", lines: ["Thanks for noting that. Useful details help the next traveler."]},
 savedReview: {gesture: "salute", lines: ["One honest report. One less bathroom gamble."]},
 location: {gesture: "wave", lines: ["A nearby stop beats a heroic sprint."]},
} satisfies Record<string, CompanionMoment>;

/** Personality follows observed answers without changing any stored review value. */
export function reviewCompanionMoment(field: string, value: number | boolean): CompanionMoment {
 if (field === "rating" || field === "odor") {
   if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 5) return COMPANION.honest;
   return value >= 4 ? COMPANION.cleanGood : value <= 2 ? field === "odor" ? COMPANION.smellBad : COMPANION.cleanBad : COMPANION.okay;
 }
 if (typeof value !== "boolean") return COMPANION.honest;
 if (field === "paper") return value ? COMPANION.paperYes : COMPANION.paperNone;
 if (field === "soap") return value ? COMPANION.soapYes : COMPANION.soapNone;
 // Safety, accessibility and other factual observations receive respectful feedback.
 return COMPANION.honest;
}
export function stationCompanionMoment(score: number | null, reports: number): CompanionMoment {
 if (reports <= 0) return COMPANION.unknown;
 return score !== null && Number.isFinite(score) && score >= 8 ? COMPANION.promising : COMPANION.cautious;
}
