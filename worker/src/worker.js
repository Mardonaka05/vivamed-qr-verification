/**
 * VivaMed QR Verification — Cloudflare Worker
 *
 * The entire public backend. Two routes, both read-only:
 *
 *   GET /v/{docNo}?t={token}
 *       QR verification page. Reads the registry through a read-only
 *       Service Account, checks docNo + token + STATUS, and mints a
 *       5-minute HMAC-signed link to the private PDF.
 *
 *   GET /file/{docNo}?exp={epoch}&mode={view|download}&sig={hmac}
 *       Private PDF gateway. Validates the ticket, re-checks STATUS,
 *       verifies the file's parent folder and MIME type, then streams
 *       the PDF from Restricted Drive storage under our own domain.
 *
 * Configuration (Cloudflare → Worker → Settings → Variables and Secrets):
 *
 *   OFFICIAL_HOST             text    the only hostname allowed to serve traffic
 *   CLINIC_NAME               text    organisation name shown on the pages
 *   SIGNER_NAME               text    name shown as approver/revoker
 *   GOOGLE_SHEETS_ID          text    registry spreadsheet id
 *   APPROVED_FOLDER_ID        text    the authoritative Drive folder id
 *   GCP_SERVICE_ACCOUNT_JSON  secret  read-only Service Account credential
 *   FILE_TICKET_SECRET        secret  HMAC key for the 5-minute file tickets
 *
 * No secret is hard-coded here.
 */

const DEFAULT_CLINIC = "VivaMed Center";

/* Registry columns (Reyestr!A2:P)
 *
 *   A docNo          I sentAt
 *   B fileName       J token
 *   C fileId         K approvedBy
 *   D sourceFileId   L STATUS
 *   E uploadedBy     M FILE_SHA256
 *   F createdAt      N REVOKED_AT
 *   G verifyUrl      O REVOKED_BY
 *   H sentTo         P REVOKE_REASON
 */
const REGISTRY_RANGE = "Reyestr!A2:P";

/* Ticket lifetime, seconds. */
const TICKET_TTL = 300;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    /* Production traffic is served on the official hostname only.
     * The auto-assigned *.workers.dev address must look like nothing. */
    const officialHost = String(env.OFFICIAL_HOST || "").trim();

    if (!officialHost || url.hostname !== officialHost) {
      return new Response("Not Found", {
        status: 404,
        headers: { "Cache-Control": "no-store" }
      });
    }

    /* Health check is disabled in production. Enable deliberately, and
     * only behind an authenticated path — it reports whether the Google
     * credentials work, which is not public information. */
    if (url.pathname === "/_health/google") {
      return new Response("Not Found", {
        status: 404,
        headers: { "Cache-Control": "no-store" }
      });
    }

    if (request.method !== "GET") {
      return new Response("Method Not Allowed", {
        status: 405,
        headers: { Allow: "GET", "Cache-Control": "no-store" }
      });
    }

    /* ---------------------------------------------------------------
     * PRIVATE PDF GATEWAY
     * --------------------------------------------------------------- */
    const fileMatch = url.pathname.match(/^\/file\/([^/]+)\/?$/);

    if (fileMatch) {
      let fileDocNo;

      try {
        fileDocNo = decodeURIComponent(fileMatch[1]).trim();
      } catch (error) {
        return privateErrorResponse_("Havola noto'g'ri.", 404);
      }

      if (!fileDocNo) {
        return privateErrorResponse_("Havola noto'g'ri.", 404);
      }

      try {
        return await servePrivateFile_(request, env, fileDocNo);
      } catch (error) {
        console.error("Private file error:", error);
        return privateErrorResponse_("PDF xizmatida vaqtinchalik xatolik.", 502);
      }
    }

    /* ---------------------------------------------------------------
     * PUBLIC QR VERIFICATION
     * --------------------------------------------------------------- */
    const match = url.pathname.match(/^\/v\/([^/]+)\/?$/);

    if (!match) {
      return renderNotFound(clinicName_(env));
    }

    let docNo;

    try {
      docNo = decodeURIComponent(match[1]).trim();
    } catch (error) {
      return renderNotFound(clinicName_(env));
    }

    const token = String(url.searchParams.get("t") || "").trim();

    if (!docNo || !token) {
      return renderNotFound(clinicName_(env));
    }

    let data;

    try {
      data = await findRegistryDocument_(env, docNo, token);
    } catch (error) {
      console.error("Verification error:", error);
      return renderServerError();
    }

    /* Document number or token did not match. We never disclose which. */
    if (!data) {
      return renderNotFound(clinicName_(env));
    }

    if (data.status === "REVOKED") {
      return renderRevoked(data, env);
    }

    /* Only ACTIVE counts as authentic. */
    if (data.status !== "ACTIVE") {
      return renderNotFound(clinicName_(env));
    }

    try {
      return await renderValid(data, env, url.origin);
    } catch (error) {
      console.error("Signed link error:", error);
      return renderServerError();
    }
  }
};

