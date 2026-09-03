# 06 · Deployment

Six stages. Do them in this order — each one produces an identifier the next one needs.

Every identifier below is a placeholder. Nothing in this repository contains a production value.

---

## 1 · Google Drive

Create a Shared Drive (or a folder in one) with three subfolders:

```
VivaMed Documents
├── 01 — Tasdiqlanishi kerak    pending      employees upload here
├── 02 — Tasdiqlangan           approved     issued PDFs live here
└── 03 — Arxiv                  archive      originals and rejects
```

Set the **approved** folder's general access to **Restricted**. There must be no "anyone with the link" permission on it or on anything inside it — the Worker reaches those files through the Drive API, not through a share link.

Note each folder's id from its URL.

## 2 · Google Sheets — the registry

Create a spreadsheet with two sheets, named exactly:

- **`Reyestr`** — headers in `A1:P1`, matching [the registry schema](03-registry-schema.md)
- **`Sozlamalar`** — key in column A, value in column B, no header row

Fill in the settings sheet completely. Every key in the schema, not just the four the diagnostics check — a missing key falls back to a hard-coded default silently, which is how a stale signer name ends up on a medical document.

Note the spreadsheet id from its URL.

## 3 · Apps Script — the add-on

1. Create a standalone Apps Script project.
2. Add the files from [`../../apps-script/`](../../apps-script/): `Config.gs`, `Registry.gs`, `PdfStamp.gs`, `Code.gs`, `WebApp.gs`, `Verify.html`, and replace the manifest with `appsscript.json`.
3. **Services → add Drive API v3** (advanced service, symbol `Drive`). `Code.gs` uses `Drive.Files.copy` and `Drive.Permissions`.
4. **Project Settings → Script Properties → add `SHEETS_ID`** with the spreadsheet id — or open the add-on's Settings card and paste it there.
5. Deploy → **Test deployments → Install** to try it in Drive.

The home card runs `Config.diagnose()` and lists whatever is still missing, so use it as the checklist.

**If the add-on vanishes from the Drive panel**, the manifest has most likely reverted to an empty state. There is no error message for this — the code still runs, Drive just stops showing it. Work in a single browser tab and hard-refresh after a long break.

**`urlFetchWhitelist` is enforced for versioned deployments**, not for test deployments. Deploying a version without it fails; this was the project's first serious deployment error.

## 4 · Google Cloud — API access for the Worker

The Worker does not run inside Google, so it needs a technical identity there.

1. Create a Google Cloud project (documents are *not* stored here — this is only API infrastructure).
2. **APIs & Services** → enable **Google Sheets API** and **Google Drive API**.
3. **IAM & Admin → Service Accounts** → create one, e.g. *Verify Reader*. Give it **no** project-level role — no Owner, no Editor.
4. **Service Account → Keys** → create a JSON key. Download it, and treat it as a secret from that moment on.
5. In Drive, share **the approved folder** and **the registry spreadsheet** with the Service Account's email address as **Viewer**.

Viewer plus read-only OAuth scopes is the whole authorisation model for the public side. A fully compromised Worker can disclose approved documents and nothing else.

## 5 · DNS and the custom domain

1. Add your domain as a zone in Cloudflare.
2. At your registrar, replace the nameservers with the two Cloudflare gives you. Ownership stays with the registrar; only DNS management moves.
3. Wait for propagation — the Cloudflare dashboard reports when the zone is active.

## 6 · The Worker

```bash
cd worker

npx wrangler secret put GCP_SERVICE_ACCOUNT_JSON   # paste the whole JSON key
npx wrangler secret put FILE_TICKET_SECRET         # openssl rand -base64 48

npx wrangler deploy
```

Then, in the dashboard:

1. **Workers & Pages → your worker → Domains → Add Domain** → `verify.example.com`. Cloudflare handles routing and the TLS certificate.
2. **Settings → Variables** → set `OFFICIAL_HOST` to that exact hostname, plus `CLINIC_NAME`, `SIGNER_NAME`, `GOOGLE_SHEETS_ID` and `APPROVED_FOLDER_ID`.
3. Back in the settings sheet, set `PUBLIC_VERIFY_BASE_URL` to `https://verify.example.com` (no trailing slash) so newly issued QR codes point at it.

`OFFICIAL_HOST` is what makes the auto-assigned `*.workers.dev` address return 404. Set it, or the Worker refuses every request.

---

## Acceptance checklist

Run all of these before issuing a real document.

| # | Test | Expected |
| --- | --- | --- |
| 1 | Approve a PDF from the pending folder | Number, QR, registry row, file in the approved folder |
| 2 | Approve a large Word file and a multi-page PDF | Completes inside the add-on's execution limit |
| 3 | Scan the QR | Green page under your own domain |
| 4 | Open the PDF from the page | Opens; the address bar never shows `drive.google.com` |
| 5 | Wait 5 minutes, reload the `/file/` URL | *Link expired* |
| 6 | Change one character of `t` | *Document not found* — no hint that the document exists |
| 7 | Increment the document number in the URL | *Document not found* |
| 8 | Open the `*.workers.dev` address | `404 Not Found` |
| 9 | Revoke the document, scan again | *Document revoked*, `410`, no PDF link |
| 10 | Open a `/file/` link minted *before* the revocation | Refused |
| 11 | Open the approved PDF in an incognito window, straight from Drive | Access denied |

Tests 5, 9 and 10 are the ones that prove the design; the rest confirm it is wired up.

## Migrating an existing installation

If documents were previously issued with public Drive sharing, run `restrictOldApprovedFilesOnce()` from the Apps Script editor once. It walks the approved folder and removes every `type: "anyone"` permission, then logs a summary.

Production result: 8 files checked, 6 public permissions removed, 0 errors.

Old QR codes that point at the previous verification URL keep pointing there. Plan the cut-over: either keep the old endpoint answering for a while, or re-issue the documents that matter.

## Key rotation

**Service Account key** — create the new key, replace `GCP_SERVICE_ACCOUNT_JSON`, verify verification works end to end, and only then delete the old key in Google Cloud.

**`FILE_TICKET_SECRET`** — replace it with a new random value. Every signed link issued before the change becomes invalid at once, which is harmless: links are re-minted on every scan.
