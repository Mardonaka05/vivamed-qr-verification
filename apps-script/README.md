# Google Workspace Add-on — the issuing side

Runs inside Google Drive. The manager approves a file; the add-on reserves a document number and token, converts the document to PDF, stamps the QR code and signature line, stores the result in a Restricted folder, computes its SHA-256 and writes the registry row.

## Files

| File | Responsibility |
| --- | --- |
| `appsscript.json` | Manifest: OAuth scopes, add-on triggers, `urlFetchWhitelist`, web app access |
| `Config.gs` | The only channel to the settings sheet — read, cache, diagnose |
| `Registry.gs` | Document numbers, tokens, lookup, revocation |
| `PdfStamp.gs` | `pdf-lib` in a synchronous runtime — QR and signature drawing |
| `Code.gs` | Cards, approval pipeline, format conversion, Gmail, revocation UI |
| `WebApp.gs` | Legacy public endpoint, now returning JSON |
| `Verify.html` | Legacy verification page |

Apps Script has no module system: Google concatenates every `.gs` file into one global namespace, so each module is an IIFE with a small public surface. The dependency order is strict — `Config` at the bottom, `Registry` and `PdfStamp` above it, `Code` and `WebApp` on top — with no cycles.

## Install

1. Create a standalone Apps Script project and add these files.
2. **Services → Drive API v3** (advanced service, symbol `Drive`).
3. **Project Settings → Script Properties → `SHEETS_ID`** = the registry spreadsheet id.
4. Fill in the `Sozlamalar` sheet — see [the registry schema](../docs/en/03-registry-schema.md).
5. **Deploy → Test deployments → Install.**

The home card runs `Config.diagnose()` and lists whatever is still missing.

Full walkthrough: [`../docs/en/06-deployment.md`](../docs/en/06-deployment.md).
File-by-file reasoning: [`../docs/en/05-apps-script-modules.md`](../docs/en/05-apps-script-modules.md).

## Things that will surprise you

- **Every click is a separate, memoryless execution.** No session, no globals between calls, and no "loading…" state — the function must return a finished `Card`.
- **`SyncPromise`** exists because `pdf-lib` is Promise-based and an add-on function cannot be `async`. It works only because `pdf-lib` never waits on I/O.
- **Signed vs unsigned bytes.** `getBytes()` gives −128…127, `pdf-lib` wants 0…255. Getting it wrong corrupts the PDF silently.
- **The folder is the state.** Drive has no status field, so a file's location is its status.
- **A missing settings key falls back silently.** Fill the sheet in completely — see [known issues](../docs/en/07-known-issues.md).