function clinicName_(env) {
  return String(env.CLINIC_NAME || DEFAULT_CLINIC).trim() || DEFAULT_CLINIC;
}

function signerName_(env) {
  return String(env.SIGNER_NAME || "").trim();
}

/* =========================================================
   REGISTRY LOOKUP — DOCUMENT NUMBER + QR TOKEN
   ========================================================= */

async function findRegistryDocument_(env, docNo, token) {
  if (!env.GOOGLE_SHEETS_ID) {
    throw new Error("GOOGLE_SHEETS_ID topilmadi");
  }

  const rows = await readRegistryRows_(env);

  const needleDocNo = String(docNo || "").trim();
  const suppliedToken = String(token || "").trim();

  /* Scan backwards: if a number ever repeats, the newest row wins. */
  for (let i = rows.length - 1; i >= 0; i--) {
    const row = rows[i] || [];
    const storedDocNo = String(row[0] || "").trim();

    if (storedDocNo !== needleDocNo) continue;

    const storedToken = String(row[9] || "").trim();

    /* Fail closed: a blank token cell denies access, it does not skip
     * the check. On mismatch we return null so the caller cannot tell
     * "wrong token" from "no such document". */
    if (!storedToken || !constantTimeEqual_(storedToken, suppliedToken)) {
      return null;
    }

    let status = String(row[11] || "").trim().toUpperCase();

    /* Legacy rows predate the STATUS column. */
    if (!status) status = "ACTIVE";

    const fileId = String(row[2] || "").trim();

    /* An ACTIVE document must have a file. */
    if (status === "ACTIVE" && !fileId) return null;

    return {
      ok: status === "ACTIVE",
      docNo: storedDocNo,
      fileName: String(row[1] || ""),
      fileId: fileId,
      sourceId: String(row[3] || ""),
      createdAt: String(row[5] || ""),
      approvedBy: String(row[10] || ""),
      status: status,
      fileSha256: String(row[12] || "").trim(),
      revokedAt: String(row[13] || ""),
      revokedBy: String(row[14] || ""),
      revokeReason: String(row[15] || "")
    };
  }

  return null;
}

/* =========================================================
   REGISTRY LOOKUP — DOCUMENT NUMBER ONLY
   Used by /file/ to re-check STATUS after the ticket validates.
   ========================================================= */

async function findRegistryByDocNo_(env, docNo) {
  if (!env.GOOGLE_SHEETS_ID) {
    throw new Error("GOOGLE_SHEETS_ID topilmadi");
  }

  const rows = await readRegistryRows_(env);
  const needle = String(docNo || "").trim();

  for (let i = rows.length - 1; i >= 0; i--) {
    const row = rows[i] || [];

    if (String(row[0] || "").trim() !== needle) continue;

    let status = String(row[11] || "").trim().toUpperCase();
    if (!status) status = "ACTIVE";

    return {
      docNo: String(row[0] || ""),
      fileName: String(row[1] || ""),
      fileId: String(row[2] || "").trim(),
      status: status,
      fileSha256: String(row[12] || "").trim()
    };
  }

  return null;
}

