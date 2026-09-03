/**
 * VivaMed Hujjat — cards, approval pipeline and revocation.
 *
 * MAIN FLOW
 *
 *   01 — Tasdiqlanishi kerak   (employee drops a file here)
 *          ↓  manager approves
 *   PDF + QR + SHA-256
 *          ↓
 *   02 — Tasdiqlangan          (Restricted; the Worker reads from here)
 *          ↓
 *   Registry row = ACTIVE
 *
 * LATER
 *
 *   ACTIVE document → revoke with a reason
 *          ↓
 *   Registry row = REVOKED
 *          ↓
 *   PDF moved to 03 — Arxiv
 *          ↓
 *   QR scan now shows "Hujjat bekor qilingan"
 *
 * There is no "status" field in Drive, so the folder IS the state.
 */

/* =========================================================
   GLOBALS
   ========================================================= */

var DEFAULT_CLINIC = 'VivaMed Center';
var MAX_PENDING_SHOW = 20;

var MIME_PDF = 'application/pdf';
var MIME_FOLDER = 'application/vnd.google-apps.folder';

var GOOGLE_NATIVE = {
  'application/vnd.google-apps.document': 'Google Docs',
  'application/vnd.google-apps.spreadsheet': 'Google Sheets',
  'application/vnd.google-apps.presentation': 'Google Slides',
  'application/vnd.google-apps.drawing': 'Google Drawings'
};

var CONVERTIBLE = {
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    { to: 'application/vnd.google-apps.document', label: 'Word' },
  'application/msword':
    { to: 'application/vnd.google-apps.document', label: 'Word 97-2003' },
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
    { to: 'application/vnd.google-apps.spreadsheet', label: 'Excel' },
  'application/vnd.ms-excel':
    { to: 'application/vnd.google-apps.spreadsheet', label: 'Excel 97-2003' },
  'application/vnd.openxmlformats-officedocument.presentationml.presentation':
    { to: 'application/vnd.google-apps.presentation', label: 'PowerPoint' },
  'application/vnd.ms-powerpoint':
    { to: 'application/vnd.google-apps.presentation', label: 'PowerPoint 97-2003' },
  'application/rtf':
    { to: 'application/vnd.google-apps.document', label: 'RTF' },
  'text/plain':
    { to: 'application/vnd.google-apps.document', label: 'Matn fayli' },
  'text/csv':
    { to: 'application/vnd.google-apps.spreadsheet', label: 'CSV' },
  'application/vnd.oasis.opendocument.text':
    { to: 'application/vnd.google-apps.document', label: 'ODT' },
  'application/vnd.oasis.opendocument.spreadsheet':
    { to: 'application/vnd.google-apps.spreadsheet', label: 'ODS' },
  'application/vnd.oasis.opendocument.presentation':
    { to: 'application/vnd.google-apps.presentation', label: 'ODP' }
};

/* =========================================================
   FILE TYPE
   ========================================================= */

function fileKind_(mime) {
  if (mime === MIME_PDF) {
    return { ok: true, label: 'PDF', convert: false };
  }

  if (GOOGLE_NATIVE[mime]) {
    return { ok: true, label: GOOGLE_NATIVE[mime], convert: true };
  }

  if (CONVERTIBLE[mime]) {
    return { ok: true, label: CONVERTIBLE[mime].label, convert: true };
  }

  return { ok: false, label: 'Qo\'llab-quvvatlanmaydi' };
}

/* =========================================================
   HOME CARD
   ========================================================= */

