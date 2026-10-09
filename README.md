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

## Data parity milestone

See [DATA_PARITY.md](docs/DATA_PARITY.md) for shared iOS/web contracts, changed files, test evidence and release checks. The Node test suite was validated with Node 26.7.0 and uses native TypeScript loading. No dependency versions changed in this milestone.

The [public station audit](docs/public-station-audit-20261008.json) and [cleanup review](docs/CLEANUP_REVIEW.md) document existing sample totals that require a separately approved production repair. Source changes have not been deployed.

## Website experience overhaul

See [WEB_OVERHAUL.md](docs/WEB_OVERHAUL.md) for the native visual system, optional onboarding, Saved/Settings, issue reporting, sharing and browser validation. The overhaul is saved locally; deployment and the documented data/security release checks remain pending.