async function readRegistryRows_(env) {
  const accessToken = await getGoogleAccessToken_(env);

  const sheetsUrl =
    "https://sheets.googleapis.com/v4/spreadsheets/" +
    encodeURIComponent(env.GOOGLE_SHEETS_ID) +
    "/values/" +
    encodeURIComponent(REGISTRY_RANGE) +
    "?majorDimension=ROWS&valueRenderOption=FORMATTED_VALUE";

  const response = await fetch(sheetsUrl, {
    method: "GET",
    headers: { Authorization: "Bearer " + accessToken }
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      "Google Sheets API HTTP " + response.status + ": " + text.slice(0, 300)
    );
  }

  const sheetData = await response.json();

  return Array.isArray(sheetData.values) ? sheetData.values : [];
}

/* =========================================================
   PRIVATE FILE GATEWAY
   ========================================================= */

async function servePrivateFile_(request, env, docNo) {
  const url = new URL(request.url);

  const exp = String(url.searchParams.get("exp") || "").trim();
  const mode = String(url.searchParams.get("mode") || "view").trim();
  const sig = String(url.searchParams.get("sig") || "").trim();

  if (!exp || !sig) {
    return privateErrorResponse_("Link noto'g'ri.", 403);
  }

  const expNumber = Number(exp);
  const now = Math.floor(Date.now() / 1000);

  if (!Number.isInteger(expNumber) || expNumber <= 0) {
    return privateErrorResponse_("Link noto'g'ri.", 403);
  }

  if (expNumber < now) {
    return privateErrorResponse_(
      "Havola muddati tugagan. QR kodni qayta skanerlang.",
      403
    );
  }

  /* We only ever mint TTL-second tickets, so an implausibly distant
   * expiry is a sign of tampering even before the signature is checked. */
  if (expNumber > now + TICKET_TTL * 2) {
    return privateErrorResponse_("Link noto'g'ri.", 403);
  }

  if (mode !== "view" && mode !== "download") {
    return privateErrorResponse_("Link noto'g'ri.", 403);
  }

  const valid = await verifyFileTicket_(env, docNo, exp, mode, sig);

  if (!valid) {
    return privateErrorResponse_("Ruxsat berilmadi.", 403);
  }

  /* Critical: a ticket still inside its window says nothing about the
   * document's current state. Revocation must win, so STATUS is read
   * again here — this is the second, independent check. */
  const rec = await findRegistryByDocNo_(env, docNo);

  if (!rec || rec.status !== "ACTIVE" || !rec.fileId) {
    return privateErrorResponse_("Hujjat mavjud emas yoki bekor qilingan.", 404);
  }

  if (!env.APPROVED_FOLDER_ID) {
    throw new Error("APPROVED_FOLDER_ID topilmadi");
  }

  const accessToken = await getGoogleAccessToken_(env);

  const metadataUrl =
    "https://www.googleapis.com/drive/v3/files/" +
    encodeURIComponent(rec.fileId) +
    "?fields=id,name,mimeType,parents";

  const metadataResponse = await fetch(metadataUrl, {
    method: "GET",
    headers: { Authorization: "Bearer " + accessToken }
  });

  if (!metadataResponse.ok) {
    console.error("Drive metadata HTTP:", metadataResponse.status);
    return privateErrorResponse_("PDF topilmadi.", 404);
  }

  const metadata = await metadataResponse.json();
  const parents = Array.isArray(metadata.parents) ? metadata.parents : [];

  /* Defence in depth: even with a valid ticket, only files that live in
   * the approved folder are servable. A stolen file id goes nowhere. */
  if (!parents.includes(env.APPROVED_FOLDER_ID)) {
    return privateErrorResponse_("Faylga ruxsat yo'q.", 403);
  }

  if (metadata.mimeType !== "application/pdf") {
    return privateErrorResponse_("Fayl PDF formatida emas.", 415);
  }

  const fileUrl =
    "https://www.googleapis.com/drive/v3/files/" +
    encodeURIComponent(rec.fileId) +
    "?alt=media";

  const fileResponse = await fetch(fileUrl, {
    method: "GET",
    headers: { Authorization: "Bearer " + accessToken }
  });

  if (!fileResponse.ok) {
    console.error("Drive media HTTP:", fileResponse.status);
    return privateErrorResponse_("PDF yuklanmadi.", 502);
  }

  const fileName = String(metadata.name || rec.fileName || "document.pdf");
  const disposition = mode === "download" ? "attachment" : "inline";

  /* The browser never sees a Google URL — the bytes are streamed out
   * under our own hostname. */
  return new Response(fileResponse.body, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition":
        disposition + "; filename*=UTF-8''" + encodeURIComponent(fileName),
      "Cache-Control": "private, no-store, max-age=0",
      Pragma: "no-cache",
      Expires: "0",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "X-Frame-Options": "DENY"
    }
  });
}

