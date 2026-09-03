/**
 * VivaMed Hujjat — configuration gateway.
 *
 * The single channel to the settings sheet. No other module reads it
 * directly, so caching, error messages and fallbacks live in one place.
 *
 * SHEETS_ID:
 *   Apps Script -> Project Settings -> Script Properties
 *   (it cannot live inside the sheet it identifies)
 *
 * Everything else:
 *   Google Sheets -> "Sozlamalar" (column A = key, column B = value)
 */

var SETTINGS_SHEET = 'Sozlamalar';
var REGISTRY_SHEET = 'Reyestr';

var Config = (function () {

  function sheetsId() {
    var id = PropertiesService.getScriptProperties().getProperty('SHEETS_ID');

    if (!id) {
      throw new Error(
        'SHEETS_ID topilmadi. Project Settings -> Script Properties ni tekshiring.'
      );
    }

    return String(id).trim();
  }

  function setSheetsId(id) {
    PropertiesService
      .getScriptProperties()
      .setProperty('SHEETS_ID', String(id || '').trim());

    CacheService.getScriptCache().remove('cfg');
  }

  function spreadsheet() {
    try {
      return SpreadsheetApp.openById(sheetsId());
    } catch (e) {
      throw new Error(
        'Reyestr jadvali ochilmadi. SHEETS_ID yoki Google ruxsatlarini tekshiring.'
      );
    }
  }

  function settingsSheet() {
    var sh = spreadsheet().getSheetByName(SETTINGS_SHEET);

    if (!sh) {
      throw new Error('Jadvalda "' + SETTINGS_SHEET + '" varag\'i topilmadi.');
    }

    return sh;
  }

  /**
   * Reads the whole settings sheet once and caches it for 60 seconds.
   * Practical consequence: an edit takes up to a minute to take effect.
   */
  function all() {
    var cache = CacheService.getScriptCache();
    var hit = cache.get('cfg');

    if (hit) {
      try {
        return JSON.parse(hit);
      } catch (e) {
        // corrupted cache — fall through and re-read
      }
    }

    var sh = settingsSheet();
    var last = sh.getLastRow();
    var out = {};

    if (last > 0) {
      var rows = sh.getRange(1, 1, last, 2).getValues();

      rows.forEach(function (r) {
        var key = String(r[0] || '').trim();

        if (!key || key === 'KEY') return;

        out[key] = String(
          r[1] === null || r[1] === undefined ? '' : r[1]
        ).trim();
      });
    }

    try {
      cache.put('cfg', JSON.stringify(out), 60);
    } catch (e) {
      // caching is not critical
    }

    return out;
  }

  /**
   * NOTE: the fallback keeps the system running when a key is missing,
   * which is convenient and is also the single largest silent-failure
   * risk in the project. Put every key in the settings sheet.
   */
  function get(key, fallback) {
    var value = all()[key];

    if (value === undefined || value === '') {
      return fallback === undefined ? '' : fallback;
    }

    return value;
  }

  function set(key, value) {
    var sh = settingsSheet();
    var last = sh.getLastRow();

    var rows = last > 0 ? sh.getRange(1, 1, last, 1).getValues() : [];

    for (var i = 0; i < rows.length; i++) {
      if (String(rows[i][0]).trim() === key) {
        sh.getRange(i + 1, 2).setValue(value);
        CacheService.getScriptCache().remove('cfg');
        return;
      }
    }

    sh.appendRow([key, value]);
    CacheService.getScriptCache().remove('cfg');
  }

  /**
   * Validates the whole installation and returns a list of problems,
   * which the add-on renders on its home card. A UX decision: the user
   * sees a specific instruction instead of a vague error.
   */
  function diagnose() {
    var problems = [];
    var info = {};
    var ss;

    try {
      ss = spreadsheet();
      info.jadval = ss.getName();

      if (!ss.getSheetByName(REGISTRY_SHEET)) {
        problems.push('"' + REGISTRY_SHEET + '" varag\'i yo\'q');
      }

      if (!ss.getSheetByName(SETTINGS_SHEET)) {
        problems.push('"' + SETTINGS_SHEET + '" varag\'i yo\'q');
      }
    } catch (e) {
      problems.push(e.message);
      return { problems: problems, info: info };
    }

    var cfg = all();

    if (!cfg.CLINIC_NAME) {
      problems.push('CLINIC_NAME bo\'sh');
    }

    if (!cfg.PUBLIC_VERIFY_BASE_URL) {
      problems.push('PUBLIC_VERIFY_BASE_URL bo\'sh');
    } else if (!/^https:\/\//i.test(cfg.PUBLIC_VERIFY_BASE_URL)) {
      problems.push('PUBLIC_VERIFY_BASE_URL https:// bilan boshlanishi kerak');
    }

    var folders = [
      { key: 'FOLDER_PENDING', label: 'kutilayotgan', prop: 'kutilayotgan' },
      { key: 'FOLDER_APPROVED', label: 'tasdiqlangan', prop: 'tasdiqlangan' },
      { key: 'FOLDER_ARCHIVE', label: 'arxiv', prop: 'arxiv' }
    ];

    folders.forEach(function (f) {
      var id = cfg[f.key];

      if (!id) {
        problems.push(f.key + ' bo\'sh (' + f.label + ' papka)');
        return;
      }

      try {
        info[f.prop] = DriveApp.getFolderById(id).getName();
      } catch (e) {
        problems.push(f.key + ' bo\'yicha papka ochilmadi');
      }
    });

    info.publicUrl = cfg.PUBLIC_VERIFY_BASE_URL || '';

    return { problems: problems, info: info };
  }

  return {
    sheetsId: sheetsId,
    setSheetsId: setSheetsId,
    spreadsheet: spreadsheet,
    all: all,
    get: get,
    set: set,
    diagnose: diagnose
  };

})();
