// CADT Workshop 2026: Day 1 registration backend (Google Apps Script).
//
// Paste this into Extensions → Apps Script of the Google Sheet that should
// hold the responses, then deploy it as a web app (Execute as: Me; Who has
// access: Anyone). Put the web app URL in content/register.yaml → endpoint.
// Full steps: docs/REGISTRATION.md.
//
// FIELDS must list the `name` of every field in content/register.yaml, in the
// same order; `pixi run check` compares the two.

const FIELDS = ['name', 'email', 'affiliation', 'role', 'sector', 'dietary', 'accessibility', 'recording_consent', 'list_publicly', 'notes'];
const REQUIRED = ['name', 'email', 'affiliation', 'recording_consent', 'list_publicly'];
const SHEET_NAME = 'Responses';

// false: every new submission is refused, and the page shows an error.
const OPEN = true;

// true: send each registrant a short confirmation email from the account that
// deployed the script.
const SEND_CONFIRMATION = false;
const CONFIRMATION_SUBJECT = 'CADT Workshop 2026: you are registered for Day 1';
const CONFIRMATION_BODY =
  'Thank you for registering for Day 1 of Complex Adaptive Digital Twins for Urban Sea Systems, ' +
  'Tuesday 15 December 2026, at the UW Center for Urban Horticulture, 3501 NE 41st Street, Seattle.\n\n' +
  'Room details will be sent to registered participants before the workshop.\n\n' +
  'https://maleenkidiwela.github.io/CADT_Workshop/';

function doPost(e) {
  try {
    if (!OPEN) return reply_({ ok: false, error: 'closed' });
    const data = JSON.parse(e.postData.contents);
    // Bots fill the hidden "website" field or submit within seconds. Tell them
    // it worked and store nothing.
    if (data.website || Number(data.elapsed_ms) < 3000) return reply_({ ok: true });
    for (const k of REQUIRED) {
      if (!String(data[k] || '').trim()) return reply_({ ok: false, error: 'missing ' + k });
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(data.email))) return reply_({ ok: false, error: 'email' });

    const lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      sheet_().appendRow([new Date()].concat(FIELDS.map(function (k) { return clean_(data[k]); })));
    } finally {
      lock.releaseLock();
    }
    if (SEND_CONFIRMATION) {
      MailApp.sendEmail(String(data.email), CONFIRMATION_SUBJECT, 'Dear ' + clean_(data.name) + ',\n\n' + CONFIRMATION_BODY);
    }
    return reply_({ ok: true });
  } catch (err) {
    console.error(err);
    return reply_({ ok: false, error: 'server' });
  }
}

// Opening the web app URL in a browser shows whether it is running.
function doGet() {
  return reply_({ ok: true, open: OPEN });
}

function sheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
    sh.appendRow(['submitted'].concat(FIELDS));
    sh.setFrozenRows(1);
  }
  return sh;
}

// Cap the length, and stop text that starts with = + - @ from running as a
// spreadsheet formula.
function clean_(v) {
  v = String(v == null ? '' : v).trim().slice(0, 2000);
  return /^[=+\-@]/.test(v) ? "'" + v : v;
}

function reply_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
