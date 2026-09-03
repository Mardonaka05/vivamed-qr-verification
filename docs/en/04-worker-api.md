# 04 · Worker API

The Cloudflare Worker is the whole public backend. It has two routes and no write capability.

Base: `https://verify.example.com`

---

## `GET /v/{docNo}`

The URL encoded in every QR code.

**Path**

| Segment | Example |
| --- | --- |
| `docNo` | `VM-PDF-2026-000009` |

**Query**

| Param | Required | Description |
| --- | --- | --- |
| `t` | yes | Verification token from registry column J |

**Example**

```
https://verify.example.com/v/VM-PDF-2026-000009?t=a3f9c21b8e04d7c1f0b25e93
```

**Behaviour**

1. Reject the request if `url.hostname` is not the official host → `404 Not Found`.
2. Obtain a Google access token (Service Account → JWT RS256 → OAuth).
3. Read the registry through the Sheets API; find the row for `docNo`.
4. Compare the stored token to `t`. Any mismatch, and any missing row → *document not found*.
5. Read `STATUS`.
6. If `ACTIVE`, mint a signed 5-minute `/file/` URL and render the verification page with it in the button's `href`.

**Responses**

| Case | Status | Page |
| --- | --- | --- |
| Valid + `ACTIVE` | `200` | Green — document number, name, issue date, signer, **View document** / **Download** |
| Valid + `REVOKED` | `410 Gone` | Red — *this document has been revoked*, with date and reason, no link |
| Token mismatch / no row / unknown path | `404` | Red — *document not found* |
| Internal read failure (Sheets, OAuth) | `502` | Neutral — *temporary error, try again* |
| Wrong hostname | `404` | `Not Found`, plain text |
| Non-GET method | `405` | `Method Not Allowed` |

Scanning the QR with a camera and pasting the URL into a browser are the same HTTP request; the Worker makes no distinction.

---

## `GET /file/{docNo}`

The private PDF gateway. Never linked directly and never stored — the Worker generates a fresh signed URL each time `/v/` succeeds.

**Query**

| Param | Description |
| --- | --- |
| `exp` | Unix expiry, `now + 300` at mint time |
| `mode` | `view` or `download` |
| `sig` | `HMAC-SHA256(docNo + "." + exp + "." + mode, FILE_TICKET_SECRET)` |

**Example**

```
https://verify.example.com/file/VM-PDF-2026-000009?exp=1772000300&mode=view&sig=9f2c...
```

**Validation order**

```
1. exp present and an integer            → else reject
2. exp not in the past                   → else "link expired"
3. exp <= now + 2 * TTL                  → else reject
4. mode ∈ {view, download}               → else reject
5. recomputed sig == provided sig        → else reject
6. registry re-read: STATUS = ACTIVE     → else reject
7. Drive metadata: parents include
   APPROVED_FOLDER_ID                    → else reject
8. Drive metadata: mimeType =
   application/pdf                       → else reject
9. GET files/{fileId}?alt=media          → stream to the client
```

Steps 1–5 are pure computation and cost nothing. Steps 6–8 are the ones that make a leaked or crafted URL useless.

**Response headers on success**

```
Content-Type: application/pdf
Content-Disposition: inline | attachment      (from mode)
Cache-Control: no-store
X-Content-Type-Options: nosniff
Referrer-Policy: no-referrer
X-Frame-Options: DENY
```

`no-store` matters: without it, a shared or proxied cache could keep a medical document long after the 5-minute ticket died.

**Failure responses**

| Case | Status | Shown to the user |
| --- | --- | --- |
| `exp` passed | `403` | *Havola muddati tugagan. QR kodni qayta skanerlang.* |
| `exp` malformed or absurd, `mode` invalid | `403` | *Link noto'g'ri.* |
| `sig` does not match | `403` | *Ruxsat berilmadi.* |
| `STATUS` became `REVOKED`, or the row is gone | `404` | *Hujjat mavjud emas yoki bekor qilingan.* |
| File not under the approved folder | `403` | *Faylga ruxsat yo'q.* |
| Not a PDF | `415` | *Fayl PDF formatida emas.* |
| Drive or Sheets failure | `502` | *PDF xizmatida vaqtinchalik xatolik.* |

None of these messages names the document, and none of them confirms that it exists.

---

## Configuration

| Name | Type | Purpose |
| --- | --- | --- |
| `OFFICIAL_HOST` | text | The only hostname allowed to serve traffic |
| `CLINIC_NAME` | text | Organisation name shown on the pages |
| `SIGNER_NAME` | text | Name shown as approver / revoker |
| `GOOGLE_SHEETS_ID` | text | Which registry to read |
| `APPROVED_FOLDER_ID` | text | Which Drive folder is authoritative |
| `GCP_SERVICE_ACCOUNT_JSON` | secret | Service Account credential |
| `FILE_TICKET_SECRET` | secret | HMAC key for the file tickets |

Set text values as plain runtime variables and the two secrets as Cloudflare Secrets. Nothing is hard-coded in the Worker source.

## Google authentication from the edge

The Worker does not run on Google infrastructure, so it must prove its identity on every cold start:

```
GCP_SERVICE_ACCOUNT_JSON
   → build JWT claim set (iss, scope, aud, exp, iat)
   → sign RS256 with the Service Account private key
   → POST to Google's OAuth token endpoint
   → short-lived access token
   → Sheets API / Drive API with Authorization: Bearer
```

Scopes requested: `https://www.googleapis.com/auth/spreadsheets.readonly` and `https://www.googleapis.com/auth/drive.readonly`. Nothing else.

## Troubleshooting

| Symptom | Where to look | Likely cause |
| --- | --- | --- |
| 401 / OAuth error | `GCP_SERVICE_ACCOUNT_JSON` | Credential wrong, malformed, or key deleted |
| 403 from Sheets | Sheets API + sharing | API disabled, or Service Account not a Viewer |
| 403 from Drive | Drive API + folder sharing | Approved folder not shared with the Service Account |
| "Document not found" | `docNo` + token | Token or document number does not match the registry |
| "Link expired" | `/file/` `exp` | The 5-minute window closed — rescan |
| "Link expired" on a fresh link | `sig` / secret | `FILE_TICKET_SECRET` differs from the one used to mint |
| No PDF for a valid document | `STATUS` / parent / MIME | Revoked, outside the approved folder, or not a PDF |
| Everything 404 | hostname check | Request arrived on `*.workers.dev` instead of the official host |