/* =========================================================
   FILE TICKETS — MINT AND VERIFY
   ========================================================= */

async function createFileTicket_(env, docNo, mode) {
  if (!env.FILE_TICKET_SECRET) {
    throw new Error("FILE_TICKET_SECRET topilmadi");
  }

  const exp = Math.floor(Date.now() / 1000) + TICKET_TTL;
  const message = docNo + "." + exp + "." + mode;
  const sig = await hmacSha256Base64Url_(env.FILE_TICKET_SECRET, message);

  return { exp, sig };
}

async function verifyFileTicket_(env, docNo, exp, mode, suppliedSig) {
  if (!env.FILE_TICKET_SECRET) return false;

  const message = docNo + "." + exp + "." + mode;
  const expected = await hmacSha256Base64Url_(env.FILE_TICKET_SECRET, message);

  return constantTimeEqual_(expected, suppliedSig);
}

async function hmacSha256Base64Url_(secret, message) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(message)
  );

  return arrayBufferToBase64Url_(signature);
}

function constantTimeEqual_(a, b) {
  a = String(a || "");
  b = String(b || "");

  if (a.length !== b.length) return false;

  let result = 0;

  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return result === 0;
}

/* =========================================================
   PAGES
   ========================================================= */

async function renderValid(data, env, origin) {
  const clinic = escapeHtml(clinicName_(env));
  const host = escapeHtml(String(env.OFFICIAL_HOST || ""));
  const docNo = escapeHtml(data.docNo || "");
  const fileName = escapeHtml(data.fileName || "");
  const createdAt = escapeHtml(data.createdAt || "");

  /* The registry stores the approver's Google account. That is internal
   * audit data, so the public page shows the configured signer name. */
  const approvedBy = escapeHtml(signerName_(env));

  const viewTicket = await createFileTicket_(env, data.docNo, "view");
  const downloadTicket = await createFileTicket_(env, data.docNo, "download");

  const viewUrl =
    origin +
    "/file/" +
    encodeURIComponent(data.docNo) +
    "?exp=" + viewTicket.exp +
    "&mode=view&sig=" + encodeURIComponent(viewTicket.sig);

  const downloadUrl =
    origin +
    "/file/" +
    encodeURIComponent(data.docNo) +
    "?exp=" + downloadTicket.exp +
    "&mode=download&sig=" + encodeURIComponent(downloadTicket.sig);

  const safeViewUrl = escapeHtml(viewUrl);
  const safeDownloadUrl = escapeHtml(downloadUrl);

  const html = `<!DOCTYPE html>
<html lang="uz">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex,nofollow">
<title>${clinic} — Hujjat tasdiqlandi</title>
<style>
* { box-sizing: border-box; }
body {
  margin: 0; padding: 24px 16px;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
  background: #f5f8f8; color: #172327;
}
.container { width: 100%; max-width: 560px; margin: 0 auto; }
.brand { text-align: center; margin: 20px 0 28px; }
.brand-name { font-size: 27px; font-weight: 800; letter-spacing: -0.5px; color: #087d82; }
.brand-sub { margin-top: 5px; font-size: 14px; color: #768388; }
.card {
  background: white; border-radius: 22px; padding: 28px 22px;
  box-shadow: 0 8px 30px rgba(25, 60, 70, 0.08);
}
.status-icon {
  width: 76px; height: 76px; margin: 0 auto 18px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  background: #e6f7f0; font-size: 40px;
}
.title { text-align: center; font-size: 25px; font-weight: 800; color: #107a58; margin-bottom: 8px; }
.subtitle { text-align: center; color: #66767b; font-size: 15px; line-height: 1.5; margin-bottom: 26px; }
.info { border-top: 1px solid #e6ecee; }
.row { padding: 15px 0; border-bottom: 1px solid #e6ecee; }
.label { font-size: 12px; color: #869297; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 5px; }
.value { font-size: 16px; font-weight: 600; word-break: break-word; }
.actions { margin-top: 24px; }
.button {
  display: block; width: 100%; padding: 15px 18px; margin-top: 11px;
  text-align: center; text-decoration: none; border-radius: 13px;
  font-size: 16px; font-weight: 700;
}
.primary { background: #078b91; color: white; }
.secondary { background: #edf5f5; color: #087d82; }
.security {
  margin-top: 22px; padding: 14px; border-radius: 12px; background: #f5f8f8;
  color: #68777b; font-size: 13px; line-height: 1.5; text-align: center;
}
.domain { margin-top: 22px; text-align: center; font-size: 12px; color: #95a0a4; }
</style>
</head>
<body>
<div class="container">

  <div class="brand">
    <div class="brand-name">${clinic}</div>
    <div class="brand-sub">Elektron hujjat tekshirish tizimi</div>
  </div>

  <div class="card">
    <div class="status-icon">✓</div>
    <div class="title">Hujjat haqiqiy</div>
    <div class="subtitle">Ushbu hujjat rasmiy reyestrdan muvaffaqiyatli topildi.</div>

    <div class="info">
      <div class="row">
        <div class="label">Hujjat raqami</div>
        <div class="value">${docNo}</div>
      </div>
      ${fileName ? `
      <div class="row">
        <div class="label">Hujjat nomi</div>
        <div class="value">${fileName}</div>
      </div>` : ""}
      ${createdAt ? `
      <div class="row">
        <div class="label">Tasdiqlangan sana</div>
        <div class="value">${createdAt}</div>
      </div>` : ""}
      ${approvedBy ? `
      <div class="row">
        <div class="label">Tasdiqladi</div>
        <div class="value">${approvedBy}</div>
      </div>` : ""}
    </div>

    <div class="actions">
      <a class="button primary" href="${safeViewUrl}" target="_blank" rel="noopener noreferrer">Hujjatni ko&rsquo;rish</a>
      <a class="button secondary" href="${safeDownloadUrl}" target="_blank" rel="noopener noreferrer">PDF nusxani yuklab olish</a>
    </div>

    <div class="security">
      Hujjat raqami va maxfiy tasdiqlash tokeni rasmiy reyestr bilan solishtirildi.
      PDF uchun havola vaqtinchalik himoyalangan havola orqali beriladi.
    </div>
  </div>

  <div class="domain">${host}</div>
</div>
</body>
</html>`;

  return htmlResponse(html, 200);
}

