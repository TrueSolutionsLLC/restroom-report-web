# Website runtime and CI — October 8, 2026

The website declares Node.js 22 in `package.json`, with matching root metadata in `package-lock.json`. The [Web CI workflow](../.github/workflows/web-ci.yml) pins Node.js 22.23.3 and runs `npm ci`, `npm test`, `npm run lint`, and `npm run build` for pull requests, pushes and manual runs. A separate Node 24 test job is unnecessary: the existing TypeScript-importing tests pass under Node 22.23.3.

Node's built-in TypeScript stripping is enabled by default from 22.18.0, so local test runs require a recent Node 22 patch. Type stripping does not type-check the application; the Next production build performs its existing TypeScript check. Sources: [Node 22 TypeScript documentation](https://nodejs.org/download/release/v22.23.3/docs/api/typescript.html), [Next installation requirements](https://nextjs.org/docs/app/getting-started/installation).

The workflow uses Ubuntu 24.04, read-only repository contents permission, and checkout without persisted Git credentials. Official checkout 7.0.1 and setup-node 7.1.0 are pinned to their verified release commit IDs. The actions themselves run on GitHub's Node 24 action runtime; application commands run on the selected Node 22.23.3. Sources: [checkout release](https://github.com/actions/checkout/releases/tag/v7.0.1), [setup-node release](https://github.com/actions/setup-node/releases/tag/v7.1.0), [GitHub action pinning guidance](https://docs.github.com/en/actions/reference/security/secure-use).

## Local validation

The exact four workflow commands passed in a fresh `/private/tmp/restroom-web-node22-ci-20261008` workspace using the officially checksummed Node.js 22.23.3 runtime and npm 10.9.9. Dependency/build caches and local `.env` files were excluded from the source copy; the checked-in `.env.example` was retained. `npm ci` installed the lockfile without changing its hash.

- Tests: 78 passed, zero failures or skips.
- Lint: passed with no diagnostics.
- Production build and TypeScript checking: passed; all nine routes were generated, including the dynamic Firebase auth helper proxy.
- Workflow YAML parsed successfully and its command list/runtime match the local checks.

Complete install, test, lint and build outputs are preserved in [runtime-ci](runtime-ci/). The separate production audit remains clean; the install reports the already documented five development-only `braces` advisory entries. Dependency versions and overrides were not changed by this runtime work. See [dependency refresh](DEPENDENCY_REFRESH.md).

These are local macOS ARM64 results. The GitHub-hosted Linux workflow has not run yet; its actual check is required before merging. The workflow validates source and does not deploy, invoke production Firebase handlers or use provider credentials.

## App Hosting rollout check

App Hosting supports Node.js 22 and higher, and requires the selected backend runtime to agree with `package.json` engines. Verify the existing backend's runtime and select `nodejs22` before publishing this manifest; an existing `nodejs24` selection would conflict with the declared Node 22 major. The backend runtime was not inspected or changed by this local CI task. Source: [App Hosting runtimes and automatic base image updates](https://firebase.google.com/docs/app-hosting/frameworks-tooling#runtimes_for_app_hosting).

The current App Hosting support table designates Next.js 15.2 as active and treats newer framework versions as preview. The approved Next.js 16.3.8 security refresh is retained. Local `next build` success does not establish App Hosting adapter compatibility; confirm the actual Cloud Build/App Hosting build and deployed routes during rollout. Source: [App Hosting framework support](https://firebase.google.com/docs/app-hosting/frameworks-tooling#nextjs_support_schedule).

Changed files: `.github/workflows/web-ci.yml`, root engine metadata in `package.json` and `package-lock.json`, this document and its saved logs. No Git commit, push, merge, deployment, or permanent-checkout edit was performed by this task.
