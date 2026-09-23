# Matrik — Cloudflare Workers version

This version is built specifically for Cloudflare Workers + Static Assets.

## Why the previous Cloudflare deployment failed
The assets directory was set to `.` so Wrangler tried to upload the whole repository, including `node_modules`. A `workerd` binary was 127 MiB, above Cloudflare's 25 MiB per-asset limit.

This project fixes that by putting static files only in `public/` and using `assets.directory = "./public"`.

## Deploy in Cloudflare
1. Upload/import this project (not the old ZIP/repository).
2. Build/deploy command: `npm run deploy` (or `npx wrangler deploy`).
3. In the Cloudflare Worker project, add a secret/environment variable:
   - Name: `REGCHECK_USERNAME`
   - Value: your RegCheck username
4. Redeploy.
5. Test the RegCheck sample plate in the Matrik UI: `223 تونس 818`.

Do not put the RegCheck username in `public/index.html`.

## RS plates
RS is supported by the UI and backend using the `RS` code. Test a real RS plate before advertising RS support publicly because the provider documentation does not include a live RS sample.