function onHomePage(e) {
  var card = CardService.newCardBuilder().setHeader(
    CardService.newCardHeader()
      .setTitle('VivaMed Hujjat')
      .setSubtitle('Hujjatlarni tasdiqlash')
  );

  var d;

  try {
    d = Config.diagnose();
  } catch (err) {
    return card.addSection(
      CardService.newCardSection()
        .addWidget(
          CardService.newTextParagraph()
            .setText('<b>Sozlash kerak:</b> ' + err.message)
        )
        .addWidget(settingsButton_(true))
    ).build();
  }

  if (d.problems.length) {
    return card.addSection(
      CardService.newCardSection()
        .addWidget(
          CardService.newTextParagraph().setText(
            '<b>Sozlash tugallanmagan:</b><br>• ' +
            d.problems.join('<br>• ')
          )
        )
        .addWidget(settingsButton_(true))
    ).build();
  }

  var pending;

  try {
    pending = listPending_();
  } catch (err) {
    return card.addSection(
      CardService.newCardSection()
        .addWidget(
          CardService.newTextParagraph()
            .setText('<b>Papkani o\'qib bo\'lmadi:</b> ' + err.message)
        )
        .addWidget(settingsButton_(false))
    ).build();
  }

  var head = CardService.newCardSection();

  if (pending.length === 0) {
    head.addWidget(
      CardService.newTextParagraph()
        .setText('Tasdiqlashni kutayotgan hujjat yo\'q.')
    );
  } else {
    head.addWidget(
      CardService.newTextParagraph()
        .setText('<b>Kutilmoqda: ' + pending.length + ' ta</b>')
    );
  }

  head.addWidget(
    CardService.newTextButton()
      .setText('Yangilash')
      .setOnClickAction(
        CardService.newAction().setFunctionName('refreshHome')
      )
  );

  head.addWidget(
    CardService.newTextButton()
      .setText('Tasdiqlangan hujjatlar')
      .setOnClickAction(
        CardService.newAction().setFunctionName('openApprovedDocuments')
      )
  );

  card.addSection(head);

  if (pending.length) {
    var list = CardService.newCardSection().setHeader('Tasdiqlanishi kerak');

    pending.forEach(function (f) {
      list.addWidget(
        CardService.newKeyValue()
          .setTopLabel(f.kind + ' · ' + f.dateText)
          .setContent(f.name)
          .setMultiline(true)
          .setOnClickAction(
            CardService.newAction()
              .setFunctionName('showDocument')
              .setParameters({ fileId: f.id })
          )
      );
    });

    card.addSection(list);
  }

  var info = CardService.newCardSection();

  info.addWidget(
    CardService.newKeyValue()
      .setTopLabel('Reyestr')
      .setContent(d.info.jadval || '—')
  );

  info.addWidget(settingsButton_(false));

  card.addSection(info);

  return card.build();
}

function settingsButton_(filled) {
  return CardService.newTextButton()
    .setText('Sozlamalar')
    .setTextButtonStyle(
      filled
        ? CardService.TextButtonStyle.FILLED
        : CardService.TextButtonStyle.TEXT
    )
    .setOnClickAction(
      CardService.newAction().setFunctionName('showSettingsCard')
    );
}

function refreshHome() {
  return CardService.newActionResponseBuilder()
    .setNavigation(CardService.newNavigation().updateCard(onHomePage({})))
    .build();
}

function openApprovedDocuments() {
  return CardService.newActionResponseBuilder()
    .setNavigation(
      CardService.newNavigation().pushCard(showApprovedDocuments())
    )
    .build();
}

/* =========================================================
   PENDING LIST
   ========================================================= */

function listPending_() {
  var folderId = Config.get('FOLDER_PENDING', '');

  if (!folderId) {
    throw new Error('FOLDER_PENDING sozlanmagan.');
  }

  var folder = DriveApp.getFolderById(folderId);
  var it = folder.getFiles();
  var out = [];

  /* NOTE: this takes the first N files Drive happens to return and only
   * then sorts them, so it is not "the newest N". With more than
   * MAX_PENDING_SHOW pending files the newest one may not appear. */
  while (it.hasNext() && out.length < MAX_PENDING_SHOW) {
    var file = it.next();
    var mime = file.getMimeType();

    if (mime === MIME_FOLDER) continue;

    var kind = fileKind_(mime);

    out.push({
      id: file.getId(),
      name: file.getName(),
      kind: kind.label,
      supported: kind.ok,
      date: file.getDateCreated(),
      dateText: Utilities.formatDate(
        file.getDateCreated(), 'Asia/Tashkent', 'dd.MM HH:mm'
      )
    });
  }

  out.sort(function (a, b) { return b.date - a.date; });

  return out;
}

/* =========================================================
   DOCUMENT CARD
   ========================================================= */

function showDocument(e) {
  var fileId = e.commonEventObject.parameters.fileId;

  return CardService.newActionResponseBuilder()
    .setNavigation(
      CardService.newNavigation().pushCard(buildDocumentCard_(fileId))
    )
    .build();
}

