# 05 · Apps Script modules

## The constraint everything follows from

**In a Workspace Add-on, every click is a separate, memoryless execution.**

The user clicks a button. Google calls the Apps Script function. The function returns one `Card`. Google draws it. The execution ends. The next click starts from nothing — no memory, no globals, no session.

This is fundamentally unlike a web app with a running server. Four consequences shape the entire codebase:

| Consequence | How it shows up in the code |
| --- | --- |
| State is not preserved | State lives outside: the folder *is* the status, the Sheets row *is* the record |
| You cannot wait | `SyncPromise` — a Promise that runs `.then` immediately instead of queueing it |
| Everything restarts | `pdf-lib` is re-fetched on every call; settings are re-read every time |
| The result must be immediate | The function must return a `Card`, so it cannot be `async` |

There is no technically possible "loading…" intermediate state. The function has to be finished by the time it returns — which is exactly what made the `pdf-lib` integration hard.

## No module system

Apps Script has no `import` and no `export`. Google concatenates all `.gs` files into one and every function lives in a single global namespace: `Config` declared in `Config.gs` is simply visible inside `Registry.gs`.

Splitting into files is organisation for humans, nothing more. To keep names from colliding, each module is written as an IIFE with a deliberately small public surface:

```js
var Config = (function () {
  function sheetsId()      { /* private */ }
  function settingsSheet() { /* private */ }

  function get(key, fallback) { /* … */ }
  function all()              { /* … */ }

  return { get: get, all: all };   // only these escape
})();
```

## Dependency pyramid

```
                    appsscript.json
                 (not code — a declaration)
        ┌────────────────┴────────────────┐
        │                                 │
   ADD-ON FACE                      CLIENT FACE
   employee · writes                anonymous · reads
        │                                 │
     Code.gs                          WebApp.gs
        │                                 │
   ┌────┴──────┐                      Verify.html
   ▼           ▼                          │
Registry.gs  PdfStamp.gs                  │
   │           │                          │
   └───────────┴────► Config.gs ◄─────────┘
                     (foundation)
                          │
            ┌─────────────┴─────────────┐
            ▼                           ▼
     Script Properties          Sheets · Settings
        (SHEETS_ID)              (everything else)
```

Strict, acyclic: upper layers depend on lower ones and never the reverse. Any module can be understood and changed in isolation.

---

## `appsscript.json` — the declaration layer

Not code. Four statements to Google, read but never executed.

| Statement | Meaning |
| --- | --- |
| `addOns` | "Show me in Drive; call `onHomePage` when the panel opens and `onDriveItemsSelected` when a file is picked." The names must match `Code.gs` exactly. |
| `oauthScopes` | The permissions the user consents to on first use. |
| `urlFetchWhitelist` | "I only ever call these two hosts." Google enforces it. |
| `webapp` | `ANYONE_ANONYMOUS` + `USER_DEPLOYING` — the client reaches it without login, but it runs with the owner's rights. |

**Why `urlFetchWhitelist` is mandatory.** If an add-on could call arbitrary URLs, a later update could quietly ship data to a third party. So every destination must be declared up front, must be HTTPS, must be a full domain and must end with a slash. It is enforced for versioned deployments — not for test deployments, which is exactly why the project's first serious deployment failure came from this section being missing.

**A failure mode worth knowing:** when the manifest reverts to an empty state, the add-on silently disappears from the Drive panel. No error, no message — the code still works, Drive just stops showing it. Work in a single browser tab and hard-refresh after any long break.

**Scope observation:** the scope list includes `auth/drive`, i.e. access to all of the user's Drive files. Acceptable for an Internal deployment, but broader than the add-on needs. Public listing would require a Google security assessment; narrowing to `drive.file` would be the first step.

---

## `Config.gs` — the foundation layer

The single channel to the settings sheet. No other module touches it directly.

| Direction | What |
| --- | --- |
| Reads from | Script Properties → `SHEETS_ID`; Sheets → `Settings`, columns A and B only |
| Used by | `Code.gs`, `Registry.gs`, `PdfStamp.gs`, `WebApp.gs` — everything |
| Written by | Nobody. A `set()` exists but is never called. |

