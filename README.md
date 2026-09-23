# Matrik — Cloudflare Worker v2

This version intentionally uses a single root `worker.js` file. There is no `src/` folder and no static-assets directory, avoiding Cloudflare build-root and oversized-asset issues.

## Deploy
1. Upload/import this project with these files at the project root.
2. Build command: leave blank (or use `npm install` only if your flow requires it).
3. Deploy command: `npx wrangler deploy`.
4. In Cloudflare Worker settings, add secret/environment variable: `REGCHECK_USERNAME` = your RegCheck username.
5. Redeploy.

Do not put the RegCheck username into browser JavaScript.