function buildDocumentCard_(fileId) {
  var file;
  var kind;

  try {
    file = DriveApp.getFileById(fileId);
    kind = fileKind_(file.getMimeType());
  } catch (err) {
    return simpleCard_('Xato', 'Fayl ochilmadi: ' + err.message);
  }

  var section = CardService.newCardSection()
    .addWidget(
      CardService.newKeyValue()
        .setTopLabel('Fayl')
        .setContent(file.getName())
        .setMultiline(true)
    )
    .addWidget(
      CardService.newKeyValue().setTopLabel('Turi').setContent(kind.label)
    )
    .addWidget(
      CardService.newKeyValue()
        .setTopLabel('Yuklangan')
        .setContent(
          Utilities.formatDate(
            file.getDateCreated(), 'Asia/Tashkent', 'dd.MM.yyyy HH:mm'
          )
        )
    )
    .addWidget(
      CardService.newTextButton()
        .setText('Hujjatni ko\'rish')
        .setOpenLink(CardService.newOpenLink().setUrl(file.getUrl()))
    );

  if (!kind.ok) {
    section.addWidget(
      CardService.newTextParagraph().setText(
        '<font color="#A32020">Bu fayl turini tasdiqlab bo\'lmaydi.</font>'
      )
    );

    return CardService.newCardBuilder()
      .setHeader(CardService.newCardHeader().setTitle('Hujjat'))
      .addSection(section)
      .build();
  }

  var action = CardService.newCardSection().setHeader('Qaror');

  if (kind.convert) {
    action.addWidget(
      CardService.newTextParagraph().setText(
        '<font color="#5F6B68">' +
        'Tasdiqlanganda PDF\'ga o\'girilib, QR qo\'yiladi. ' +
        'Asl fayl arxivga ko\'chiriladi.' +
        '</font>'
      )
    );
  }

  action
    .addWidget(
      CardService.newSelectionInput()
        .setType(CardService.SelectionInputType.DROPDOWN)
        .setFieldName('placement')
        .setTitle('QR joylashuvi')
        .addItem('Faqat oxirgi sahifa', 'last', true)
        .addItem('Har bir sahifa', 'all', false)
    )
    .addWidget(
      CardService.newTextButton()
        .setText('Tasdiqlash')
        .setTextButtonStyle(CardService.TextButtonStyle.FILLED)
        .setOnClickAction(
          CardService.newAction()
            .setFunctionName('handleApprove')
            .setParameters({ fileId: fileId, fileName: file.getName() })
        )
    )
    .addWidget(
      CardService.newTextButton()
        .setText('Rad etish')
        .setOnClickAction(
          CardService.newAction()
            .setFunctionName('handleReject')
            .setParameters({ fileId: fileId })
        )
    );

  return CardService.newCardBuilder()
    .setHeader(
      CardService.newCardHeader().setTitle('Hujjat').setSubtitle('Hujjat holati')
    )
    .addSection(section)
    .addSection(action)
    .build();
}

/* =========================================================
   DRIVE SELECTION TRIGGER
   ========================================================= */

function onDriveItemsSelected(e) {
  var items = (e && e.drive && e.drive.selectedItems) || [];

  if (items.length === 0) return onHomePage(e);

  if (items.length > 1) {
    return simpleCard_(
      'VivaMed Hujjat',
      'Bir vaqtda faqat <b>bitta</b> hujjat tanlang.'
    );
  }

  return buildDocumentCard_(items[0].id);
}

/* =========================================================
   SETTINGS CARD
   ========================================================= */

function showSettingsCard() {
  var props = PropertiesService.getScriptProperties();
  var sheetsId = props.getProperty('SHEETS_ID') || '';

  var main = CardService.newCardSection()
    .addWidget(
      CardService.newTextParagraph().setText(
        'Reyestr jadvali ID\'si Script Properties ichida saqlanadi. ' +
        'Qolgan sozlamalar <b>Sozlamalar</b> varag\'idan o\'qiladi.'
      )
    )
    .addWidget(
      CardService.newTextInput()
        .setFieldName('sheetsId')
        .setTitle('SHEETS_ID')
        .setValue(sheetsId)
    )
    .addWidget(
      CardService.newTextButton()
        .setText('Saqlash va tekshirish')
        .setTextButtonStyle(CardService.TextButtonStyle.FILLED)
        .setOnClickAction(
          CardService.newAction().setFunctionName('saveSettings')
        )
    );

  var extra = CardService.newCardSection().setHeader('Kerakli sozlamalar');

  extra.addWidget(
    CardService.newTextParagraph().setText(
      '<b>Sozlamalar</b> varag\'ida:<br>' +
      '• PUBLIC_VERIFY_BASE_URL<br>' +
      '• FOLDER_PENDING<br>' +
      '• FOLDER_APPROVED<br>' +
      '• FOLDER_ARCHIVE'
    )
  );

  if (sheetsId) {
    extra.addWidget(
      CardService.newTextButton()
        .setText('Sozlamalar varag\'ini ochish')
        .setOpenLink(
          CardService.newOpenLink().setUrl(
            'https://docs.google.com/spreadsheets/d/' + sheetsId + '/edit'
          )
        )
    );
  }

  return CardService.newCardBuilder()
    .setHeader(CardService.newCardHeader().setTitle('Sozlamalar'))
    .addSection(main)
    .addSection(extra)
    .build();
}

function saveSettings(e) {
  var id = getInput_(e.commonEventObject.formInputs, 'sheetsId');

  if (!id) return notify_('SHEETS_ID bo\'sh.');

  var match = /\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/.exec(id);

  if (match) id = match[1];

  Config.setSheetsId(id);

  var d;

  try {
    d = Config.diagnose();
  } catch (err) {
    return notify_('Xato: ' + err.message);
  }

  return CardService.newActionResponseBuilder()
    .setNavigation(CardService.newNavigation().updateCard(onHomePage({})))
    .setNotification(
      CardService.newNotification().setText(
        d.problems.length
          ? 'Saqlandi, lekin: ' + d.problems[0]
          : 'Sozlamalar to\'g\'ri.'
      )
    )
    .build();
}

