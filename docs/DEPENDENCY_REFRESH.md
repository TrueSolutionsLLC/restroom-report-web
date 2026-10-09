# Website dependency refresh — October 8, 2026

The compatible dependency refresh removes every finding from the production npm audit. The complete audit now contains five high-severity package entries, all propagated from one unpatched development-only `braces` advisory. This is a local source and lockfile change; it has not been committed, pushed, or deployed.

## Verified audit results

The original lockfile was saved before editing and independently audited again with `--omit=dev --package-lock-only`. Counts below are vulnerable package entries, including affected parents; they are not counts of distinct security issues or proof that every advisory is reachable in this application.

| Audit | Before | After |
| --- | --- | --- |
| All dependencies | 18: 1 critical, 15 high, 2 moderate | 5 high |
| Production dependencies (`--omit=dev`) | 10: 1 critical, 7 high, 2 moderate | 0 |

Evidence from the refresh is saved at `/private/tmp/restroom-audit-before-20261008.json`, `/private/tmp/restroom-audit-prod-before-20261008.json`, `/private/tmp/restroom-audit-after-20261008.json`, and `/private/tmp/restroom-audit-prod-after-20261008.json`. Re-run the audit before deployment because the advisory database can change.

## Changes and selection

| Package | Original resolved version | Refreshed resolved version |
| --- | --- | --- |
| `next`, `eslint-config-next` | 16.2.10 | 16.3.8 |
| `firebase` | 12.16.0 | 12.19.0 |
| `@firebase/firestore` | 4.16.0 | 4.17.2 |
| `@grpc/grpc-js` | 1.9.16 | 1.13.6 |
| `postcss` | 8.5.19 | 8.5.23 |
| `sharp` | 0.34.5 | 0.35.5 |
| `baseline-browser-mapping` | 2.10.43 | 2.11.27 |
| `browserslist` | 4.28.6 | 4.29.3 |
| `js-yaml` | 4.3.0 | 4.3.2 |
| `nanoid` | 3.3.16 | 3.3.20 |
| `source-map-js` | 1.2.1 | 1.2.2 |

`brace-expansion` also resolves to its compatible patched versions, 1.1.21 and 5.0.12. React and React DOM remain 19.2.6. The existing ESM configuration and test script are preserved.

Next.js 16.4.0 is the current stable registry release. Version 16.3.8 was selected because its September 30 security release includes the current advisory fixes while avoiding the additional feature release. The framework and its lint configuration stay on the same version. The former broad PostCSS override is removed: Next 16.3.8 already declares patched PostCSS 8.5.23. Its supported Sharp range resolves to patched 0.35.5. Sources: [Next 16.3.8 release](https://github.com/vercel/next.js/releases/tag/v16.3.8), [Next 16.4.0 release](https://github.com/vercel/next.js/releases/tag/v16.4.0), [published Next 16.3.8 metadata](https://registry.npmjs.org/next/16.3.8).

Firebase stays on its existing major version, with the declared minimum raised to `^12.19.0`. This compatible release includes fixes for Safari IndexedDB reconnection during popup authentication and fallback when storage cannot initialize. Firebase 13.0.0, published October 7, is a separate major migration. Source: [Firebase JavaScript release notes](https://firebase.google.com/support/release-notes/js#version_12190_-_september_9_2026).

Firestore still declares the old gRPC 1.9 range. A nested override applies `@grpc/grpc-js: 1.13.6` specifically beneath `@firebase/firestore`. Version 1.13.6 is a maintainer-published patched release for the September certificate validation and error disclosure advisories; it stays on gRPC major version 1. This deliberately overrides Firestore's narrower declared range and therefore still needs deployment-environment integration validation. Sources: [gRPC 1.13.6 release](https://github.com/grpc/grpc-node/releases/tag/%40grpc%2Fgrpc-js%401.13.6), [certificate validation advisory](https://github.com/grpc/grpc-node/security/advisories/GHSA-m9gg-hp2v-232j), [Firestore package metadata](https://registry.npmjs.org/@firebase%2Ffirestore/4.17.2).

Other vulnerable transitive packages were refreshed within their parents' existing supported ranges. No `npm audit fix --force`, Firebase downgrade, or replacement lint framework was used.

## Remaining development finding

The five remaining full-audit entries are the single chain `eslint-config-next → @next/eslint-plugin-next → fast-glob → micromatch → braces`. `braces` 3.0.3 is still the latest published version, and [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) lists no patched version. Both Next lint configurations 16.3.8 and 16.4.0 retain the affected dependency. A supported parent update cannot remove this chain today. The npm suggested downgrade to Next lint configuration 14.2.35 is not a compatible fix for the current framework.

This chain is development-only in the installed graph and is absent from `npm audit --omit=dev`. The application's source does not import these glob libraries. The resulting exposure assessment is that the remaining advisory concerns lint/build tooling consuming malicious patterns, rather than a discovered user-facing runtime path. Keep tooling inputs trusted and reassess when the package or Next lint plugin publishes a supported fix. This is not a claim of a fully clean dependency audit.

## Validation and boundary

- Installed from the updated package manifest and lockfile using `npm install --ignore-scripts`, followed by targeted compatible transitive updates.
- 73 existing regression tests passed after the refresh.
- `tsc --noEmit --incremental false` passed.
- Scoped lint of the Firebase initialization and Firestore integration passed with the updated Next lint configuration.
- Real Firebase/Firestore module import, Firestore construction and termination, and gRPC client construction and closure passed in a local smoke check without network requests.
- `npm ls` confirms the patched versions and the intended gRPC override without invalid dependency errors.

These checks do not validate live Google/Apple account linking, real Firestore writes, actual browser geolocation, or Firebase App Hosting's deployed transport. Final application lint, production build, browser checks, and a production-environment smoke test remain part of release validation. Test logs are `/private/tmp/restroom-dependency-tests-20261008.log`, `/private/tmp/restroom-dependency-types-20261008.log`, and `/private/tmp/restroom-dependency-lint-20261008.log`.

Changed source files for this refresh: `package.json`, `package-lock.json`, and this document.
