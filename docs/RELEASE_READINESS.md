# Shared release hardening — published October 9, 2026

The redesigned website and shared backend are published. [PR 12](https://github.com/TrueSolutionsLLC/restroom-report-web/pull/12) passed both pinned Node 22 CI checks and merged as main commit `c5a30e937364a860f4b41535cfe8fb6f896be846`. App Hosting build `build-2026-10-09-001` is READY with 100% traffic, and its Cloud Run revision is healthy. The backend runtime was aligned to Node 22 before merging; all 13 Gen 2 Functions are ACTIVE on Node 22.

A private recursive backup preceded the reviewed migration. Independent comparison of the before/after snapshots verified all 98 canonical stations, two exact three-field public issue signals and 121 contributor summaries, with zero raw traveler-data additions/removals/changes and zero station identity changes during that interval. All station geohashes were validated. Four required composite indexes were READY and preserved. Owner-private profile, raw-report and feedback rules were published after the ownership inventory passed; live unauthenticated checks confirm private profiles/reports/release controls return 403 while public stations and sanitized issue signals remain readable.

Native 1.13 (2) is in release preparation; the public App Store version remains 1.9. Published rules include a server-controlled compatibility path for its single-review submissions, expiring at `2026-11-08T05:45:00Z`. It retains ownership, schema, station, timestamp and proximity validation, checks existing cooldowns, and rejects partial review-lock changes. Release controls remain private. Legacy clients cannot advance the new cooldowns atomically, so close this path after the compatible native version is available and adopted; do not treat it as permanent parity. No native upload/publication or live provider/GPS acceptance is claimed here.

## Implemented behavior

- Profile documents (including email, Saved and Avoid), raw issue details, and feedback are owner-private. Public reviews and evaluated contributor summaries remain public. Report ownership uses `reporterUserId`; `userId` never overrides that identity.
- Both clients consume `stations/{id}/issueSignals`, a server-written projection of station ID, category and original date. They show unavailable until the parent has `issueSignalsVersion: 1` and no `issueSignalsMigrationRequired` flag. Neither reporter identities nor comments/contact details enter this public feed.
- Canonical server metrics count persisted reviews/photos. Safety is the fraction of reviews with `feltSafe === true` multiplied by ten, representing traveler experiences. Native detail uses the shared aggregate rather than a recent review subset. `metricsVersion: 2` identifies the new formula.
- Latest real review/issue activity controls freshness and dated status/access/layout. Deleting a final contribution does not invent a new timestamp or remove unrelated station identity. Server-derived metadata has provenance markers, so withdrawing its last source resets that derived value to unknown while preserving unmarked manual metadata.
- Review, photo and issue create/update/delete events recompute actual data. Repeated or delayed events cannot inflate photo counts or resurrect missing stations. All ten background triggers opt into retries for transient failures; permanent issue-feed capacity failures revoke public readiness, mark the station for reviewed migration and complete without an endless retry loop. Independent cleanup/contributor failures still retry. Review-linked status-history sidecars follow edits/moves/deletions and are checked against the current review before publishing.
- Contributor credit validates both supporting reviews inside transactions. Deletion, moves and incompatible edits remove stale corroborations; delayed events cannot recreate deleted reviews. Invalid-pair removal and its author's current summary commit together, so transient failures and concurrent deletions cannot strand stale contributor credit. The reviewed production migration recalculated all 121 contributor summaries. The backfill comparison uses the complete supporting-review snapshot rather than only one author's reviews.
- All existing station updates are server-only. All 98 production station geohashes were validated; ordinary map reads no longer rewrite shared records.
- New review/report writes validate ownership, fields, timestamps and station existence, with timestamps between 30 seconds before and 60 seconds after server time to accommodate bounded device-clock skew. Review proximity telemetry and shared cooldowns are enforced together with the four-write client batch. Client telemetry constraints do not prove physical GPS presence.
- Website dependencies have no findings in the production npm audit; five development entries remain from one unpatched braces advisory. The paired Functions package now uses Node 22, Admin 14.5.0 and Functions 7.4.0; its production and full audits are zero. The emulator CLI retains separate development-tool advisories and is never deployed.

## October 8 preparation validation (historical)

This section preserves the local prepublication checkpoint. The later native release-preparation checkpoint passes 255 tests at version 1.13 (2). The bounded compatibility rules pass 92 isolated emulator checks: 57 rules/web, 28 actual Admin and seven runner safety checks, with zero failures or skips. Current website Node 22 validation remains 78 tests plus lint and production build.

The saved permanent website passes 78 unit tests, full ESLint and its production build. Native Debug regression tests pass 246 cases and the final Release build passes. All 90 backend unit tests pass under official checksum-verified Node 22.23.3 with the refreshed SDKs. Firestore rules and actual client methods pass 45 isolated emulator cases; actual Admin persistence handlers pass 28 focused backend/migration emulator cases under Node 22, with seven isolated-runner safety checks (80 checks total, no failures or skips). Exact replay commands/source checksums and the final combined evidence are in the native project's EMULATOR_VALIDATION.md.

The local permanent browser preview loads a real public stop, shows unmigrated issue feeds as Unavailable, and retains connected guest totals. Desktop and 390×844 captures are saved; no horizontal page overflow was seen. The final reload rendered the station details correctly; retained browser logs contain earlier transient Firestore Listen transport warnings, so staging network/offline recovery remains an acceptance check. The viewport was restored. No provider sign-in, real GPS permission, rating/report or saved-list test mutation was submitted.

The emulator uses only fixture identities and a demo project. Production runtime, required indexes, website rollout and public/private rule behavior were subsequently verified. Live provider linking, physical GPS behavior and shared real-account acceptance remain outstanding.

## Publication evidence and remaining acceptance

1. Completed: private production backup, authoritative ownership inventory, reviewed metric/public-signal/reputation migration, stricter privacy rules, Node 22 Functions and website publication. Paired snapshots verified data preservation. No related staging project was found among eight accessible Firebase projects; isolated emulator coverage preceded the authorized production rollout.
2. Review uncertain station identities and contribution linkage separately. Real reviews/photos were preserved; conflicting Love’s records and unresolved Casey’s linkage were not moved by guesswork. Canonical numeric aggregate recalculation is complete.
3. Preserve the projection capacity guard: a station needing more than 499 changed/deleted issue projections remains unavailable until reviewed bulk migration. Do not set readiness by hand or treat absent markers as zero issues. All 98 stations passed the current reviewed migration.
4. Inventory legacy unlinked status history separately. New linked sidecars are cleaned by review deletion. Keep private audit artifacts private and preserve historical entries with uncertain provenance.
5. Validate matching Apple/Google UID, total ratings, guest linking/collision recovery and Saved/Avoid across iPhone/web; test real near/far/denied/stale location submissions, deletion and provider reauthentication on a physical device. Read-only live browser checks verified onboarding, public station details and a connected guest profile; they did not grant GPS/provider access or submit contributions.
6. Complete native 1.13 (2) delivery and device acceptance, then close the server-owned 1.9 compatibility path after adoption and before its `2026-11-08T05:45:00Z` expiry. GitHub main automatically publishes the website, so subsequent polish remains on a reviewed feature PR until coordinated merge.

## Changed files

Web: `package.json`/lockfile refresh dependencies; `app/lib/firestore.ts` separates public issue signals from private history and handles readiness/disposal; `app/page.tsx` uses the public signal type; `publicIssueSignals.test.mjs` checks privacy, missing readiness and stale subscription callbacks. The approved UI/onboarding remains the previous milestone in [WEB_OVERHAUL.md](WEB_OVERHAUL.md).

Native/backend: repository aggregation fallbacks and client geohash writes are removed; issue repository/mapping and detail recovery use public signals; review-linked history has its original reference/date; rules enforce the shared ownership/schema; server handlers own canonical metrics and public projections. Full file mapping, audit and test evidence are maintained in the native repository.


## Preview evidence

- [Connected guest profile](release-readiness/web-profile-final.jpg), JPEG 1280×720
- [Unmigrated public issue feed](release-readiness/web-issue-unavailable-final.jpg), JPEG 1280×720
- [Phone issue availability](release-readiness/web-issue-mobile-final.jpg), JPEG 390×844

These October 8 captures preserve the permanent local prepublication preview with ordinary anonymous identity/public station reads. Private traveler accounts and production repairs were not inspected or applied during that preview. The later authorized production migration and live publication are recorded above.
