# Website and iOS data parity

Prepared October 8, 2026. Website baseline: `TrueSolutionsLLC/restroom-report-web`, commit `5143d1b`. iOS source remains version 1.13 (1). These are local source changes; no website, Firebase, or App Store deployment has occurred.

## What now matches

| Information | Shared contract |
|---|---|
| Total ratings | All currently stored `reviews` documents with `userId` equal to the current Firebase UID. Server aggregate; independent of cached profile counters, decoded history, and history limits. |
| Recent rating history | Ordered by `createdAt` before limiting. Web shows up to 250 personal ratings; iOS Profile shows five. A history length is never the lifetime total. |
| Contributor status | Evaluated `users/{uid}/reputation/summary`, schema version 1. Credited reports, verified reports, unique locations, corroborations, next level and progress remain distinct from raw rating totals. Missing summaries do not imply an earned badge. |
| Crowd | New writes use `empty`, `light`, `moderate`, `busy`, `packed`. Historical web `quiet` decodes and scores as `light`. Unknown values remain invalid. |
| Individual CleanScore | Cleanliness plus odor, shared amenity/safety bonuses and crowd adjustments, clamped to 0–10. Web previously doubled cleanliness. |
| Station score and recommendation | Persisted station aggregate, displayed to one decimal; original unrounded value determines Worth the Stop (7+), Use if Needed (5+), or Keep Driving. Missing/invalid scores or no reports are Unrated. Loaded review subsets never replace the aggregate. |
| Guest upgrades | Apple and Google link a new provider to the current anonymous UID. A credential already belonging to another account produces an explicit collision; no automatic account merge. |
| Profile metadata | Sign-in cannot overwrite rating/photo activity counts or reputation fields. Returning Apple/Google sign-in retains a stored real name when no name is supplied; routine Google identity does not replace a custom name. Google linking replaces the generated guest name when it supplies a real name. |
| Review submission | Rating, global lock, station lock and activity increment commit together. Global cooldown 30 seconds; same-stop cooldown 15 minutes. |
| Web proximity | Fresh browser location at form opening and submission. Age at most 30 seconds, accuracy at most 100 m, distance at most 230 m plus accuracy and no more than the rules' 350 m ceiling. Permission denial cannot bypass verification. Only distance, accuracy and verification time accompany the rating; precise traveler coordinates are not stored in the review. |
| Saved and Avoided | Selecting one removes the same stop from the other list. |
| Final review deletion | Backend clears score/count and last review time, while retaining actual photo count, station identity and latest real issue-report activity. No reviews means Unrated; no remaining issue reports means no report timestamp. |
| Sample data | Native live-Firebase seeding removed. Legacy backend seed endpoint rejects without accessing Firestore. Mock locations, counts and scores remain limited to local previews/tests/demo mode. |

The web account screen distinguishes loading, unavailable and successful zero totals. Each history/reputation stream fails independently. Subscription cleanup and async request guards prevent old accounts or stops from replacing current state. Closing or navigating away invalidates pending location work; changing UID clears personal drafts. Sign-out leaves creation of the next guest to the account observer, avoiding two concurrent anonymous sign-ins.

## Source changes

| Files | Reason |
|---|---|
| iOS `FirebaseUserProfileRepository.swift`, `FirestoreMapper.swift`, `UserProfile+Auth.swift` | Server count and metadata preservation. |
| iOS `FirebaseAuthenticationManager.swift`, `AuthModels.swift` | Fresh profile retrieval, provider linking, identity and overlapping-request guards, explicit collisions. |
| iOS `ProfileViewModel.swift`, `ProfileView.swift` | Safe refreshed history; profile observer follows session identity so count updates cannot trigger refresh loops. |
| iOS `FirebaseReviewRepository.swift` | One atomic review/locks/activity batch. |
| iOS `CrowdLevel.swift` | Historical crowd compatibility. |
| iOS authentication, profile persistence, profile parity and crowd compatibility tests | Focused regressions for the behaviors above. |
| Web `app/lib/firestore.ts` | Shared queries, counts, reputation, account linking, transactions and submission batch. |
| Web `app/lib/firebase.ts` | Lazy OAuth resolver avoids Safari/mobile initialization blocking the guest account; the popup and redirect flows still receive their explicit resolver. |
| Web `reviewContract.ts`, `reputation.ts`, `accountPolicy.ts` and tests | Validated, independently testable data contracts and request guards. |
| Web `app/page.tsx`, `app/globals.css` | Honest metrics/history/status, canonical options, fresh location gating and explicit existing-account recovery. |
| Web `app/components/LeafletRestroomMap.tsx` | Fixes a map lifecycle error found in development QA. Each effect owns the exact map it creates and removes; Strict Mode remains enabled. |
| Web `app/components/AppleRestroomMap.tsx` | Matching score colors, unrated state and one-decimal labels. |
| Web `package.json` | Reproducible test command and explicit ES module package format. |
| iOS `SettingsView.swift`, `FirebaseFunctionsClient.swift`, deleted `DeveloperStationSeeder.swift` | Removes the live Firebase sample-seeding action and both native write entry points; onboarding reset remains available. |
| Backend `firebase/functions/index.js` and three added test files | Historical crowd alias, final-review deletion, and disabled sample seeding with regressions that exercise actual handlers. |
| `.gitignore`, QA, architecture, seed plan and known issues documentation | Excludes installed backend dependencies and records current data/release boundaries. |

## Public data audit

Unauthenticated read-only Firestore aggregates on October 8 found **97 stations and 24 mismatched stored rating counts**. All 24 retained the exact counts and scores from `MockSeedStations.swift`: 22 had no persisted reviews; Casey's Chesterfield and Love's Wentzville had one each while claiming 21 and 71. Across all station records, stored counts totaled 905 versus 48 matching reviews. Ordered and unordered counts agreed for every station, so missing `createdAt` fields did not cause this snapshot's discrepancies.

