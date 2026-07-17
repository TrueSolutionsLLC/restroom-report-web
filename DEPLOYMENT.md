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

## Custom domain

After the first App Hosting deployment succeeds, add both custom domains:

- `restroom-report.com`
- `www.restroom-report.com`

Firebase will display the exact DNS records to enter at Network Solutions. Replace the existing under-construction A records only after Firebase provides those records.
