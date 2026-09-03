# Cloudflare Worker — public verification backend

The whole public face of the system: a QR verification page and a private PDF gateway. It never writes anything, anywhere.

## Routes

| Route | Purpose |
| --- | --- |
| `GET /v/{docNo}?t={token}` | Verification page; mints a 5-minute signed PDF link |
| `GET /file/{docNo}?exp&mode&sig` | Streams the PDF from Restricted Drive storage |

Everything else — including the auto-assigned `*.workers.dev` hostname — returns `404`.

Full route documentation: [`../docs/en/04-worker-api.md`](../docs/en/04-worker-api.md).

## Configuration

| Name | Type | Purpose |
| --- | --- | --- |
| `OFFICIAL_HOST` | var | The only hostname allowed to serve traffic |
| `CLINIC_NAME` | var | Organisation name shown on the pages |
| `SIGNER_NAME` | var | Name shown as approver / revoker |
| `GOOGLE_SHEETS_ID` | var | Registry spreadsheet id |
| `APPROVED_FOLDER_ID` | var | The authoritative Drive folder id |
| `GCP_SERVICE_ACCOUNT_JSON` | **secret** | Read-only Service Account credential |
| `FILE_TICKET_SECRET` | **secret** | HMAC key for the file tickets |

## Deploy

```bash
cd worker

# one-time: set the secrets
npx wrangler secret put GCP_SERVICE_ACCOUNT_JSON
npx wrangler secret put FILE_TICKET_SECRET      # openssl rand -base64 48

npx wrangler deploy
```

Then bind the custom domain in the dashboard: **Workers & Pages → your worker → Domains → Add Domain**, and set `OFFICIAL_HOST` to that exact hostname.

## Notes

- `googleHealthCheck_()` exists but is deliberately not routed. It reports whether the Google credentials work, which is not public information — wire it behind an authenticated path if you need it.
- Token and signature comparisons use `constantTimeEqual_`.
- The Google access token is minted per cold start; scopes are `drive.readonly` and `spreadsheets.readonly` only.