function renderRevoked(data, env) {
  const clinic = escapeHtml(clinicName_(env));
  const host = escapeHtml(String(env.OFFICIAL_HOST || ""));
  const docNo = escapeHtml(data.docNo || "");
  const fileName = escapeHtml(data.fileName || "");
  const createdAt = escapeHtml(data.createdAt || "");
  const revokedAt = escapeHtml(data.revokedAt || "");
  const revokedBy = escapeHtml(signerName_(env));
  const revokeReason = escapeHtml(data.revokeReason || "");

  const html = `<!DOCTYPE html>
<html lang="uz">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex,nofollow">
<title>${clinic} — Hujjat bekor qilingan</title>
<style>
* { box-sizing: border-box; }
body {
  margin: 0; padding: 24px 16px;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
  background: #f5f8f8; color: #172327;
}
.container { width: 100%; max-width: 560px; margin: 0 auto; }
.brand { text-align: center; margin: 20px 0 28px; }
.brand-name { font-size: 27px; font-weight: 800; letter-spacing: -0.5px; color: #087d82; }
.brand-sub { margin-top: 5px; font-size: 14px; color: #768388; }
.card {
  background: white; border-radius: 22px; padding: 28px 22px;
  box-shadow: 0 8px 30px rgba(25, 60, 70, 0.08);
}
.status-icon {
  width: 76px; height: 76px; margin: 0 auto 18px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  background: #fff0f0; color: #c43b3b; font-size: 40px; font-weight: 800;
}
.title { text-align: center; font-size: 25px; font-weight: 800; color: #b52f2f; margin-bottom: 8px; }
.subtitle { text-align: center; color: #66767b; font-size: 15px; line-height: 1.5; margin-bottom: 26px; }
.warning {
  margin-bottom: 22px; padding: 14px; border-radius: 12px; background: #fff4f4;
  color: #9b3030; font-size: 14px; font-weight: 600; line-height: 1.5; text-align: center;
}
.info { border-top: 1px solid #e6ecee; }
.row { padding: 15px 0; border-bottom: 1px solid #e6ecee; }
.label { font-size: 12px; color: #869297; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 5px; }
.value { font-size: 16px; font-weight: 600; word-break: break-word; }
.reason { color: #a22f2f; }
.security {
  margin-top: 22px; padding: 14px; border-radius: 12px; background: #f5f8f8;
  color: #68777b; font-size: 13px; line-height: 1.5; text-align: center;
}
.domain { margin-top: 22px; text-align: center; font-size: 12px; color: #95a0a4; }
</style>
</head>
<body>
<div class="container">

  <div class="brand">
    <div class="brand-name">${clinic}</div>
    <div class="brand-sub">Elektron hujjat tekshirish tizimi</div>
  </div>

  <div class="card">
    <div class="status-icon">!</div>
    <div class="title">Hujjat bekor qilingan</div>
    <div class="subtitle">
      Ushbu hujjat avval tasdiqlangan, ammo keyinchalik rasmiy reyestrda bekor qilingan.
    </div>
    <div class="warning">
      Ushbu hujjatdan amaldagi rasmiy hujjat sifatida foydalanmang.
    </div>

    <div class="info">
      ${docNo ? `
      <div class="row">
        <div class="label">Hujjat raqami</div>
        <div class="value">${docNo}</div>
      </div>` : ""}
      ${fileName ? `
      <div class="row">
        <div class="label">Hujjat nomi</div>
        <div class="value">${fileName}</div>
      </div>` : ""}
      ${createdAt ? `
      <div class="row">
        <div class="label">Dastlab tasdiqlangan sana</div>
        <div class="value">${createdAt}</div>
      </div>` : ""}
      ${revokedAt ? `
      <div class="row">
        <div class="label">Bekor qilingan sana</div>
        <div class="value">${revokedAt}</div>
      </div>` : ""}
      ${revokedBy ? `
      <div class="row">
        <div class="label">Bekor qildi</div>
        <div class="value">${revokedBy}</div>
      </div>` : ""}
      ${revokeReason ? `
      <div class="row">
        <div class="label">Bekor qilish sababi</div>
        <div class="value reason">${revokeReason}</div>
      </div>` : ""}
    </div>

    <div class="security">
      Ushbu holat ${clinic} elektron reyestridan real vaqt rejimida tekshirildi.
    </div>
  </div>

  <div class="domain">${host}</div>
</div>
</body>
</html>`;

  return htmlResponse(html, 410);
}

