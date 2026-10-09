# Website experience overhaul — 2026-10-08

## Implemented locally

The website now follows the approved native graphite, warm-white and jade direction. The rejected Wayfinder and Field Guide studies were not used. This milestone builds on the data parity work documented in [DATA_PARITY.md](DATA_PARITY.md).

- Consolidated visual styles replace accumulated gradient/glass overrides. Nearby has coordinated map controls, focused stop details, and a responsive map/list layout.
- New Saved and private Avoid pages resolve IDs through the existing shared station cache, including stops outside the current map area. Removed/missing locations have a removal action.
- Profile, contribution history and Settings share the same navigation and honest per-stream loading/error states. Rating totals remain based on persisted reviews for the current UID, not capped history or cached profile counters.
- Settings persists System/Light/Dark appearance and Standard/Satellite map style. Optional analytics can be accepted or revoked; declining does not initialize Analytics. Pending initialization respects newer consent choices.
- First-run onboarding introduces Find, Decide and Contribute, then optional location and account setup. Guests can skip both. Completion storage is guarded and versioned; the welcome guide can be replayed. Existing-account collisions expose the explicit account resolution flow.
- A separate issue report flow uses the 14 native form categories, optional details and a single report document write. It does not increase ratings or reputation. New issue documents include both supported ownership fields and a location name; old categories receive native labels in history.
- Share generates a station URL, shows a copyable fallback link, and reopens the station from the shared cache. Pending links survive reconnects; deliberate browsing cancels deferred navigation.
- Native dialogs contain keyboard focus, restore it on dismissal, and announce success headings. Map pins include station names in accessible labels. Text scaling is no longer capped.
- Location lookup callbacks use request generations so older/abandoned lookups cannot overwrite later navigation or a newer result.

## Changed files in this milestone

| Files | Purpose |
| --- | --- |
| `app/page.tsx` | Map/discovery layout, Saved, Settings, issue reporting, sharing, onboarding integration and lifecycle guards |
| `app/components/AppDialog.tsx` | Native modal focus, Escape, backdrop and restoration behavior |
| `app/components/WelcomeGuide.tsx`, `welcome-guide.css` | Optional first-run/replay flow and responsive illustrations |
| `app/components/LeafletRestroomMap.tsx` | Accessible station pin labels |
| `app/globals.css`, `app/legal.css` | Consolidated light/dark native visual system, phone/landscape/safe-area layouts |
| `app/layout.tsx`, `public/manifest.webmanifest` | Zoom access and matching browser/install colors |
| `public/restroom-brand-mark.svg` | Verified native brand artwork |
| `app/lib/onboarding.ts`, `issueReportContract.ts` | Guarded completion storage and issue payload validation |
| `app/lib/firebase.ts`, `firestore.ts` | Analytics consent lifecycle and real issue persistence/history mapping |
| `app/lib/__tests__/onboarding.test.mjs`, `issueReportContract.test.mjs`, `firebaseAnalyticsConsent.test.mjs` | Completion storage, native issue schema and consent race regression coverage |
| `README.md`, this document | Development and release evidence |

Dependency versions and lockfile remain unchanged. Native app source/version was not changed in this milestone.

## Validation

- All **73 web tests pass**, including six onboarding, seven issue contract and eight analytics consent cases.
- Full ESLint and production Next.js build pass.
- CSS and manifest parse; `git diff --check` passes.
- Browser QA at 1280×720, 390×844, 320×568, 844×390 and 896×414 checks navigation, compact controls, scrollable details, Saved/Avoid empty states, and Settings.
- The complete five-panel onboarding path works with location/account skipped, stays completed after reload, and replays from Settings. Manual dark mode applies to the guide; short-screen layout keeps the first Continue button visible.
- Appearance and map style survive reload. Escape restores the originating Profile focus; panel transitions focus headings.
- A real public Sinclair station is opened from the list and reopened using its generated station URL. The native issue categories and key/code contextual prompt render without submitting a report.
- Temporary Firebase connectivity failure produced unavailable/retry states; after reconnection the guest profile loaded zero actual ratings and no fabricated earned contributor status.

Local QA uses public stations and the website's ordinary anonymous session. No rating, issue, saved-list mutation, repair or provider sign-in was submitted for testing. GPS permission was not granted. This does not establish live provider linking, real device proximity submission, screen-reader behavior, Apple Maps fallback recovery or installed-PWA behavior.

## Before release

Source is saved locally and has not been committed, pushed or deployed. GitHub main deploys through Firebase App Hosting.

The public station audit and existing sample-derived aggregates still need the separately reviewed [cleanup](CLEANUP_REVIEW.md); a UI refresh cannot establish that those existing totals are correct. Complete the dependency/security refresh recorded in DATA_PARITY.md, then shared iPhone/web account and physical-device validation before publishing. Native iOS release/upload work remains separate.

## Review screenshots

These are captures of the permanent local production preview, not design fixtures.

- [Desktop onboarding](web-overhaul/web-onboarding-desktop.jpg) — 1280×720
- [Desktop map and selected public stop](web-overhaul/web-map-desktop.jpg) — 1280×720
- [Mobile onboarding](web-overhaul/web-onboarding-mobile.jpg) — 390×844
- [Mobile guest profile](web-overhaul/web-profile-mobile.jpg) — 390×844

The preceding data-parity checkpoint is preserved in the native project's `docs/web-overhaul/pre-ui-web-source-20261008.tar.gz`. Source file hashes are recorded in `source-sync-20261008.json`.


## Subsequent release hardening

The October 8 dependency, shared-data privacy, authoritative metric and emulator work is tracked in [RELEASE_READINESS.md](RELEASE_READINESS.md). Earlier version/audit/test figures above describe their original checkpoint. Nothing has been published.
