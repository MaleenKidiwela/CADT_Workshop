// Emails each Day 1 registrant a short confirmation when their registration
// reaches the Google Form. See docs/REGISTRATION.md.
//
// 1. Open the form in edit mode → ⋮ (top right) → Script editor (or
//    Extensions → Apps Script).
// 2. Paste this file over the sample code and save.
// 3. Choose installTrigger in the toolbar and click Run once. Approve the
//    permission prompts. From then on, every new registration gets an email.
// Emails are sent from the account that ran installTrigger. Running
// installTrigger again does not add a second trigger.

const REPLY_TO = 'mdenolle@uw.edu';
const SENDER_NAME = 'CADT Workshop 2026';
const SUBJECT = 'CADT Workshop 2026: you are registered for Day 1';

function installTrigger() {
  const form = FormApp.getActiveForm();
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'onRegistration') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('onRegistration').forForm(form).onFormSubmit().create();
  console.log('Confirmation emails are on for: ' + form.getTitle());
}

function onRegistration(e) {
  const answers = {};
  e.response.getItemResponses().forEach(function (r) {
    answers[r.getItem().getTitle()] = r.getResponse();
  });
  const email = String(answers['Email'] || '').trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return;
  const name = String(answers['Full name'] || '').trim();

  const body = [
    'Dear ' + (name || 'participant') + ',',
    '',
    'Thank you for registering for Day 1 of Complex Adaptive Digital Twins for Urban Sea Systems.',
    '',
    'Tuesday 15 December 2026',
    'Registration and coffee from 08:15; the program runs until about 17:30.',
    'Center for Urban Horticulture, University of Washington',
    '3501 NE 41st Street, Seattle, WA 98105',
    '',
    'Room details will be sent to registered participants before the workshop.',
    'Program and travel: https://maleenkidiwela.github.io/CADT_Workshop/',
    '',
    'If your plans change, reply to this email.',
    '',
    'CADT Workshop 2026 organizers',
  ].join('\n');

  MailApp.sendEmail({ to: email, subject: SUBJECT, body: body, name: SENDER_NAME, replyTo: REPLY_TO });
}
