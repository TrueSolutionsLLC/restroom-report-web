# Restroom Report Web

Browser and Android web version of Restroom Report. Built with Next.js and Firebase for deployment through Firebase App Hosting.

The web app uses Apple MapKit JS when `NEXT_PUBLIC_MAPKIT_TOKEN` is configured. It keeps a Leaflet/OpenStreetMap fallback so the restroom map remains usable if Apple Maps is unavailable.

## Development

```bash
npm ci
npm test
npm run lint
npm run build
npm run dev
```

Firebase project: `cleanstop-fa6ee`.

Copy `.env.example` to `.env.local` for local development and add a domain-restricted **MapKit JS** token. Never add an Apple Maps private key or `.p8` file to this repository.

## Published release — October 9, 2026

[PR 12](https://github.com/TrueSolutionsLLC/restroom-report-web/pull/12) merged as main commit `c5a30e937364a860f4b41535cfe8fb6f896be846`. The redesigned website is live through Firebase App Hosting on Node 22, with a READY build receiving 100% of traffic. All 13 shared Gen 2 Functions are ACTIVE on Node 22. Reviewed migration and paired snapshots verified 98 canonical stations, two sanitized public issue signals and 121 contributor summaries, with raw traveler data and station identities unchanged during that interval. Owner-private profile, raw-report and feedback rules are published. See [RELEASE_READINESS.md](docs/RELEASE_READINESS.md) for evidence and remaining acceptance checks.

Native version 1.13 (2) is in release preparation; the public App Store version remains 1.9. A temporary server-controlled compatibility path preserves validated 1.9 review submissions through `2026-11-08T05:45:00Z`, without requiring its clients to write new review locks. Owner/schema/proximity validation and private data protections remain enforced. Close the path after the compatible native release is available and adopted. Live provider linking and physical-location acceptance remain outstanding.

## Data parity history

[DATA_PARITY.md](docs/DATA_PARITY.md) retains the October 8 preparation checkpoint. The current reproducible runtime is Node 22.23.3; the existing 78-test suite, lint and production build passed locally and in pinned GitHub CI before publication. Dependency refresh and runtime details are in [DEPENDENCY_REFRESH.md](docs/DEPENDENCY_REFRESH.md) and [RUNTIME_AND_CI.md](docs/RUNTIME_AND_CI.md).

The historical [public station audit](docs/public-station-audit-20261008.json) and [cleanup review](docs/CLEANUP_REVIEW.md) retain unresolved location/linkage questions. Canonical aggregate recalculation is complete; uncertain station identities and contribution linkage were preserved for separate review.

## Website experience overhaul

See [WEB_OVERHAUL.md](docs/WEB_OVERHAUL.md) for the published native visual system, optional onboarding, Saved/Settings, issue reporting, sharing and the clearly dated preparation/browser evidence.
