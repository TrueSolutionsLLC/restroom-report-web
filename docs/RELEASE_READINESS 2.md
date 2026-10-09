# Shared release hardening — October 8, 2026

Local source work follows the approved website/iOS overhaul. Nothing is committed, pushed, deployed, repaired in production, or uploaded to App Store Connect.

## Implemented behavior

- Profile documents (including email, Saved and Avoid), raw issue details, and feedback are owner-private. Public reviews and evaluated contributor summaries remain public. Report ownership uses `reporterUserId`; `userId` never overrides that identity.
- Both clients consume `stations/{id}/issueSignals`, a server-written projection of station ID, category and original date. They show unavailable until the parent has `issueSignalsVersion: 1`. Neither reporter identities nor comments/contact details enter this public feed.
- Canonical server metrics count persisted reviews/photos. Safety is the fraction of reviews with `feltSafe === true` multiplied by ten, representing traveler experiences. Native detail uses the shared aggregate rather than a recent review subset. `metricsVersion: 2` identifies the new formula.
- Latest real review/issue activity controls freshness and dated status/access/layout. Deleting a final contribution does not invent a new timestamp or remove unrelated station identity. Server-derived metadata has provenance markers, so withdrawing its last source resets that derived value to unknown while preserving unmarked manual metadata.
- Review, photo and issue create/update/delete events recompute actual data. Repeated or delayed events cannot inflate photo counts or resurrect missing stations. Review-linked status-history sidecars follow edits/moves/deletions and are checked against the current review before publishing.
- All existing station updates are server-only. Native nearby search retains a coordinate-filtered full read until server geohashes are validated; ordinary map reads no longer rewrite shared records.
- New review/report writes validate ownership, fields, timestamps and station existence. Review proximity telemetry and shared cooldowns are enforced together with the four-write client batch. Client telemetry constraints do not prove physical GPS presence.
- Website dependencies have no findings in the production npm audit; five development entries remain from one unpatched braces advisory. See [DEPENDENCY_REFRESH.md](DEPENDENCY_REFRESH.md).

## Local validation

The web source passes 78 unit tests, full ESLint and a production build. Native Debug regression tests pass 246 cases. Firestore source rules and actual web service methods pass 41 isolated emulator tests. Backend unit tests cover canonical metrics, projections, deletion and delayed-event behavior. Final runtime/SDK validation and permanent-preview evidence are recorded in the native project's release evidence document.

The emulator uses only fixture identities and a demo project; live provider linking, GPS, real accounts, production indexes and the deployed Functions transport still require acceptance checks.

## Coordinated release gates

1. Save a verified private production backup and inventory raw reports/feedback for missing or invalid `reporterUserId`. Available native history writes both ownership fields; no historical web writer was found. Earlier releases/live ownership are unverified. Resolve ambiguous ownership through reviewed evidence before tightening rules; never infer an owner from a conflicting `userId`. Owner history/account deletion query the authoritative field.
2. Review station identities and the separate additive repair draft. Preserve real reviews/photos; do not move conflicting Love’s records or the unresolved Casey’s contribution linkage by guesswork. Old numeric aggregates remain unverified until reviewed server recomputation.
3. Deploy the supported backend only after approval, validate it in staging, then rebuild sanitized public projections and canonical metrics from backed-up records. A station needing more than 499 changed/deleted issue projections fails atomically and needs a reviewed bulk migration. Do not set readiness markers by hand or treat absent markers as zero issues.
4. Inventory legacy unlinked status history separately; new linked sidecars are cleaned by review deletion. Keep private audit artifacts private and do not automatically delete historical entries with uncertain provenance.
5. Validate matching Apple/Google UID, total ratings, guest linking/collision recovery and Saved/Avoid across iPhone/web; test real near/far/denied/stale location submissions, deletion and provider reauthentication on a physical device. Validate actual Firestore indexes and App Hosting behavior.
6. Review the rollout of clients and stricter rules together. Older clients without lock/schema/reference fields cannot be assumed compatible. Increment the native build before TestFlight, run the device checklist, and obtain coordinated release approval. GitHub main auto-deploys the website, so pushing main is a publishing action.

## Changed files

Web: `package.json`/lockfile refresh dependencies; `app/lib/firestore.ts` separates public issue signals from private history and handles readiness/disposal; `app/page.tsx` uses the public signal type; `publicIssueSignals.test.mjs` checks privacy, missing readiness and stale subscription callbacks. The approved UI/onboarding remains the previous milestone in [WEB_OVERHAUL.md](WEB_OVERHAUL.md).

Native/backend: repository aggregation fallbacks and client geohash writes are removed; issue repository/mapping and detail recovery use public signals; review-linked history has its original reference/date; rules enforce the shared ownership/schema; server handlers own canonical metrics and public projections. Full file mapping, audit and test evidence are maintained in the native repository.