/* =========================================================
   APPROVE
   ========================================================= */

function handleApprove(e) {
  var params = e.commonEventObject.parameters;

  var placement =
    getInput_(e.commonEventObject.formInputs, 'placement') || 'last';

  try {
    var result = approveDocument_(params.fileId, params.fileName, placement);

    return CardService.newActionResponseBuilder()
      .setNavigation(
        CardService.newNavigation().pushCard(buildResultCard_(result))
      )
      .setNotification(
        CardService.newNotification().setText('Tasdiqlandi: ' + result.docNo)
      )
      .build();
  } catch (err) {
    return notify_('Xato: ' + (err && err.message ? err.message : err));
  }
}

/* =========================================================
   REJECT / REVOKE ROUTER
   =========================================================
 *
 * One button, two situations:
 *
 *   1) The file id is not in the registry — it is still pending.
 *      → plain rejection → move to the archive
 *
 *   2) The file id is in the registry and ACTIVE — it is an issued
 *      document. → ask for a reason → revocation flow
 */

function handleReject(e) {
  var fileId = e.commonEventObject.parameters.fileId;

  try {
    var rec = findRegistryByFileId_(fileId);

    if (rec && rec.status === 'ACTIVE') {
      return CardService.newActionResponseBuilder()
        .setNavigation(
          CardService.newNavigation().pushCard(
            buildRevokeDocumentCard_(rec.docNo, rec.fileName)
          )
        )
        .build();
    }

    if (rec && rec.status === 'REVOKED') {
      return notify_('Bu hujjat allaqachon bekor qilingan.');
    }

    var archiveId = Config.get('FOLDER_ARCHIVE', '');

    if (!archiveId) throw new Error('FOLDER_ARCHIVE sozlanmagan.');

    var file = DriveApp.getFileById(fileId);

    if (file.getName().indexOf('RAD ETILGAN') !== 0) {
      file.setName('RAD ETILGAN — ' + file.getName());
    }

    moveFile_(file, archiveId);

    return CardService.newActionResponseBuilder()
      .setNavigation(
        CardService.newNavigation().popToRoot().updateCard(onHomePage({}))
      )
      .setNotification(
        CardService.newNotification()
          .setText('Rad etildi va arxivga ko\'chirildi.')
      )
      .build();
  } catch (err) {
    return notify_('Xato: ' + (err && err.message ? err.message : err));
  }
}

/* =========================================================
   REGISTRY LOOKUP BY FILE ID
   ========================================================= */

function findRegistryByFileId_(fileId) {
  var sh = Config.spreadsheet().getSheetByName(REGISTRY_SHEET);

  if (!sh) throw new Error('Reyestr varag\'i topilmadi.');

  var lastRow = sh.getLastRow();

  if (lastRow < 2) return null;

  var values = sh.getRange(2, 1, lastRow - 1, 16).getValues();
  var needle = String(fileId || '').trim();

  for (var i = values.length - 1; i >= 0; i--) {
    var storedFileId = String(values[i][2] || '').trim();

    if (storedFileId !== needle) continue;

    var status = String(values[i][11] || '').trim().toUpperCase();

    if (!status) status = 'ACTIVE';

    return {
      docNo: String(values[i][0] || '').trim(),
      fileName: String(values[i][1] || '').trim(),
      fileId: storedFileId,
      status: status
    };
  }

  return null;
}

/* =========================================================
   RESULT CARD
   ========================================================= */

