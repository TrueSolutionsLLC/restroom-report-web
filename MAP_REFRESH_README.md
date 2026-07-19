# Restroom Report map refresh and hardening

This overlay is built for the current `TrueSolutionsLLC/restroom-report-web` main branch.

It adds:

- reliable MapKit viewport detection after pan and zoom on desktop and mobile;
- automatic Firestore location refresh 0.7 seconds after movement stops;
- a centered **Search this area** button for immediate refresh;
- clearing of stale search text before newly loaded map results are shown;
- replacement of pins and removal of an out-of-bounds selected restroom when bounds change;
- MapKit's `region-change-end` event plus pointer, touch, and wheel fallbacks;
- Next.js dependency and PostCSS override hardening with a zero-vulnerability production audit.

After extracting this ZIP into a fresh clone, run:

```bash
npm ci
npm run lint
npm run build
```

Then commit and push the changes. Firebase App Hosting will start a rollout from `main`.