**One gate, three jobs.**

1. *Read and cache.* The whole sheet is read once and held in `CacheService` for 60 seconds — so a settings change takes up to a minute to apply.
2. *Fallback.* `get(key, fallback)` keeps the system running when a key is missing. Convenient, and the largest silent-failure risk in the project (see [known issues](07-known-issues.md)).
3. *Diagnose.* `diagnose()` validates the installation and returns a list of problems, rendered on the add-on's home card. A UX decision: the employee sees a specific instruction instead of a vague error.

Had each module read the sheet itself, caching, error text and fallbacks would be scattered across five places and drift apart.

**Key–value style.** Column A is the question, column B the answer; the code reads the range and builds a dictionary. Row order is irrelevant, blank rows are skipped, no header is needed, keys are case-sensitive (`clinic_name ≠ CLINIC_NAME`, and the mismatch produces no error), whitespace is trimmed, and every value is a string until the consumer converts it.

**Chicken and egg.** `SHEETS_ID` cannot live inside the sheet it identifies, so it is the one exception — stored in Script Properties, entered once from the Settings card.

---

## `Registry.gs` — the data layer

Issues numbers, searches, marks sending. The most delicate logic in the project.

| Direction | What |
| --- | --- |
| Depends on | `Config.spreadsheet()`, `Config.get('DOC_PREFIX')` |
| Called by | `Code.gs` → `reserve`, `fill`, `markFailed`, `markSent`; `WebApp.gs` → `find` only |
| Writes to | Sheets, `Registry`, columns A–P |

**Reserve before the heavy work.** PDF processing takes 10–30 seconds. Assigning the number afterwards means two simultaneous approvals both read "last number = 21" and both take 22 — two different documents with one identity, which destroys the registry's usefulness. So `reserve()` writes two cells under a `LockService` lock, held ~0.3 s, and the expensive work runs unlocked.

**The token is the real protection.** Sequential numbers are enumerable; a 96-bit random token in the URL is not. The number stays pretty and sequential for reports; the token appears only in the link and is never drawn on the document.

**Failed rows are marked, not deleted.** Deleting leaves a numbering gap and breaks the next `reserve()`; keeping the row preserves the audit trail.

**Failures do not disclose.** A token mismatch returns `null`, and the page says *not found* — never *wrong token*. Someone with a wrong token should not even learn that the document exists.

**Search runs backwards.** `find()` scans from the last row up, so if a number ever repeats, the most recent row wins.

---

## `PdfStamp.gs` — the processing layer

Draws the QR code and signature line onto the PDF bytes. Technically the hardest file, built on four engineering workarounds.

| Direction | What |
| --- | --- |
| Takes | 10 QR/signature settings from `Config`; `pdf-lib` 1.17.1 (~1.4 MB) from a CDN, on every call |
| Called by | `Code.gs` only → `PdfStamp.stamp(bytes, qrPng, docNo, placement, clinic)` |
| Returns | New PDF bytes as `Uint8Array` |

### 1. `SyncPromise`

Apps Script is synchronous; `pdf-lib` is Promise-based. By the JavaScript spec, `.then` callbacks go to the microtask queue and run *after* the current function returns:

```js
var out = null;
pdf.save().then(function (s) { out = s; });
if (!out) throw new Error(...);   // ← out is still null here
```

Normally you would reach for `async`/`await` — but an add-on function must return a `Card`, not a Promise, so `handleApprove` cannot be `async`.

The fix is to replace the global `Promise` with an implementation that resolves inline, load the library, then restore the native one:

```js
SyncPromise.prototype.then = function (onFulfilled, onRejected) {
  var self = this;
  return new SyncPromise(function (resolve, reject) {
    if (self._state === 'fulfilled') {
      resolve(onFulfilled(self._value));   // immediately, no deferral
    } else if (/* … */) { /* … */ }
  });
};

globalThis.Promise = SyncPromise;
eval(src);                  // pdf-lib loads against the synchronous Promise
globalThis.Promise = native;
```

**Why this works:** `pdf-lib` never actually waits — it only computes. If it performed network or file I/O the approach would fail. The solution is specific to this library, not a general pattern.