function buildResultCard_(r) {
  var clinic = Config.get('CLINIC_NAME', DEFAULT_CLINIC);

  var section = CardService.newCardSection()
    .addWidget(
      CardService.newKeyValue()
        .setTopLabel('Hujjat raqami')
        .setContent(r.docNo)
    )
    .addWidget(
      CardService.newKeyValue()
        .setTopLabel('Fayl')
        .setContent(r.newName)
        .setMultiline(true)
    )
    .addWidget(
      CardService.newTextButton()
        .setText('Drive\'da ochish')
        .setOpenLink(CardService.newOpenLink().setUrl(r.fileUrl))
    )
    .addWidget(
      CardService.newTextButton()
        .setText('Tekshirish sahifasi')
        .setOpenLink(CardService.newOpenLink().setUrl(r.verifyUrl))
    );

  var mail = CardService.newCardSection()
    .setHeader('Gmail orqali jo\'natish')
    .addWidget(
      CardService.newTextInput()
        .setFieldName('to')
        .setTitle('Qabul qiluvchi email')
    )
    .addWidget(
      CardService.newTextInput()
        .setFieldName('subject')
        .setTitle('Mavzu')
        .setValue(clinic + ' — hujjat ' + r.docNo)
    )
    .addWidget(
      CardService.newTextInput()
        .setFieldName('body')
        .setTitle('Xat matni')
        .setMultiline(true)
        .setValue(
          'Assalomu alaykum!\n\n' +
          'Hujjatingiz ilova qilindi.\n' +
          'Hujjat raqami: ' + r.docNo + '\n' +
          'Haqiqiyligini tekshirish: ' + r.verifyUrl + '\n\n' +
          'Hurmat bilan,\n' + clinic
        )
    )
    .addWidget(
      CardService.newTextButton()
        .setText('Jo\'natish')
        .setTextButtonStyle(CardService.TextButtonStyle.FILLED)
        .setOnClickAction(
          CardService.newAction()
            .setFunctionName('handleSendMail')
            .setParameters({ fileId: r.newFileId, docNo: r.docNo })
        )
    );

  var back = CardService.newCardSection().addWidget(
    CardService.newTextButton()
      .setText('Ro\'yxatga qaytish')
      .setOnClickAction(CardService.newAction().setFunctionName('backToHome'))
  );

  return CardService.newCardBuilder()
    .setHeader(
      CardService.newCardHeader().setTitle('Tasdiqlandi').setSubtitle(r.docNo)
    )
    .addSection(section)
    .addSection(mail)
    .addSection(back)
    .build();
}

function backToHome() {
  return CardService.newActionResponseBuilder()
    .setNavigation(
      CardService.newNavigation().popToRoot().updateCard(onHomePage({}))
    )
    .build();
}

/* =========================================================
   EMAIL
   ========================================================= */

function handleSendMail(e) {
  var params = e.commonEventObject.parameters;
  var form = e.commonEventObject.formInputs;

  var to = getInput_(form, 'to');

  if (!to) return notify_('Email manzilini kiriting.');

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
    return notify_('Email manzili noto\'g\'ri.');
  }

  try {
    var clinic = Config.get('CLINIC_NAME', DEFAULT_CLINIC);
    var file = DriveApp.getFileById(params.fileId);

    GmailApp.sendEmail(
      to,
      getInput_(form, 'subject') || (clinic + ' — ' + params.docNo),
      getInput_(form, 'body') || '',
      { attachments: [file.getBlob()], name: clinic }
    );

    Registry.markSent(params.docNo, to);

    return notify_('Jo\'natildi: ' + to);
  } catch (err) {
    return notify_('Jo\'natishda xato: ' + err.message);
  }
}

/* =========================================================
   APPROVAL PIPELINE
   =========================================================
 *
 * Everything below happens inside ONE execution — an add-on function
 * must return a Card, so there is no way to split it or show progress.
 *
 * Order matters:
 *   - the number is reserved BEFORE the heavy work (concurrency)
 *   - the registry is filled AFTER the file exists (correctness)
 *   - the source file is archived LAST (recoverability)
 */

