/**
 * VivaMed Hujjat — the registry.
 *
 * Google Sheets, "Reyestr", columns A-P:
 *
 *   A  Hujjat raqami        docNo
 *   B  Fayl nomi            fileName
 *   C  File ID              approved PDF
 *   D  Manba File ID        untouched original
 *   E  Yubordi              uploader
 *   F  Yaratilgan sana      issued at
 *   G  Tekshirish havolasi  verification URL in the QR
 *   H  Jo'natildi           recipient
 *   I  Jo'natilgan sana     sent at
 *   J  Token                verification token — never printed
 *   K  Tasdiqladi           approver (Google account, internal audit)
 *   L  STATUS               RESERVED / ACTIVE / REVOKED / FAILED
 *   M  FILE_SHA256          fingerprint of the final PDF
 *   N  REVOKED_AT
 *   O  REVOKED_BY
 *   P  REVOKE_REASON
 */

var Registry = (function () {

  var COLS = 16;

  var TOKEN_COL = 10;
  var APPROVER_COL = 11;
  var STATUS_COL = 12;
  var HASH_COL = 13;
  var REVOKED_AT_COL = 14;
  var REVOKED_BY_COL = 15;
  var REVOKE_REASON_COL = 16;

  function sheet() {
    var sh = Config.spreadsheet().getSheetByName(REGISTRY_SHEET);

    if (!sh) {
      throw new Error('Jadvalda "' + REGISTRY_SHEET + '" varag\'i topilmadi.');
    }

    return sh;
  }

  /**
   * 24 hex characters = 96 bits. Document numbers are sequential and
   * printed on the page; this token is what makes them unguessable, and
   * it appears only inside the QR URL.
   */
  function makeToken_() {
    return Utilities.getUuid().replace(/-/g, '').substring(0, 24);
  }

  function escapeRegex_(str) {
    return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /* =========================
     RESERVE
     ========================= */

  /**
   * Reserves a document number and a verification token, under a lock,
   * BEFORE the expensive PDF work starts.
   *
   * If the number were assigned at the end, two managers approving at
   * the same time would both read the same "last number" and both take
   * it — two different documents with one identity. The lock is held for
   * about 0.3 s; the 10-30 s of PDF processing runs unlocked.
   *
   * STATUS = RESERVED
   */
  function reserve() {
    var lock = LockService.getScriptLock();
    lock.waitLock(30000);

    try {
      var prefix = Config.get('DOC_PREFIX', 'VM-PDF');

      var year = Utilities.formatDate(new Date(), 'Asia/Tashkent', 'yyyy');

      var sh = sheet();
      var last = sh.getLastRow();
      var max = 0;

      if (last > 1) {
        var re = new RegExp(
          '^' + escapeRegex_(prefix) + '-' + year + '-(\\d+)$'
        );

        var values = sh.getRange(2, 1, last - 1, 1).getValues();

        values.forEach(function (r) {
          var match = re.exec(String(r[0] || '').trim());

          if (match) {
            var n = parseInt(match[1], 10);
            if (n > max) max = n;
          }
        });
      }

      var next = max + 1;

      var docNo =
        prefix + '-' + year + '-' + ('000000' + next).slice(-6);

      var token = makeToken_();
      var row = Math.max(last, 1) + 1;

      sh.getRange(row, 1).setValue(docNo);              // A
      sh.getRange(row, TOKEN_COL).setValue(token);      // J
      sh.getRange(row, STATUS_COL).setValue('RESERVED'); // L

      SpreadsheetApp.flush();

      return { docNo: docNo, token: token, row: row };

    } finally {
      lock.releaseLock();
    }
  }

  /* =========================
     FILL
     ========================= */

  /**
   * Called only after the PDF exists and has been stored.
   * The registry therefore contains only documents that really exist.
   *
   * RESERVED -> ACTIVE
   */
  function fill(row, rec) {
    var sh = sheet();

    sh.getRange(row, 2, 1, 8).setValues([[
      rec.fileName || '',
      rec.fileId || '',
      rec.sourceId || '',
      rec.uploadedBy || '',
      new Date(),
      rec.verifyUrl || '',
      '',
      ''
    ]]);

    sh.getRange(row, APPROVER_COL).setValue(rec.approvedBy || '');
    sh.getRange(row, STATUS_COL).setValue('ACTIVE');

    if (rec.fileSha256) {
      sh.getRange(row, HASH_COL).setValue(String(rec.fileSha256).trim());
    }

    SpreadsheetApp.flush();
  }

  /* =========================
     FAILED
     ========================= */

  /**
   * The row is marked, never deleted. Deleting would leave a gap in the
   * sequence and confuse the next reserve(); keeping it preserves the
   * "this number was issued but no document came out" audit trail.
   */
  function markFailed(row, reason) {
    try {
      var sh = sheet();

      sh.getRange(row, 2).setValue(
        'XATO: ' + String(reason || '').slice(0, 200)
      );

      sh.getRange(row, STATUS_COL).setValue('FAILED');

      SpreadsheetApp.flush();
    } catch (e) {
      // never mask the original error
    }
  }

  /* =========================
     LOOKUP
     ========================= */

  /** Returns the record only when it is ACTIVE and has a file. */
  function find(docNo, token) {
    var rec = findForVerification(docNo, token);

    if (!rec) return null;
    if (rec.status !== 'ACTIVE') return null;
    if (!rec.fileId) return null;

    return rec;
  }

  /**
   * Public verification lookup. Both the document number and the token
   * must match. Scans backwards, so if a number ever repeats the newest
   * row wins.
   *
   * Fail closed: a blank token cell DENIES access rather than skipping
   * the check, and a mismatch returns null so the caller cannot tell
   * "wrong token" from "no such document".
   */
  function findForVerification(docNo, token) {
    var sh = sheet();
    var last = sh.getLastRow();

    if (last < 2) return null;

    var needle = String(docNo || '').trim();
    var suppliedToken = String(token || '').trim();

    if (!needle || !suppliedToken) return null;

    var values = sh.getRange(2, 1, last - 1, COLS).getValues();

    for (var i = values.length - 1; i >= 0; i--) {
      var storedDocNo = String(values[i][0] || '').trim();

      if (storedDocNo !== needle) continue;

      var storedToken = String(values[i][9] || '').trim();

      if (!storedToken || storedToken !== suppliedToken) {
        return null;
      }

      var status = String(values[i][11] || '').trim().toUpperCase();

      /* Legacy rows predate the STATUS column. */
      if (!status) status = 'ACTIVE';

      return {
        row: i + 2,
        docNo: values[i][0],
        fileName: values[i][1],
        fileId: values[i][2],
        sourceId: values[i][3],
        uploadedBy: values[i][4],
        createdAt: values[i][5],
        verifyUrl: values[i][6],
        sentTo: values[i][7],
        sentAt: values[i][8],
        approvedBy: values[i][10],
        status: status,
        fileSha256: String(values[i][12] || '').trim(),
        revokedAt: values[i][13] || '',
        revokedBy: values[i][14] || '',
        revokeReason: values[i][15] || ''
      };
    }

    return null;
  }

  /* =========================
     REVOKE
     ========================= */

  /**
   * Revocation cannot recall printed ink, so it changes what the server
   * says instead. The PDF is not deleted; STATUS becomes REVOKED and
   * every subsequent scan — and every subsequent signed file link —
   * is refused.
   */
  function revoke(docNo, reason, revokedBy) {
    var lock = LockService.getScriptLock();
    lock.waitLock(30000);

    try {
      var needle = String(docNo || '').trim();

      if (!needle) throw new Error('Hujjat raqami bo\'sh.');

      var revokeReason = String(reason || '').trim();

      if (!revokeReason) {
        throw new Error('Bekor qilish sababi kiritilmagan.');
      }

      var sh = sheet();
      var last = sh.getLastRow();

      if (last < 2) throw new Error('Reyestr bo\'sh.');

      var values = sh.getRange(2, 1, last - 1, COLS).getValues();

      for (var i = values.length - 1; i >= 0; i--) {
        if (String(values[i][0] || '').trim() !== needle) continue;

        var row = i + 2;

        var currentStatus = String(values[i][11] || '').trim().toUpperCase();

        if (!currentStatus) currentStatus = 'ACTIVE';

        if (currentStatus === 'REVOKED') {
          throw new Error('Bu hujjat allaqachon bekor qilingan.');
        }

        if (currentStatus !== 'ACTIVE') {
          throw new Error(
            'Faqat ACTIVE hujjatni bekor qilish mumkin. Hozirgi status: ' +
            currentStatus
          );
        }

        sh.getRange(row, STATUS_COL).setValue('REVOKED');
        sh.getRange(row, REVOKED_AT_COL).setValue(new Date());

        sh.getRange(row, REVOKED_BY_COL).setValue(
          String(revokedBy || Config.get('SIGNER_NAME', '')).trim()
        );

        sh.getRange(row, REVOKE_REASON_COL).setValue(
          revokeReason.slice(0, 500)
        );

        SpreadsheetApp.flush();

        return { ok: true, row: row, docNo: needle, status: 'REVOKED' };
      }

      throw new Error('Hujjat topilmadi.');

    } finally {
      lock.releaseLock();
    }
  }

  /* =========================
     MARK SENT
     ========================= */

  function markSent(docNo, to) {
    var sh = sheet();
    var last = sh.getLastRow();

    if (last < 2) return;

    var values = sh.getRange(2, 1, last - 1, 1).getValues();
    var needle = String(docNo || '').trim();

    for (var i = values.length - 1; i >= 0; i--) {
      if (String(values[i][0] || '').trim() === needle) {
        sh.getRange(i + 2, 8).setValue(to);          // H
        sh.getRange(i + 2, 9).setValue(new Date());  // I

        SpreadsheetApp.flush();
        return;
      }
    }
  }

  return {
    reserve: reserve,
    fill: fill,
    markFailed: markFailed,
    find: find,
    findForVerification: findForVerification,
    revoke: revoke,
    markSent: markSent
  };

})();