### 2. Byte format

`getBytes()` returns *signed* bytes (−128…127); `pdf-lib` expects `Uint8Array` (0…255). Conversion is required in both directions:

```js
// in
var bytes = new Uint8Array(src.getBlob().getBytes());

// out
function toByteArray_(u8) {
  var out = [];
  for (var i = 0; i < u8.length; i++) out.push(u8[i] > 127 ? u8[i] - 256 : u8[i]);
  return out;
}
```

Skip it and the PDF is silently corrupted — no exception, the file simply will not open. That class of bug is expensive to find precisely because it announces nothing.

### 3. `setTimeout` polyfill

Apps Script has no `setTimeout`; `pdf-lib` uses it.

```js
function setTimeout(func, delay) {
  Utilities.sleep(delay || 0);
  return func();
}
```

### 4. Coordinates

In PDF, the origin is the **bottom-left** corner and `y` grows upward — the opposite of the browser. To place the QR at the bottom right:

```js
var x = W - qrSize - marginRight;   // from the right edge
var y = marginBottom;               // from the bottom
page.drawImage(qr, { x: x, y: y, width: qrSize, height: qrSize });
```

### Font limitation

Standard Helvetica knows neither Cyrillic nor the Uzbek apostrophe, so all text passes through `asciiSafe_()`, which strips unknown characters. Practical consequence: Uzbek and Russian text cannot be drawn onto the document. The fix is to upload a TTF to Drive and register `pdf-lib`'s fontkit extension.

---

## `Code.gs` — interface and conductor

The largest file and the only place where everything meets. Two halves: the card-building UI, and `approveDocument_`, which drives the whole flow.

| Direction | What |
| --- | --- |
| Depends on | `Config`, `Registry`, `PdfStamp` — all three |
| Services | Drive, Sheets (via `Registry`), Gmail, the external QR service |
| Called by | Google → `onHomePage`, `onDriveItemsSelected`; buttons → `handleApprove`, `handleReject`, `handleSendMail` |

### Three cards

| Card | Appears when | Contains |
| --- | --- | --- |
| Home | The panel opens | Diagnostics, pending list, settings button |
| Document | A file is selected from the list or in Drive | File info, QR placement, Approve / Reject |
| Result | After approval | Document number, links, Gmail form |

You cannot draw your own HTML in the panel. Google supplies a fixed widget set — text, button, input, dropdown — assembled through `CardService`. A constraint with a payoff: the panel behaves identically on phone and desktop, and there is no CSS to write.

### The folder is the state

| Folder | Meaning | Code relationship |
| --- | --- | --- |
| `FOLDER_PENDING` | Awaiting approval | `listPending_()` reads it and shows "Pending: N" |
| `FOLDER_APPROVED` | Issued and numbered | The new PDF is saved here |
| `FOLDER_ARCHIVE` | Original or rejected | The source file is moved here |

Dropping a file into a folder *is* the request. No separate button, message or form is needed — and the split between "employee uploads" and "manager approves" falls out of it naturally, with both names recorded in the registry.

### Error handling

```js
try {
  /* the whole flow */
} catch (err) {
  Registry.markFailed(reserved.row, err.message || err);
  throw err;
} finally {
  cleanupTemp_(tempIds);   // temporary Google copies removed
}
```

The `finally` block matters: an interrupted run must not leave temporary conversion copies behind, or they accumulate in Drive indefinitely.

---

## `WebApp.gs` — the legacy public endpoint

One function. This was the entire public face before the Cloudflare Worker existed; it is kept for rollback and internal use, and now returns **JSON** instead of rendering `Verify.html`.

| Direction | What |
| --- | --- |
| Depends on | `Config.get('CLINIC_NAME')`, `Registry.findForVerification(docNo, token)` |
| Called by | Google → `doGet(e)` |
| Returns | JSON: `{ ok, status, clinic, docNo, fileName, createdAt, … }` |

Two parameters — `d` (document number) and `t` (token) — and the record is returned only when both are correct. Its `viewUrl` / `downloadUrl` fields are Drive links, which resolve only for shared files; approved PDFs are Restricted, so in the current architecture the Worker's `/file/` gateway is how a client reaches the PDF. Treat those two fields as legacy.

