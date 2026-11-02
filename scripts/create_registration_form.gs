// Creates the Google Form behind the site's Day 1 registration page
// (register.html). Generated from content/register.yaml; see
// docs/REGISTRATION.md.
//
// 1. Go to https://script.google.com while signed in to your UW account,
//    click New project, paste this file over the sample code, and save.
// 2. Choose createRegistrationForm in the toolbar and click Run. Approve the
//    permission prompts.
// 3. Open View → Logs (or Execution log). Copy the "Share link" and send it
//    to the site maintainer.

const QUESTIONS = [
  {
    "title": "Full name",
    "type": "text",
    "options": null,
    "help": null
  },
  {
    "title": "Affiliation or organization",
    "type": "text",
    "options": null,
    "help": null
  },
  {
    "title": "Role or title",
    "type": "text",
    "options": null,
    "help": null
  },
  {
    "title": "Sector",
    "type": "list",
    "options": [
      "Academic",
      "Government",
      "Tribal nation",
      "Industry",
      "Nonprofit",
      "Student",
      "Other"
    ],
    "help": null
  },
  {
    "title": "What is your interest in digital twins, and what would you like to take away from Day 1?",
    "type": "paragraph",
    "options": null,
    "help": null
  },
  {
    "title": "Which parts of the Urban Sea System interest you most?",
    "type": "checkbox",
    "options": [
      "Hydrodynamics and circulation",
      "Weather and climate",
      "Watersheds and runoff",
      "Pollution of air and water",
      "Ports and supply chains",
      "Hazards, natural and human-generated",
      "Ecological systems"
    ],
    "help": "Choose any."
  },
  {
    "title": "Dietary needs",
    "type": "paragraph",
    "options": null,
    "help": "For coffee and breaks."
  },
  {
    "title": "Accessibility needs",
    "type": "paragraph",
    "options": null,
    "help": null
  },
  {
    "title": "Day 1 plenary sessions will be recorded. Do you consent to appearing in the recording?",
    "type": "choice",
    "options": [
      "Yes",
      "No"
    ],
    "help": null
  },
  {
    "title": "May we list your name and affiliation as a participant?",
    "type": "choice",
    "options": [
      "Yes",
      "No"
    ],
    "help": null
  },
  {
    "title": "Anything else we should know?",
    "type": "paragraph",
    "options": null,
    "help": null
  }
];

function createRegistrationForm() {
  const form = FormApp.create('CADT 2026 Day 1 registration');
  form.setDescription('Responses arrive from the registration page on the CADT Workshop 2026 website.');
  // The form's own email field (Responder input) replaces an Email question.
  // Then turn on Settings → Responses → Send responders a copy: Always.
  form.setCollectEmail(true);
  try { form.setEmailCollectionType(FormApp.EmailCollectionType.RESPONDER_INPUT); } catch (e) { console.log('Set Collect email addresses to "Responder input" by hand in Settings.'); }
  form.setLimitOneResponsePerUser(false);
  form.setAllowResponseEdits(false);
  try { form.setRequireLogin(false); } catch (e) { console.log('Turn off "Restrict to users in University of Washington" by hand in Settings.'); }

  QUESTIONS.forEach(function (q) {
    let item;
    if (q.type === 'text') item = form.addTextItem();
    else if (q.type === 'paragraph') item = form.addParagraphTextItem();
    else if (q.type === 'list') item = form.addListItem().setChoiceValues(q.options);
    else if (q.type === 'choice') item = form.addMultipleChoiceItem().setChoiceValues(q.options);
    else if (q.type === 'checkbox') item = form.addCheckboxItem().setChoiceValues(q.options);
    item.setTitle(q.title).setRequired(false);
    if (q.help) item.setHelpText(q.help);
  });

  const sheet = SpreadsheetApp.create('CADT 2026 Day 1 registrations');
  form.setDestination(FormApp.DestinationType.SPREADSHEET, sheet.getId());

  console.log('Share link: ' + form.getPublishedUrl());
  console.log('Edit the form: ' + form.getEditUrl());
  console.log('Responses sheet: ' + sheet.getUrl());
}
