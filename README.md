# Restroom Report Web

Browser and Android web version of Restroom Report. Built with Next.js and Firebase for deployment through Firebase App Hosting.

The web app uses Apple MapKit JS when `NEXT_PUBLIC_MAPKIT_TOKEN` is configured. It keeps a Leaflet/OpenStreetMap fallback so the restroom map remains usable if Apple Maps is unavailable.

## Development

```bash
npm install
npm run lint
npm run build
npm run dev
```

Firebase project: `cleanstop-fa6ee`.

Copy `.env.example` to `.env.local` for local development and add a domain-restricted **MapKit JS** token. Never add an Apple Maps private key or `.p8` file to this repository.