function approveDocument_(fileId, fileName, placement) {
  var cfg = Config.all();

  var publicBase = cfg.PUBLIC_VERIFY_BASE_URL;
  var approvedId = cfg.FOLDER_APPROVED;
  var archiveId = cfg.FOLDER_ARCHIVE;
  var clinic = cfg.CLINIC_NAME || DEFAULT_CLINIC;

  if (!publicBase) throw new Error('PUBLIC_VERIFY_BASE_URL bo\'sh.');

  if (!/^https:\/\//i.test(publicBase)) {
    throw new Error('PUBLIC_VERIFY_BASE_URL noto\'g\'ri.');
  }

  publicBase = publicBase.replace(/\/+$/, '');

  if (!approvedId) throw new Error('FOLDER_APPROVED bo\'sh.');
  if (!archiveId) throw new Error('FOLDER_ARCHIVE bo\'sh.');

  var approvedFolder;

  try {
    approvedFolder = DriveApp.getFolderById(approvedId);
  } catch (err) {
    throw new Error('FOLDER_APPROVED papkasi ochilmadi.');
  }

  var src = DriveApp.getFileById(fileId);
  var kind = fileKind_(src.getMimeType());

  if (!kind.ok) {
    throw new Error('Bu fayl turi qo\'llab-quvvatlanmaydi.');
  }

  /* NOTE: getOwner() returns null for Shared Drive files — those belong
   * to the organisation, not a person — so this column can end up blank. */
  var uploadedBy = '';

  try {
    var owner = src.getOwner();
    uploadedBy = owner ? owner.getEmail() : '';
  } catch (e) {
    uploadedBy = '';
  }

  var approvedBy = '';

  try {
    approvedBy = Session.getActiveUser().getEmail();
  } catch (e) {
    approvedBy = '';
  }

  if (!approvedBy) {
    try {
      approvedBy = Session.getEffectiveUser().getEmail();
    } catch (e) {
      approvedBy = '';
    }
  }

  var reserved = Registry.reserve();
  var docNo = reserved.docNo;

  var tempIds = [];
  var newFile = null;
  var registryFilled = false;

  try {
    /* The permanent verification URL that goes inside the QR. */
    var verifyUrl =
      publicBase +
      '/v/' + encodeURIComponent(docNo) +
      '?t=' + encodeURIComponent(reserved.token);

    var bytes = getPdfBytes_(src, tempIds);
    var qrPng = makeQrPng_(verifyUrl);

    var stamped = PdfStamp.stamp(bytes, qrPng, docNo, placement, clinic);

    var baseName = fileName.replace(
      /\.(pdf|docx?|xlsx?|pptx?|rtf|txt|csv|od[tsp])$/i, ''
    );

    var newName = baseName + ' — ' + docNo + '.pdf';

    var finalBytes = toByteArray_(stamped);
    var fileSha256 = sha256Hex_(finalBytes);

    var blob = Utilities.newBlob(finalBytes, MIME_PDF, newName);

    /* No setSharing() call: the approved PDF stays Restricted. The
     * Worker reads it through a read-only Service Account instead. */
    newFile = approvedFolder.createFile(blob);

    Registry.fill(reserved.row, {
      fileName: newName,
      fileId: newFile.getId(),
      sourceId: fileId,
      uploadedBy: uploadedBy,
      approvedBy: approvedBy,
      verifyUrl: verifyUrl,
      fileSha256: fileSha256
    });

    registryFilled = true;

    /* KNOWN ISSUE: if this move fails the source file stays in the
     * pending folder, so the manager may approve it again tomorrow and
     * the same document gets two numbers and two QR codes. Guarding on
     * the source file id (registry column D) is the fix. */
    try {
      moveFile_(src, archiveId);
    } catch (moveErr) {
      console.error(
        'Manba faylni arxivga ko\'chirishda xato: ' + moveErr.message
      );
    }

    return {
      docNo: docNo,
      newName: newName,
      newFileId: newFile.getId(),
      fileUrl: newFile.getUrl(),
      verifyUrl: verifyUrl
    };

  } catch (err) {
    /* If the registry was never filled, the PDF is an orphan. */
    if (newFile && !registryFilled) {
      try {
        newFile.setTrashed(true);
      } catch (cleanupErr) {
        // the original error takes priority
      }
    }

    Registry.markFailed(reserved.row, err.message || err);

    throw err;

  } finally {
    /* Temporary Google copies must never survive an interrupted run. */
    cleanupTemp_(tempIds);
  }
}

/* =========================================================
   DRIVE HELPERS
   ========================================================= */

function moveFile_(file, targetFolderId) {
  var target = DriveApp.getFolderById(targetFolderId);
  file.moveTo(target);
}

/**
 * Any supported document becomes PDF bytes, by one of three paths.
 * The source file itself is never modified — the original is evidence.
 */
function getPdfBytes_(file, tempIds) {
  var mime = file.getMimeType();

  if (mime === MIME_PDF) {
    return new Uint8Array(file.getBlob().getBytes());
  }

  if (GOOGLE_NATIVE[mime]) {
    return new Uint8Array(file.getAs(MIME_PDF).getBytes());
  }

  var rule = CONVERTIBLE[mime];

  if (!rule) {
    throw new Error('Qo\'llab-quvvatlanmaydigan fayl turi: ' + mime);
  }

  var copy;

  try {
    copy = Drive.Files.copy(
      {
        name: '[vaqtinchalik] ' + file.getName(),
        mimeType: rule.to
      },
      file.getId(),
      { supportsAllDrives: true }
    );
  } catch (err) {
    throw new Error(
      'Hujjatni PDF\'ga o\'girib bo\'lmadi (' + rule.label + '): ' + err.message
    );
  }

  tempIds.push(copy.id);

  Utilities.sleep(300);

  return new Uint8Array(
    DriveApp.getFileById(copy.id).getAs(MIME_PDF).getBytes()
  );
}

function cleanupTemp_(ids) {
  (ids || []).forEach(function (id) {
    try {
      DriveApp.getFileById(id).setTrashed(true);
    } catch (e) {
      // not critical
    }
  });
}

/* =========================================================
   QR
   ========================================================= */

function makeQrPng_(text) {
  var url =
    'https://api.qrserver.com/v1/create-qr-code/' +
    '?size=600x600&margin=0&ecc=M&data=' +
    encodeURIComponent(text);

  var response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });

  if (response.getResponseCode() !== 200) {
    throw new Error('QR-kod yaratilmadi.');
  }

  return new Uint8Array(response.getBlob().getBytes());
}

/* =========================================================
   BASIC HELPERS
   ========================================================= */

function simpleCard_(title, html) {
  return CardService.newCardBuilder()
    .setHeader(CardService.newCardHeader().setTitle(title))
    .addSection(
      CardService.newCardSection().addWidget(
        CardService.newTextParagraph().setText(html)
      )
    )
    .build();
}