function renderNotFound(clinic = DEFAULT_CLINIC) {
  clinic = escapeHtml(clinic);

  const html = `<!DOCTYPE html>
<html lang="uz">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex,nofollow">
<title>Hujjat topilmadi</title>
<style>
* { box-sizing: border-box; }
body {
  margin: 0; padding: 24px 16px;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
  background: #f5f8f8; color: #172327;
}
.card {
  max-width: 520px; margin: 50px auto; padding: 30px 22px; background: white;
  border-radius: 22px; text-align: center; box-shadow: 0 8px 30px rgba(25, 60, 70, 0.08);
}
.brand { font-size: 25px; font-weight: 800; color: #087d82; margin-bottom: 28px; }
.icon {
  width: 76px; height: 76px; margin: 0 auto 18px; display: flex;
  align-items: center; justify-content: center; border-radius: 50%;
  background: #fff1f1; color: #c43b3b; font-size: 37px; font-weight: 700;
}
h1 { font-size: 24px; margin: 0 0 12px; }
p { color: #69787d; line-height: 1.55; margin: 0; }
</style>
</head>
<body>
<div class="card">
  <div class="brand">${clinic}</div>
  <div class="icon">!</div>
  <h1>Hujjat topilmadi</h1>
  <p>Hujjat raqami yoki tasdiqlash ma&rsquo;lumotlari rasmiy reyestrga mos kelmadi.</p>
</div>
</body>
</html>`;

  return htmlResponse(html, 404);
}

