/**
 * VivaMed Hujjat — Apps Script Web App endpoint.
 *
 * This was the entire public face before verification moved to the
 * Cloudflare Worker. It is kept as an internal/rollback endpoint and now
 * returns JSON rather than rendering Verify.html.
 *
 *   GET .../exec?d={docNo}&t={token}
 *
 * Both parameters must match. Every failure — spreadsheet unreachable,
 * sheet missing, wrong token, no such row — resolves to the same
 * NOT_FOUND answer: telling a stranger "the token is wrong" would also
 * tell them the document number exists.
 *
 * NOTE: the viewUrl/downloadUrl below are Google Drive links, which only
 * work for files that are shared. Approved PDFs are Restricted, so in
 * the current architecture the Worker's /file/ gateway is the way a
 * client reaches the PDF. Treat these fields as legacy.
 */

function doGet(e) {
  var docNo = String(
    e && e.parameter && e.parameter.d ? e.parameter.d : ''
  ).trim();

  var token = String(
    e && e.parameter && e.parameter.t ? e.parameter.t : ''
  ).trim();

  var clinic = DEFAULT_CLINIC;
  var rec = null;

  try {
    clinic = Config.get('CLINIC_NAME', DEFAULT_CLINIC);

    if (docNo && token) {
      rec = Registry.findForVerification(docNo, token);
    }
  } catch (err) {
    rec = null;
  }

  if (!rec) {
    return jsonResponse_({
      ok: false,
      status: 'NOT_FOUND',
      clinic: clinic
    });
  }

  var status = String(rec.status || 'ACTIVE').trim().toUpperCase();

  if (status === 'REVOKED') {
    return jsonResponse_({
      ok: false,
      status: 'REVOKED',
      clinic: clinic,
      docNo: rec.docNo || docNo,
      fileName: rec.fileName || '',
      createdAt: formatVerifyDate_(rec.createdAt),
      revokedAt: formatVerifyDate_(rec.revokedAt),
      revokedBy: rec.revokedBy || '',
      revokeReason: rec.revokeReason || ''
    });
  }

  if (status !== 'ACTIVE') {
    return jsonResponse_({
      ok: false,
      status: status,
      clinic: clinic,
      docNo: rec.docNo || docNo
    });
  }

  return jsonResponse_({
    ok: true,
    status: 'ACTIVE',
    clinic: clinic,
    docNo: rec.docNo || docNo,
    fileName: rec.fileName || '',
    createdAt: formatVerifyDate_(rec.createdAt),
    approvedBy: rec.approvedBy || '',
    fileSha256: rec.fileSha256 || '',
    viewUrl: rec.fileId
      ? 'https://drive.google.com/file/d/' +
        encodeURIComponent(rec.fileId) + '/view'
      : '',
    downloadUrl: rec.fileId
      ? 'https://drive.google.com/uc?export=download&id=' +
        encodeURIComponent(rec.fileId)
      : ''
  });
}

function jsonResponse_(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function formatVerifyDate_(value) {
  if (!value) return '';

  try {
    return Utilities.formatDate(
      new Date(value), 'Asia/Tashkent', 'dd.MM.yyyy HH:mm'
    );
  } catch (err) {
    return String(value);
  }
}