function getInput_(formInputs, name) {
  if (!formInputs || !formInputs[name]) return '';

  var value = formInputs[name];

  if (
    value.stringInputs &&
    value.stringInputs.value &&
    value.stringInputs.value.length
  ) {
    return String(value.stringInputs.value[0]).trim();
  }

  return '';
}

/**
 * pdf-lib returns a Uint8Array (0..255); Apps Script blobs want signed
 * bytes (-128..127). Skip this and the PDF is silently corrupted — no
 * exception, the file simply will not open.
 */
function toByteArray_(u8) {
  var out = [];

  for (var i = 0; i < u8.length; i++) {
    out.push(u8[i] > 127 ? u8[i] - 256 : u8[i]);
  }

  return out;
}

function sha256Hex_(bytes) {
  var digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256, bytes
  );

  return digest
    .map(function (b) {
      var value = b < 0 ? b + 256 : b;
      return ('0' + value.toString(16)).slice(-2);
    })
    .join('');
}

function notify_(text) {
  return CardService.newActionResponseBuilder()
    .setNotification(CardService.newNotification().setText(text))
    .build();
}

/* =========================================================
   APPROVED DOCUMENTS LIST
   ========================================================= */

function showApprovedDocuments() {
  var sh = Config.spreadsheet().getSheetByName(REGISTRY_SHEET);

  if (!sh) return simpleCard_('Xato', 'Reyestr varag\'i topilmadi.');

  var last = sh.getLastRow();

  var card = CardService.newCardBuilder().setHeader(
    CardService.newCardHeader()
      .setTitle('Tasdiqlangan hujjatlar')
      .setSubtitle('ACTIVE hujjatlar')
  );

  var section = CardService.newCardSection();

  if (last < 2) {
    section.addWidget(
      CardService.newTextParagraph().setText('Tasdiqlangan hujjat yo\'q.')
    );

    card.addSection(section);

    return card.build();
  }

  var values = sh.getRange(2, 1, last - 1, 16).getValues();
  var count = 0;

  for (var i = values.length - 1; i >= 0; i--) {
    var docNo = String(values[i][0] || '').trim();
    var fileName = String(values[i][1] || '').trim();

    var status = String(values[i][11] || '').trim().toUpperCase();

    if (!status) status = 'ACTIVE';

    if (!docNo || status !== 'ACTIVE') continue;

    count++;

    section.addWidget(
      CardService.newKeyValue()
        .setTopLabel(docNo)
        .setContent(fileName || 'Hujjat')
        .setMultiline(true)
        .setOnClickAction(
          CardService.newAction()
            .setFunctionName('showRevokeDocument')
            .setParameters({ docNo: docNo, fileName: fileName })
        )
    );

    if (count >= 30) break;
  }

  if (count === 0) {
    section.addWidget(
      CardService.newTextParagraph().setText('ACTIVE hujjat topilmadi.')
    );
  }

  card.addSection(section);

  return card.build();
}

/* =========================================================
   REVOKE CARD
   ========================================================= */

function showRevokeDocument(e) {
  var params = e.commonEventObject.parameters;

  return buildRevokeDocumentCard_(
    params.docNo || '',
    params.fileName || ''
  );
}

/**
 * Shared by both entry points: the approved-documents list, and
 * "Rad etish" on an already-approved PDF selected in Drive.
 */
function buildRevokeDocumentCard_(docNo, fileName) {
  docNo = String(docNo || '').trim();
  fileName = String(fileName || '').trim();

  var info = CardService.newCardSection()
    .addWidget(
      CardService.newKeyValue()
        .setTopLabel('Hujjat raqami')
        .setContent(docNo)
    )
    .addWidget(
      CardService.newKeyValue()
        .setTopLabel('Hujjat')
        .setContent(fileName || '—')
        .setMultiline(true)
    );

  var action = CardService.newCardSection()
    .setHeader('Bekor qilish')
    .addWidget(
      CardService.newTextParagraph().setText(
        '<font color="#A32020"><b>Diqqat:</b> ' +
        'ushbu tasdiqlangan hujjat bekor qilinadi. ' +
        'Shundan keyin QR tekshiruvda ' +
        '<b>Hujjat bekor qilingan</b> holati ko\'rinadi.</font>'
      )
    )
    .addWidget(
      CardService.newTextInput()
        .setFieldName('revokeReason')
        .setTitle('Bekor qilish sababi')
        .setMultiline(true)
    )
    .addWidget(
      CardService.newTextButton()
        .setText('Hujjatni bekor qilish')
        .setTextButtonStyle(CardService.TextButtonStyle.FILLED)
        .setOnClickAction(
          CardService.newAction()
            .setFunctionName('handleRevokeDocument')
            .setParameters({ docNo: docNo })
        )
    );

  return CardService.newCardBuilder()
    .setHeader(
      CardService.newCardHeader()
        .setTitle('Hujjatni bekor qilish')
        .setSubtitle(docNo)
    )
    .addSection(info)
    .addSection(action)
    .build();
}

