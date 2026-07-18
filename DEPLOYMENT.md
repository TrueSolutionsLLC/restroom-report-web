# Restroom Report web deployment

This project is the browser and Android-friendly web version of Restroom Report.

## GitHub repository

Push this project to:

`https://github.com/TrueSolutionsLLC/restroom-report-web`

## Firebase App Hosting

In Firebase Console, open **App Hosting**, create a backend, and select:

- Repository: `TrueSolutionsLLC/restroom-report-web`
- Branch: `main`
- App root directory: `/`

Firebase will detect the Next.js application and deploy it.

## Apple Maps

The map automatically uses Apple MapKit JS when the `NEXT_PUBLIC_MAPKIT_TOKEN` environment variable is present. Without it, the existing OpenStreetMap map remains active.

1. In Apple Developer, open **Certificates, Identifiers & Profiles → Services → Maps → Configure Tokens**.
2. Create a **MapKit JS** token with **Domain** restrictions.
3. Register the bare hostnames where the web app runs (do not include `https://` or a path):
   - `restroom-report.com`
   - `www.restroom-report.com`
   - `restroom-report-web--cleanstop-fa6ee.us-central1.hosted.app`
4. Copy the resulting public token. Do not download, expose, or commit a Maps private key.
5. In Firebase Console, open **App Hosting → restroom-report-web → Settings → Environment** and add:

   `NEXT_PUBLIC_MAPKIT_TOKEN=<the public MapKit JS token>`

6. Save and create a new rollout. `NEXT_PUBLIC_` values are built into the browser bundle, so an existing rollout will not pick up the token.

If the exact Firebase hosted-app hostname differs, add the hostname shown on the backend Overview page to the Apple token before testing that preview URL.

## Custom domain

After the first App Hosting deployment succeeds, add both custom domains:

- `restroom-report.com`
- `www.restroom-report.com`

Firebase will display the exact DNS records to enter at Network Solutions. Replace the existing under-construction A records only after Firebase provides those records.
