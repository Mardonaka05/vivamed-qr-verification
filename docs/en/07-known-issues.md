# 07 · Known issues

Findings from a full read of the code, in order of severity. Some were fixed during the rewrite; those are listed at the end so the reasoning is not lost.

---

## Open

### 1 · A document can be approved twice

**Where:** `Code.gs`, `approveDocument_()` · **Severity:** high

Moving the source file to the archive sits in its own `try/catch` and the error is only logged. If the move fails, the file stays in the pending folder — so the manager sees it again tomorrow and approves it again. The result is one document with two numbers and two QR codes, and the registry calls both of them authentic. For a medical document that is a correctness failure, not an annoyance.

**Fix:** before reserving a number, look up the source file id in registry column D (`sourceFileId`) and refuse if it is already there.

### 2 · The verification page shows the file name

**Where:** the Worker's verification page, and `Verify.html` · **Severity:** high (privacy)

Both pages print the stored file name. Real names in the registry look like `23-ward — VM-PDF-2026-000012.pdf`. Anyone who scans the QR sees that string. If a file name ever carries a patient, ward or diagnosis, this is a disclosure of personal medical information on a page reachable by anyone.

The page does not need it. Document number, date and organisation are enough to compare a paper against the record.

**Fix:** remove the file-name row from both pages. One line each.

### 3 · The registry and settings sheets are unprotected

**Where:** Google Sheets · **Severity:** medium

Anyone with edit rights on the spreadsheet can delete a row and silently invalidate a genuine document, or blank a token. Nothing in the system notices.

**Fix:** protected ranges on `Reyestr` and `Sozlamalar`. Five minutes in the Sheets UI.

### 4 · `listPending_` sorts after truncating

**Where:** `Code.gs` · **Severity:** low

It takes the first 20 files Drive happens to return and *then* sorts them by date. That is not "the newest 20". With 25 files pending, the newest one may never appear in the list.

**Fix:** enumerate the folder fully (or query with an ordering) before slicing.

### 5 · The `createdBy` column can end up blank

**Where:** `Code.gs` · **Severity:** low

`src.getOwner()` returns `null` for Shared Drive files — those belong to the organisation, not a person — so the uploader column is sometimes empty while the approver column is filled.

**Fix:** read the uploader from Drive activity, or capture it when the file lands in the pending folder.

### 6 · QR placement default is wrong

**Where:** `PdfStamp.gs` · **Severity:** low (cosmetic)

The built-in fallback for `QR_MARGIN_RIGHT` is `330`. On A4 that puts the QR at `595 − 80 − 330 = 185pt`, i.e. bottom **centre**, not bottom right. If the key is absent from the settings sheet, that is the value in effect.

**Fix:** set `QR_MARGIN_RIGHT` in the settings sheet, and print one document to confirm the result.

### 7 · Only ASCII can be drawn on the PDF

**Where:** `PdfStamp.gs` · **Severity:** low

Standard Helvetica has no Cyrillic and no Uzbek apostrophe, so `asciiSafe_()` strips unknown characters. Uzbek and Russian text cannot appear in the stamp.

**Fix:** upload a TTF to Drive and register `pdf-lib`'s fontkit extension.

### 8 · Two external dependencies in the issuing path

**Where:** `PdfStamp.gs` (CDN), `Code.gs` (QR image service) · **Severity:** medium (availability)

If the CDN is unreachable, PDFs cannot be processed. If the QR service is unreachable, documents cannot be issued at all. Both are outside anyone's control, and `pdf-lib` (~1.4 MB) is re-downloaded on every single approval.

**Fix:** vendor `pdf-lib` as a `.gs` file, and compute the QR matrix in code, drawing it as rectangles. Removing both also removes `UrlFetchApp` from the project and, with it, the `urlFetchWhitelist` section of the manifest.

### 9 · The add-on's OAuth scopes are broader than needed

**Where:** `appsscript.json` · **Severity:** medium

`auth/drive` grants access to all of the user's Drive files. Acceptable for an Internal deployment; too broad in principle, and public listing would require a Google security assessment.

**Fix:** narrow towards `drive.file` where the flow allows it.

### 10 · Verification reads the whole registry

**Where:** `Registry.findForVerification`, and the Worker's Sheets read · **Severity:** low today

Each verification reads the entire `A2:P` range. At tens of thousands of rows this becomes slow and can approach Sheets quotas — on an endpoint anyone can call repeatedly.

**Fix:** cache lookups at the edge (carefully — `STATUS` must stay real-time), or split the registry by year.

---

## Recommended order

| When | Work | Effort |
| --- | --- | --- |
| Today | Fill in every settings key; protect both sheets | 10 min |
| Today | Remove the file name from both verification pages (#2) | 10 min |
| This week | Guard against double approval by source file id (#1) | 1–2 h |
| This week | Test with a large Word file and a multi-page PDF | 30 min |
| Next | Fix `listPending_` ordering (#4), QR placement (#6) | 1 h |
| Later | Vendor `pdf-lib`, draw the QR locally (#8) | 1 day |
| Later | Narrow the OAuth scopes (#9), font support (#7) | — |

---

## Fixed during the rewrite

Kept here because the reasoning is worth more than the diff.

**Token check could be skipped.** The lookup used to read `if (stored && stored !== supplied) return null;`. A blank token cell therefore *skipped* the check instead of denying it — so clearing column J, or adding a row by hand, would have made every document enumerable by number. Both the add-on and the Worker now fail closed with `if (!stored || stored !== supplied) return null;`, and the Worker compares in constant time.

**The signer's name was hard-coded.** `SIGNER_NAME` was absent from the settings sheet, so a hard-coded fallback name was stamped on every issued document. Nobody would have noticed when the signing manager changed. There is no name fallback any more: if the key is unset, the signature line is simply not drawn.

**`moveFile_` used a deprecated API.** `DriveApp.addFile()` does not work reliably on Shared Drives, which is the likely cause of issue #1 above. It now uses `file.moveTo(folder)`.

**Public sharing on issue.** `newFile.setSharing(ANYONE_WITH_LINK, VIEW)` was removed from the approval flow, and `restrictOldApprovedFilesOnce()` cleaned up the files that already had it — 8 checked, 6 permissions removed, 0 errors. Approved PDFs are Restricted; the Worker's `/file/` gateway is now the only way a client reaches one.

**No way to revoke.** A wrongly issued document used to stay authentic forever. There is now a `STATUS` column, a revocation flow with a mandatory reason, and two independent checks — at `/v/` and again at `/file/` — so a still-valid signed link cannot outlive a revocation.

**Health endpoint was public.** `/_health/google` reported whether the Google credentials worked. It is no longer routed; the function remains for wiring behind an authenticated path.