/* =========================================================
   HANDLE REVOKE
   =========================================================
 *
 * Order is the security property here:
 *
 *   1. resolve the approved PDF's file id
 *   2. Registry.revoke()  → L/N/O/P written, STATUS = REVOKED
 *   3. only then move the PDF to the archive
 *
 * If step 3 fails the document is still REVOKED, so the Worker already
 * refuses to serve it. The reverse order would leave a window where the
 * file has moved but the registry still says ACTIVE.
 */

function handleRevokeDocument(e) {
  var params = e.commonEventObject.parameters;
  var form = e.commonEventObject.formInputs;

  var docNo = String(params.docNo || '').trim();
  var reason = getInput_(form, 'revokeReason');

  if (!docNo) return notify_('Hujjat raqami topilmadi.');
  if (!reason) return notify_('Bekor qilish sababini kiriting.');

  var revokedBy = '';

  try {
    revokedBy = Session.getActiveUser().getEmail();
  } catch (err) {
    revokedBy = '';
  }

  if (!revokedBy) {
    revokedBy = Config.get('SIGNER_NAME', '');
  }

  try {
    var fileId = getApprovedFileIdByDocNo_(docNo);

    Registry.revoke(docNo, reason, revokedBy);

    if (fileId) {
      try {
        var archiveId = Config.get('FOLDER_ARCHIVE', '');

        if (!archiveId) throw new Error('FOLDER_ARCHIVE sozlanmagan.');

        var file = DriveApp.getFileById(fileId);

        if (file.getName().indexOf('BEKOR QILINGAN') !== 0) {
          file.setName('BEKOR QILINGAN — ' + file.getName());
        }

        moveFile_(file, archiveId);
      } catch (archiveError) {
        /* STATUS is already REVOKED, so the Worker serves nothing. */
        console.error(
          'Hujjat REVOKED, lekin PDF Arxivga ko\'chmadi: ' +
          archiveError.message
        );
      }
    } else {
      console.warn('REVOKED qilindi, lekin File ID topilmadi: ' + docNo);
    }

    return CardService.newActionResponseBuilder()
      .setNavigation(
        CardService.newNavigation().popToRoot().pushCard(
          showApprovedDocuments()
        )
      )
      .setNotification(
        CardService.newNotification()
          .setText('Hujjat bekor qilindi: ' + docNo)
      )
      .build();

  } catch (err) {
    return notify_(
      'Bekor qilishda xato: ' + (err && err.message ? err.message : err)
    );
  }
}

function getApprovedFileIdByDocNo_(docNo) {
  var sh = Config.spreadsheet().getSheetByName(REGISTRY_SHEET);

  if (!sh) throw new Error('Reyestr varag\'i topilmadi.');

  var lastRow = sh.getLastRow();

  if (lastRow < 2) return '';

  var values = sh.getRange(2, 1, lastRow - 1, 16).getValues();
  var needle = String(docNo || '').trim();

  for (var i = values.length - 1; i >= 0; i--) {
    if (String(values[i][0] || '').trim() !== needle) continue;

    return String(values[i][2] || '').trim();   // C = approved PDF file id
  }

  return '';
}

/* =========================================================
   ONE-TIME MIGRATION
   =========================================================
 *
 * Removes legacy "anyone with the link" permissions from files in the
 * approved folder. Run once, from the Apps Script editor, after moving
 * verification to the Worker.
 *
 * Production result: 8 files checked, 6 public permissions removed,
 * 0 errors.
 */

function restrictOldApprovedFilesOnce() {
  var approvedFolderId = Config.get('FOLDER_APPROVED', '');

  if (!approvedFolderId) {
    throw new Error('FOLDER_APPROVED sozlanmagan.');
  }

  var folder = DriveApp.getFolderById(approvedFolderId);
  var files = folder.getFiles();

  var checked = 0;
  var changed = 0;
  var errors = 0;

  while (files.hasNext()) {
    var file = files.next();
    checked++;

    try {
      var fileId = file.getId();

      var result = Drive.Permissions.list(fileId, {
        fields: 'permissions(id,type,role)'
      });

      var permissions = result.permissions || [];

      permissions.forEach(function (permission) {
        if (permission.type === 'anyone') {
          Drive.Permissions.remove(fileId, permission.id);
          changed++;
        }
      });

      console.log('OK: ' + file.getName());
    } catch (error) {
      errors++;
      console.error('ERROR: ' + file.getName() + ' | ' + error.message);
    }
  }

  console.log(
    JSON.stringify({
      checked: checked,
      publicPermissionsRemoved: changed,
      errors: errors
    })
  );
}
