# Matrik — Cloudflare Worker v5

Professional vehicle-details redesign.

## Improvements
- Cleans raw RegCheck engine strings (example: `1.0 67ch (03-2017 > ---- )` -> `1.0 L · 67 ch`)
- Cleans generation/variant strings
- Separates category and fiscal power
- Hides invalid `0 CV` as `Non communiquée`
- Shows transmission only when RegCheck supplies it
- Adds a cleaner vehicle-summary strip
- Keeps live RegCheck lookup and Cloudflare variable persistence from v4

## Cloudflare
Keep this secret:
`REGCHECK_USERNAME`

Test plate:
223 تونس 818
(API: `818TU223`)