[Station-only audit JSON](public-station-audit-20261008.json) contains IDs, public station names, scores and aggregate counts; no traveler IDs or review content. The earlier seed plan explicitly identifies the addresses as representative placeholders. Cleanup must verify the locations as well as counters and preserve the two stops with actual contributions until their linkage is reviewed. The exact original seed writer was not established; both native and backend writers existed in source.

No audited station or traveler contribution records were changed. Disabling seed writers and repairing aggregation in source prevents recurrence after deployment; it does not remove the existing sample records. See [cleanup review](CLEANUP_REVIEW.md).

## Validation and release boundaries

Final build/test results are recorded in the completion update below. Tests use mocked repositories or pure contracts; no existing registered traveler account was inspected and no live review was submitted. Local browser QA used production Firebase’s normal anonymous session/profile initialization and public station reads; it did not invoke backend callables or edit audited station data.

Before publishing:

- Verify the same real account/provider and UID on iOS and web, including a user with more ratings than the visible history limit.
- Complete real Apple/Google guest linking and collision QA on authorized domains. Existing contributions spread across separate UIDs require a separately reviewed repair; these changes do not merge them.
- Verify the deployed rules and indexes match the checked-in files. The required `reviews` user/station descending indexes already exist in the iOS repository. Server enforcement of the atomic batch is not established by unit tests. Emulator integration was unavailable because this host has no Firebase CLI or Java runtime.
- Test physical near/far/low-accuracy/denied-location behavior and shared cooldowns. Ensure failed submissions preserve the form and do not show success.
- Review the website's dependency audit and refresh Next.js with its matching ESLint configuration before release. Read-only audit reports 18 total vulnerable package entries, 10 production entries. Audit's forced Firebase downgrade is unsuitable. Critical advisories have conditional exposure; the current app disables image optimization and does not use `next/og`. See the [official Next release](https://github.com/vercel/next.js/releases/tag/v16.4.0), [ImageResponse advisory](https://github.com/vercel/next.js/security/advisories/GHSA-vcvr-r3jv-pc5j), [AVIF advisory](https://github.com/vercel/next.js/security/advisories/GHSA-2xp9-vwfh-vxw4), and [gRPC advisory](https://github.com/grpc/grpc-node/security/advisories/GHSA-m9gg-hp2v-232j). No dependency upgrades were folded into this data milestone.
- Approve the concrete release changes before pushing the website's auto-deploying branch or deploying Firebase functions. No rules are weakened by this milestone.

The web count subscriber observes the user's complete review query before refreshing the server aggregate. This covers deletions outside the displayed history, but downloads those own-user records; a server-maintained authoritative aggregate would reduce reads for very large histories. iOS retains only a same-session cached profile if a fresh read fails. Historical station aggregate scores are not rewritten here; the backend changes apply when a station is next recalculated after deployment.

## Completion update

- iOS Debug build/test: **241 tests passed, zero failures**, iPhone 18 Pro / iOS 27 simulator. Result bundle `/tmp/RestroomReportParityTestsVerified.xcresult`; log `/tmp/restroom-report-parity-tests-verified.log`. Includes 25 added auth/profile/crowd regressions over the 216-test UI checkpoint.
- Final iOS Release build: **BUILD SUCCEEDED**, `/tmp/restroom-report-parity-release-final.log`. No Swift compiler warnings; Xcode still emits its existing AppIntents metadata-skipped warning because that framework is absent. Physical iPhone/Watch and iOS 18 behavior remain release QA.
- Web: **52 Node tests passed**, full ESLint passed without warnings, production build passed with TypeScript validation. Node 26.7.0; locked dependency versions unchanged. Permanent-checkout logs `/private/tmp/restroom-web-permanent-tests.log`, `/private/tmp/restroom-web-permanent-lint.log`, `/private/tmp/restroom-web-permanent-build.log`.
- Backend: **24 tests passed**, including actual final-review deletion, remaining issue-report activity and no-access sample-seeding handlers; `/private/tmp/restroom-backend-parity-tests-final.log`. No live trigger or callable was invoked.
- Browser: final production preview connected the anonymous account and public stations, displayed a successful zero rating total and unavailable contributor status, and opened contribution history. Phone layout at 390 × 844 had no horizontal page overflow; viewport restored afterward. The initial successful production preview had no console errors/warnings at the check. A later Firebase transport interruption showed unavailable totals with retry instead of false zero; the permanent preview recovered to connected zero after reload. Development preview additionally verified denied/unavailable location blocks the rating form. Provider sign-in, real proximity submissions and nonzero private account parity remain unchecked.
- Verified captures: [desktop profile](web-profile.jpg), JPEG 1280 × 720; [phone profile](web-profile-mobile.jpg), JPEG 390 × 844. These show an actual anonymous account with no ratings, not fabricated traveler activity. The website visual/onboarding overhaul is the next milestone.
- Website saved at `/Users/robbiemacbookpro/Desktop/iOS Apps/Restroom Report Web`, branch `codex/web-ios-data-parity`. All source files matched the working clone by SHA-256; dependencies and build cache were excluded from copying. Git history retained at baseline `5143d1b`; no commit, push or deployment.

Local source implementation is complete. Release QA, dependency refresh, identity-confirmed account reconciliation and the separately reviewed existing sample-data cleanup remain outstanding.


## Subsequent release hardening

The October 8 dependency, shared-data privacy, authoritative metric and emulator work is tracked in [RELEASE_READINESS.md](RELEASE_READINESS.md). Earlier version/audit/test figures above describe their original checkpoint. Nothing has been published.
