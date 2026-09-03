# 03 · Registry schema

The registry is a Google Spreadsheet with two sheets: `Registry` and `Settings`. It is the system's source of truth — the Worker reads it on every verification, and the add-on is the only thing that writes to it.

## Sheet: `Registry`

| Col | Field | Written by | Purpose |
| --- | --- | --- | --- |
| A | `docNo` | `Registry.reserve()` | Official document number, e.g. `VM-PDF-2026-000009` |
| B | `fileName` | `Registry.fill()` | Display name of the stamped PDF |
| C | `fileId` | `Registry.fill()` | Drive ID of the private approved PDF |
| D | `sourceFileId` | `Registry.fill()` | Drive ID of the untouched original (evidence copy) |
| E | `createdBy` | `Registry.fill()` | Employee who uploaded the source |
| F | `createdAt` | `Registry.fill()` | Issue timestamp |
| G | `verifyUrl` | `Registry.fill()` | Full verification URL encoded in the QR |
| H | `sent` | `Registry.markSent()` | Whether the document was emailed to the recipient |
| I | `sentAt` | `Registry.markSent()` | Send timestamp |
| J | `token` | `Registry.reserve()` | 96-bit verification token — never printed on the document |
| K | `approvedBy` | `Registry.fill()` | Manager who approved |
| L | `STATUS` | `Registry.fill()` / revoke | `ACTIVE`, `REVOKED`, `FAILED:` |
| M | `FILE_SHA256` | `Code.gs` | 64-hex fingerprint of the final PDF bytes |
| N | `REVOKED_AT` | revoke | When it was revoked |
| O | `REVOKED_BY` | revoke | Who revoked it |
| P | `REVOKE_REASON` | revoke | Why |

The Worker reads only A, C, J, L (and M when displaying the fingerprint). Everything else is for humans and audit.

### Document numbering

```
{DOC_PREFIX}-{year}-{sequence padded to 6}
VM-PDF        2026    000009
```

The token is 24 hex characters:

```js
Utilities.getUuid().replace(/-/g, "").substring(0, 24)
// → "a3f9c21b8e04d7c1f0b25e93" — 96 bits
```

Sequential and human-friendly on purpose: numbers appear in reports, archives and correspondence. Guessability is handled by the token, not by making the number random.

### Two-phase write

```
reserve()  ──►  [ heavy work: convert · QR · pdf-lib · save · SHA-256 ]  ──►  fill()
   ▲                                                                          ▲
under LockService                                                       no lock
~0.3 s, writes 2 cells                                              10–30 s, writes the rest
(docNo + token)
```

`LockService` is willing to wait 30 seconds, but in practice the lock is held for about a third of a second, so concurrent approvals do not queue behind each other's PDF processing.

### Failures keep their row

`markFailed()` marks the row `FAILED:` with the error message rather than deleting it. Two reasons:

1. Deleting a row leaves a gap in the sequence and confuses the next `reserve()`.
2. "This number was issued but the document never came out" is exactly the trace an audit wants.

### Lookup semantics

`find(docNo, token)` scans **backwards**, from the last row up. If a number ever appears twice, the most recent row wins. A mismatch returns `null` — the caller cannot distinguish "wrong token" from "no such document", and neither can the user.

## Sheet: `Settings`

Column A is the key, column B is the value. No header row. Row order does not matter, blank rows are skipped, keys are **case-sensitive**, and surrounding whitespace is trimmed. Only A and B are read — column C is free for human comments, which is the recommended place to record why a folder ID is what it is.

The whole sheet is read once and cached for 60 seconds, so an edit takes up to a minute to take effect.

### Keys

| Key | Example | Used by |
| --- | --- | --- |
| `CLINIC_NAME` | `VivaMed Center` | Verification page, PDF signature block |
| `DOC_PREFIX` | `VM-PDF` | `Registry.reserve()` |
| `PUBLIC_VERIFY_BASE_URL` | `https://verify.example.com` | QR URL construction |
| `FOLDER_PENDING` | *Drive folder ID* | `listPending_()` |
| `FOLDER_APPROVED` | *Drive folder ID* | Where the stamped PDF is saved |
| `FOLDER_ARCHIVE` | *Drive folder ID* | Where the original is moved |
| `SHEETS_ID` | *Spreadsheet ID* | Stored in Script Properties, not here — see below |
| `SIGNER_NAME` | *manager's name* | Signature line drawn on the PDF |
| `SIGNER_LABEL` | `Director:` | Signature label |
| `SIGNER_SIZE` | `10` | Font size |
| `QR_SIZE` | `80` | QR side, points |
| `QR_MARGIN_RIGHT` | `40` | Distance from the right edge |
| `QR_BOTTOM` | `100` | Height from the bottom edge |
| `QR_GAP` | `26` | Gap between QR and caption |
| `QR_X` | `0` | Explicit X override |
| `QR_CAPTION` | `Verify via QR` | Caption under the QR |
| `SHOW_DOC_NO` | `yes` | Draw the document number on the PDF |

### The chicken-and-egg key

`SHEETS_ID` cannot live in the settings sheet — opening the sheet requires it. It is the single exception, stored in Script Properties and entered once from the add-on's Settings card.

### The fallback hazard

`Config.get(key, fallback)` returns a hard-coded default when a key is missing, so the system never stops because of an unconfigured value. That is convenient and it is the single largest operational risk in the project: **a key missing from the sheet fails silently and invisibly.**

The worst instance is `SIGNER_NAME`. If it is absent, the code's built-in default is printed on every issued medical document. When the signing manager changes, nobody notices — documents keep going out under the previous name. Adding every key to the settings sheet is a five-minute job and it should be done before anything else.

## PDF fingerprint

```
final PDF bytes → SHA-256 → 64 hex chars → column M
```

Changing a single byte of the PDF changes the hash almost entirely. This is an integrity check on the stored artifact, not a signature — it proves *this is the same file*, not *this file came from us*. The signature role is played by HMAC-SHA256 on the access link, with a secret. The two are easy to confuse and do different jobs.