function renderServerError() {
  const html = `<!DOCTYPE html>
<html lang="uz">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex,nofollow">
<title>Tekshirish xatosi</title>
<style>
* { box-sizing: border-box; }
body {
  margin: 0; padding: 24px 16px;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
  background: #f5f8f8; color: #172327;
}
.box {
  max-width: 500px; margin: 50px auto; background: white; padding: 30px;
  border-radius: 18px; text-align: center; box-shadow: 0 8px 30px rgba(25, 60, 70, 0.08);
}
h2 { margin-top: 0; font-size: 24px; }
p { color: #69787d; line-height: 1.55; }
</style>
</head>
<body>
<div class="box">
  <h2>Tekshirish xizmatida vaqtinchalik xatolik</h2>
  <p>Iltimos, birozdan so&rsquo;ng qayta urinib ko&rsquo;ring.</p>
</div>
</body>
</html>`;

  return htmlResponse(html, 502);
}

function privateErrorResponse_(message, status) {
  return new Response(String(message || "Xatolik"), {
    status: status,
    headers: {
      "Content-Type": "text/plain; charset=UTF-8",
      "Cache-Control": "private, no-store, max-age=0",
      Pragma: "no-cache",
      Expires: "0",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer"
    }
  });
}

/* =========================================================
   GOOGLE SERVICE ACCOUNT — DIAGNOSTICS
   Not routed in production. Wire it to an authenticated path only.
   ========================================================= */

async function googleHealthCheck_(env) {
  try {
    const required = [
      "GCP_SERVICE_ACCOUNT_JSON",
      "GOOGLE_SHEETS_ID",
      "APPROVED_FOLDER_ID",
      "FILE_TICKET_SECRET"
    ];

    for (const name of required) {
      if (!env[name]) throw new Error(name + " topilmadi");
    }

    const accessToken = await getGoogleAccessToken_(env);

    const sheetUrl =
      "https://sheets.googleapis.com/v4/spreadsheets/" +
      encodeURIComponent(env.GOOGLE_SHEETS_ID) +
      "/values/" +
      encodeURIComponent("Reyestr!A1:P2");

    const sheetResponse = await fetch(sheetUrl, {
      headers: { Authorization: "Bearer " + accessToken }
    });

    if (!sheetResponse.ok) {
      const text = await sheetResponse.text();
      throw new Error(
        "Sheets API: HTTP " + sheetResponse.status + " " + text.slice(0, 300)
      );
    }

    const sheetData = await sheetResponse.json();

    const driveUrl =
      "https://www.googleapis.com/drive/v3/files/" +
      encodeURIComponent(env.APPROVED_FOLDER_ID) +
      "?fields=id,name,mimeType";

    const driveResponse = await fetch(driveUrl, {
      headers: { Authorization: "Bearer " + accessToken }
    });

    if (!driveResponse.ok) {
      const text = await driveResponse.text();
      throw new Error(
        "Drive API: HTTP " + driveResponse.status + " " + text.slice(0, 300)
      );
    }

    const driveData = await driveResponse.json();

    return jsonResponseWorker_(
      {
        ok: true,
        googleAuth: true,
        sheets: true,
        drive: true,
        fileTicketSecret: true,
        sheetRowsRead: Array.isArray(sheetData.values) ? sheetData.values.length : 0,
        approvedFolder: driveData.name || "",
        approvedFolderIdMatches: driveData.id === env.APPROVED_FOLDER_ID
      },
      200
    );
  } catch (error) {
    return jsonResponseWorker_(
      {
        ok: false,
        googleAuth: false,
        error: String(error && error.message ? error.message : error).slice(0, 500)
      },
      500
    );
  }
}

