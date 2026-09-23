# Matrik — Cloudflare Worker v4

This version fixes Cloudflare dashboard variable persistence.

## What changed
- `wrangler.jsonc` now has `"keep_vars": true`.
- Added `/api/status` so you can verify whether `REGCHECK_USERNAME` is available to the Worker without exposing its value.

## Setup
1. Deploy this v4 ZIP.
2. Cloudflare Worker > Settings > Variables and Secrets > Add.
3. Key: `REGCHECK_USERNAME`
4. Value: your RegCheck username.
5. Choose **Secret**.
6. Enable **Production**.
7. Click Deploy.
8. Open:
   `https://YOUR-WORKER.workers.dev/api/status`
9. You should see:
   `{"ok":true,"regcheckConfigured":true}`
10. Test the public sample plate:
    223 تونس 818
    which becomes `818TU223`.

Do not place the RegCheck credential in frontend JavaScript.
