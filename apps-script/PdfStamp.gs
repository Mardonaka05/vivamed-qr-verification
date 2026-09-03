/**
 * VivaMed Hujjat — PDF stamping.
 *
 * Draws the QR code, its caption, the document number and the signature
 * line onto the PDF bytes. Technically the hardest file in the project:
 * it sits on top of four workarounds, documented inline below.
 *
 * Layout:
 *
 *   Rahbar: <SIGNER_NAME>   [QR]
 *                           QR orqali tekshirish
 *                           VM-PDF-YYYY-NNNNNN
 */

/**
 * Workaround 3 — Apps Script has no setTimeout; pdf-lib uses it.
 */
function setTimeout(func, delay) {
  Utilities.sleep(delay || 0);
  return func();
}

/* Pinned on purpose: the library is executed through eval, so "latest"
 * would mean an upstream change could break issuance without warning. */
var PDFLIB_URL = 'https://unpkg.com/pdf-lib@1.17.1/dist/pdf-lib.min.js';

/* =========================================================
   Workaround 1 — SyncPromise
   =========================================================

   Apps Script is synchronous; pdf-lib is Promise-based. By spec, .then
   callbacks go to the microtask queue and run AFTER the current function
   returns:

       var out = null;
       pdf.save().then(function (s) { out = s; });
       if (!out) throw new Error(...);   // out is still null here

   Normally you would use async/await — but an add-on function must
   return a Card, not a Promise, so handleApprove cannot be async.

   So we replace the global Promise with one that resolves inline while
   the library loads, then restore the native implementation.

   This works because pdf-lib never actually waits — it only computes.
   With real network or file I/O the approach would fail. It is specific
   to this library, not a general pattern.
   ========================================================= */

function SyncPromise(executor) {
  var self = this;

  self._state = 'pending';
  self._value = undefined;

  function resolve(v) {
    if (self._state !== 'pending') return;

    if (v && typeof v.then === 'function') {
      v.then(resolve, reject);
      return;
    }

    self._state = 'fulfilled';
    self._value = v;
  }

  function reject(e) {
    if (self._state !== 'pending') return;

    self._state = 'rejected';
    self._value = e;
  }

  try {
    executor(resolve, reject);
  } catch (err) {
    reject(err);
  }
}

SyncPromise.prototype.then = function (onFulfilled, onRejected) {
  var self = this;

  return new SyncPromise(function (resolve, reject) {
    if (self._state === 'fulfilled') {
      if (typeof onFulfilled === 'function') {
        try {
          resolve(onFulfilled(self._value));   // immediately, no deferral
        } catch (e) {
          reject(e);
        }
      } else {
        resolve(self._value);
      }
    } else if (self._state === 'rejected') {
      if (typeof onRejected === 'function') {
        try {
          resolve(onRejected(self._value));
        } catch (e) {
          reject(e);
        }
      } else {
        reject(self._value);
      }
    } else {
      reject(new Error('SyncPromise: natija tayyor emas.'));
    }
  });
};

SyncPromise.prototype['catch'] = function (onRejected) {
  return this.then(null, onRejected);
};

SyncPromise.prototype['finally'] = function (fn) {
  return this.then(
    function (v) { fn(); return v; },
    function (e) { fn(); throw e; }
  );
};

SyncPromise.resolve = function (v) {
  if (v instanceof SyncPromise) return v;

  return new SyncPromise(function (res) { res(v); });
};

SyncPromise.reject = function (e) {
  return new SyncPromise(function (_res, rej) { rej(e); });
};

SyncPromise.all = function (items) {
  return new SyncPromise(function (resolve, reject) {
    var out = [];

    try {
      for (var i = 0; i < items.length; i++) {
        var item = items[i];

        if (item && typeof item.then === 'function') {
          var captured;
          var failed = null;

          item.then(
            function (v) { captured = v; },
            function (e) { failed = e; }
          );

          if (failed) {
            reject(failed);
            return;
          }

          out.push(captured);
        } else {
          out.push(item);
        }
      }

      resolve(out);
    } catch (err) {
      reject(err);
    }
  });
};

SyncPromise.race = function (items) {
  return SyncPromise.all(items).then(function (arr) { return arr[0]; });
};

/* =========================================================
   pdf-lib loader
   ========================================================= */

function loadPdfLib_() {
  if (typeof globalThis.PDFLib !== 'undefined') {
    return globalThis.PDFLib;
  }

  var response = UrlFetchApp.fetch(PDFLIB_URL);
  var src = response.getContentText();

  var nativePromise = globalThis.Promise;
  globalThis.Promise = SyncPromise;

  try {
    eval(src);
  } finally {
    globalThis.Promise = nativePromise;
  }

  if (typeof globalThis.PDFLib === 'undefined') {
    throw new Error('pdf-lib yuklanmadi.');
  }

  return globalThis.PDFLib;
}

/* =========================================================
   PDF STAMP
   ========================================================= */

