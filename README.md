# Matrik — Cloudflare Worker v3

This version fixes the vehicle-search button.

## Deploy
1. Upload/import this project to Cloudflare Workers.
2. In Worker Settings > Variables and Secrets, add:
   REGCHECK_USERNAME = your RegCheck username
3. Redeploy.
4. Open the site and test the public sample plate:
   series 223 / number 818
   (API format: 818TU223)

The website calls `/api/lookup` on the same Worker, so the RegCheck username stays server-side.