It discloses nothing on failure: spreadsheet unreachable, sheet missing, token wrong — all surface as the same *not found*.

**Rights of the public page.** It runs with the owner's permissions, which sounds dangerous but is tightly bounded: exactly one function is exposed (`doGet`), it only reads, it returns a single document rather than a list, it shows nothing on token mismatch, and it never reports error detail.

**Quota note.** Each verification reads the whole registry. On an anonymous public page that can be called repeatedly, and at tens of thousands of rows it becomes slow and can hit Sheets quotas. Caching the lookup or splitting the registry by year is the eventual answer. Moving verification to the Worker already removed most of this pressure.

---

## `Verify.html` — the presentation layer

The only screen the client ever sees. Two states: green *document is authentic*, red *not found*.

| Direction | What |
| --- | --- |
| Data from | Template variables `rec`, `clinic`, `downloadUrl`, `viewUrl`, `createdAt` — no longer wired up, since `doGet` returns JSON |
| JavaScript | None. Rendered entirely server-side |
| External resources | None. All CSS is inline |

```html
<? if (rec) { ?>
  <div class="badge ok">Document is authentic</div>
  <div class="no"><?= rec.docNo ?></div>
<? } else { ?>
  <div class="badge bad">Not found</div>
<? } ?>
```

The `<?= … ?>` form escapes HTML automatically, so a file name containing `<script>` is harmless. The unescaped `<?!= … ?>` form is not used anywhere — the right call.

**No JavaScript at all** is a deliberate reliability choice: the page arrives fully rendered and works regardless of the client's phone or connection quality.

**Brand link.** The page's primary colour matches `primaryColor` in the manifest, so the add-on panel and the verification page are visually connected. A small detail that signals *this really is that clinic*.

---

## External dependencies

Five services. Three are Google's own, sharing the runtime and effectively reliable. Two are external, and they are the system's weak points.

| Service | Why | If it fails | How to remove it |
| --- | --- | --- | --- |
| Drive (internal) | Read files, save PDFs, share, move | System stops | — |
| Sheets (internal) | Settings, numbering, registry, lookup | System stops | — |
| Gmail (internal) | Send the document to the client | Only sending breaks | — |
| CDN (external) | `pdf-lib` 1.17.1, ~1.4 MB per call | PDFs cannot be processed | Vendor the library as a `.gs` file |
| QR service (external) | 600×600 QR PNG | Documents cannot be issued | Compute the QR matrix in code and draw it as rectangles |

Removing both external dependencies would eliminate `UrlFetchApp` entirely — and with it the `urlFetchWhitelist` section of the manifest.

**Why the library version is pinned.** The URL specifies `pdf-lib@1.17.1` exactly. With `latest`, an upstream change could break the system without warning — and that matters more than usual here, because the library is executed through `eval`.

## File summary

| File | Type | Responsibility |
| --- | --- | --- |
| `appsscript.json` | Manifest | Permissions, add-on definition, external hosts |
| `Config.gs` | Script | Read settings, cache, diagnose |
| `Registry.gs` | Script | Issue numbers, search, verify tokens |
| `PdfStamp.gs` | Script | `pdf-lib`, `SyncPromise`, draw onto the PDF |
| `Code.gs` | Script | Cards, main flow, format conversion, Gmail |
| `WebApp.gs` | Script | Serve the legacy public verification page |
| `Verify.html` | HTML | Appearance of that page |

## Integration matrix

Which file touches which resource. ● direct, ○ through another module.

| File | Config | Sheets | Drive | Gmail | External |
| --- | --- | --- | --- | --- | --- |
| `appsscript.json` | — | — | — | — | declaration |
| `Config.gs` | — | ● | ● | — | — |
| `Registry.gs` | ● | ● | — | — | — |
| `PdfStamp.gs` | ● | ○ | — | — | ● CDN |
| `Code.gs` | ● | ○ | ● | ● | ● QR service |
| `WebApp.gs` | ● | ○ | — | — | — |
| `Verify.html` | — | — | — | — | — |

`Config.gs` touches Drive only inside `diagnose()`, to check that the configured folders exist.