/* =========================================================
   GOOGLE OAUTH — SERVICE ACCOUNT → JWT → ACCESS TOKEN
   ========================================================= */

async function getGoogleAccessToken_(env) {
  if (!env.GCP_SERVICE_ACCOUNT_JSON) {
    throw new Error("GCP_SERVICE_ACCOUNT_JSON topilmadi");
  }

  let serviceAccount;

  try {
    serviceAccount = JSON.parse(env.GCP_SERVICE_ACCOUNT_JSON);
  } catch (error) {
    throw new Error("Service Account JSON noto'g'ri");
  }

  if (!serviceAccount.client_email || !serviceAccount.private_key) {
    throw new Error("Service Account credential to'liq emas");
  }

  const now = Math.floor(Date.now() / 1000);

  /* Read-only scopes only. The public backend must never be able to
   * modify, delete or re-share anything in Google. */
  const scope = [
    "https://www.googleapis.com/auth/drive.readonly",
    "https://www.googleapis.com/auth/spreadsheets.readonly"
  ].join(" ");

  const header = { alg: "RS256", typ: "JWT" };

  const payload = {
    iss: serviceAccount.client_email,
    scope: scope,
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600
  };

  const unsignedToken = base64UrlJson_(header) + "." + base64UrlJson_(payload);

  const privateKey = await importGooglePrivateKey_(serviceAccount.private_key);

  const signature = await crypto.subtle.sign(
    { name: "RSASSA-PKCS1-v1_5" },
    privateKey,
    new TextEncoder().encode(unsignedToken)
  );

  const assertion = unsignedToken + "." + arrayBufferToBase64Url_(signature);

  const body = new URLSearchParams();
  body.set("grant_type", "urn:ietf:params:oauth:grant-type:jwt-bearer");
  body.set("assertion", assertion);

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString()
  });

  const text = await response.text();

  let data;

  try {
    data = JSON.parse(text);
  } catch (error) {
    throw new Error("Google OAuth JSON qaytarmadi");
  }

  if (!response.ok || !data.access_token) {
    throw new Error(
      "Google OAuth: " +
        String(data.error_description || data.error || "Access token olinmadi")
    );
  }

  return data.access_token;
}

async function importGooglePrivateKey_(pem) {
  const clean = String(pem || "")
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s+/g, "");

  if (!clean) throw new Error("Private key bo'sh");

  const binary = Uint8Array.from(atob(clean), (char) => char.charCodeAt(0));

  return crypto.subtle.importKey(
    "pkcs8",
    binary.buffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
}

/* =========================================================
   HELPERS
   ========================================================= */

function base64UrlJson_(value) {
  return bytesToBase64Url_(new TextEncoder().encode(JSON.stringify(value)));
}

function arrayBufferToBase64Url_(buffer) {
  return bytesToBase64Url_(new Uint8Array(buffer));
}

function bytesToBase64Url_(bytes) {
  let binary = "";
  const chunkSize = 0x8000;

  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
  }

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function htmlResponse(html, status) {
  return new Response(html, {
    status: status,
    headers: {
      "Content-Type": "text/html; charset=UTF-8",
      "Cache-Control": "no-store, no-cache, must-revalidate",
      Pragma: "no-cache",
      Expires: "0",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "X-Frame-Options": "DENY",
      "Content-Security-Policy":
        "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; " +
        "frame-ancestors 'none'; form-action 'none'"
    }
  });
}

function jsonResponseWorker_(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status: status,
    headers: {
      "Content-Type": "application/json; charset=UTF-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer"
    }
  });
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
