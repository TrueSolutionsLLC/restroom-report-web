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
 paperNone: {gesture: "leaf", lines: ["Emergency kit: one leaf. I should’ve packed a forest.", "Bold of them to assume you brought your own."]},
 paperYes: {gesture: "roll", lines: ["Backup for your backside. Excellent.", "Finally. A place that understands the assignment."]},
 soapNone: {gesture: "withdraw", lines: ["Let’s make that a wave.", "The handshake has been cancelled."]},
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

/** Prepared verdict only; no comment, identity, location, or history input. */
export function savedReviewDebrief(rating: number, odor: number, answers: Record<string, boolean | null>): {title:string; line:string; moment:CompanionMoment} {
 if(rating>=4&&odor>=4&&answers.paper===true&&answers.soap===true)
  return {title:"Royal Flush",line:"Soap. Paper. Fresh air. I’ve accidentally booked the presidential suite.",moment:{gesture:"royal",lines:["I’ll be accepting tips in two-ply."]}};
 if(answers.paper===false&&answers.soap===false)
  return {title:"Bathroom Survivor",line:"No soap. No paper. I brought standards. Apparently I should’ve brought supplies.",moment:{gesture:"shrug",lines:["Please forward my mail to a better bathroom."]}};
 if(answers.paper===false)return {title:"The missing roll",line:"They supplied the bathroom. You supply the plot twist.",moment:COMPANION.paperNone};
 if(answers.soap===false)return {title:"Contactless greetings",line:"Nice enough stop. All future greetings will be contactless.",moment:COMPANION.soapNone};
 if(odor<=2&&odor>=1)return {title:"Standards intact",line:"I came from an ass. I still have standards.",moment:COMPANION.okay};
 return {title:"One less bathroom gamble",line:"One honest report. A better heads-up for the next traveler.",moment:COMPANION.savedReview};
}