var PdfStamp = (function () {

  function stamp(bytes, qrPng, docNo, placement, clinic) {
    var L = loadPdfLib_();

    var nativePromise = globalThis.Promise;
    globalThis.Promise = SyncPromise;

    var out = null;
    var failure = null;

    try {
      L.PDFDocument
        .load(bytes, {
          ignoreEncryption: true,
          parseSpeed: L.ParseSpeeds.Fastest
        })
        .then(function (pdf) {
          return pdf.embedPng(qrPng).then(function (qr) {
            return pdf
              .embedFont(L.StandardFonts.Helvetica)
              .then(function (font) {
                return pdf
                  .embedFont(L.StandardFonts.HelveticaBold)
                  .then(function (bold) {
                    var pages = pdf.getPages();

                    var targets =
                      placement === 'all'
                        ? pages
                        : [pages[pages.length - 1]];

                    targets.forEach(function (page) {
                      drawStamp_(L, page, qr, font, bold, docNo);
                    });

                    pdf.setSubject(docNo);
                    pdf.setProducer(clinic);

                    return pdf.save({ objectsPerTick: Infinity });
                  });
              });
          });
        })
        .then(function (saved) {
          out = saved;
        })
        ['catch'](function (err) {
          failure = err;
        });

    } finally {
      globalThis.Promise = nativePromise;
    }

    if (failure) {
      throw new Error('PDF ishlovi: ' + (failure.message || failure));
    }

    if (!out) {
      throw new Error('PDF ishlovi natija qaytarmadi.');
    }

    return out;
  }

  /**
   * Workaround 4 — coordinates.
   *
   * In PDF the origin is the BOTTOM-LEFT corner and y grows upward,
   * the opposite of the browser.
   */
  function drawStamp_(L, page, qr, font, bold, docNo) {
    var W = page.getSize().width;

    var qrSize = num_('QR_SIZE', 80);
    var qrX = num_('QR_X', 0);

    /* NOTE: with the built-in fallback of 330 on A4 this puts the QR at
     * the bottom CENTRE (595 - 80 - 330 = 185pt), not the bottom right.
     * Set QR_MARGIN_RIGHT in the settings sheet to control it. */
    var marginR = num_('QR_MARGIN_RIGHT', 330);

    var qrY = num_('QR_BOTTOM', 100);
    var gap = num_('QR_GAP', 26);

    if (!qrX) {
      qrX = W - qrSize - marginR;
    }

    page.drawImage(qr, { x: qrX, y: qrY, width: qrSize, height: qrSize });

    var caption = txt_('QR_CAPTION', 'QR orqali tekshirish');
    var capSize = 6.5;

    page.drawText(caption, {
      x: qrX + (qrSize - font.widthOfTextAtSize(caption, capSize)) / 2,
      y: qrY - 10,
      size: capSize,
      font: font,
      color: L.rgb(0.45, 0.45, 0.45)
    });

    var label = txt_('SIGNER_LABEL', 'Rahbar:');

    /* No hard-coded fallback: an unset SIGNER_NAME must leave the
     * signature line off the document rather than print a stale name. */
    var name = txt_('SIGNER_NAME', '');

    if (name) {
      var fs = num_('SIGNER_SIZE', 10);
      var line = label ? label + ' ' + name : name;
      var lineW = bold.widthOfTextAtSize(line, fs);

      page.drawText(line, {
        x: qrX - gap - lineW,
        y: qrY + (qrSize - fs) / 2,
        size: fs,
        font: bold,
        color: L.rgb(0.08, 0.08, 0.08)
      });
    }

    if (bool_('SHOW_DOC_NO', true)) {
      var ns = 6;

      page.drawText(docNo, {
        x: qrX + (qrSize - font.widthOfTextAtSize(docNo, ns)) / 2,
        y: qrY - 19,
        size: ns,
        font: font,
        color: L.rgb(0.62, 0.62, 0.62)
      });
    }
  }

  function txt_(key, fallback) {
    try {
      var v = Config.get(key, '');
      return v ? asciiSafe_(v) : asciiSafe_(fallback);
    } catch (e) {
      return asciiSafe_(fallback);
    }
  }

  function num_(key, fallback) {
    try {
      var v = parseFloat(Config.get(key, ''));
      return isNaN(v) ? fallback : v;
    } catch (e) {
      return fallback;
    }
  }

  function bool_(key, fallback) {
    try {
      var v = String(Config.get(key, '')).toLowerCase();

      if (v === 'ha' || v === 'true' || v === '1') return true;

      if (v === 'yo\'q' || v === 'yoq' || v === 'false' || v === '0') {
        return false;
      }

      return fallback;
    } catch (e) {
      return fallback;
    }
  }

  /**
   * Standard Helvetica knows neither Cyrillic nor the Uzbek apostrophe,
   * so unknown characters are stripped. Consequence: Uzbek and Russian
   * text cannot be drawn onto the document. The fix is to upload a TTF
   * to Drive and register pdf-lib's fontkit extension.
   */
  function asciiSafe_(s) {
    return String(s || '')
      .replace(/[\u2018\u2019\u02BB\u02BC]/g, "'")
      .replace(/[\u201C\u201D]/g, '"')
      .replace(/[^\x20-\x7E]/g, '');
  }

  return { stamp: stamp };

})();
