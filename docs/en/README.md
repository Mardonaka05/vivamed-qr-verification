# Technical documentation

English documentation for the VivaMed QR document verification system.
The original, longer technical books (in Uzbek) are in [`../uz/`](../uz/).

| # | Document | What it covers |
| --- | --- | --- |
| 01 | [Architecture](01-architecture.md) | Components, the two-faces principle, end-to-end flow |
| 02 | [Security model](02-security-model.md) | The 13 layers, the signed ticket, threat model and limits |
| 03 | [Registry schema](03-registry-schema.md) | Sheets columns, settings keys, document numbering |
| 04 | [Worker API](04-worker-api.md) | `/v/` and `/file/` routes, parameters, error responses |
| 05 | [Apps Script modules](05-apps-script-modules.md) | File-by-file: responsibility, dependencies, design decisions |
| 06 | [Deployment](06-deployment.md) | Google Cloud, Drive, Sheets, Apps Script, DNS, Worker |
| 07 | [Known issues](07-known-issues.md) | Open defects, severity, recommended fix order |

## Conventions used in this documentation

- `verify.example.com` stands for the clinic's real verification hostname.
- Every identifier (`GOOGLE_SHEETS_ID`, `APPROVED_FOLDER_ID`, Drive folder IDs,
  Apps Script IDs, Worker names) is a placeholder. No production value appears
  anywhere in this repository.
- `VM-PDF-2026-000009` is an example document number in the real format.
