# Day 1 registration

`register.html` is built from `content/register.yaml` and
`templates/register.html`. The page checks the answers, then posts them into
a Google Form held by the organizers. Responses collect in that form and in
the Sheet linked to it. Days 2 and 3 are by invitation and have no
registration.

Google Forms sends no readable reply to other sites, so the page cannot
confirm that Google stored a response. It shows the thank-you once the
request has gone out. Send a test registration after any change to the form.

## Build the Google Form (once)

Use a UW Google account that the organizers can share.

1. Create a Google Form, for example "CADT 2026 Day 1 registration", with one
   question per field in `content/register.yaml`, in the same order:

   | Question | Google Forms type |
   |---|---|
   | Full name | Short answer |
   | Email | Short answer |
   | Affiliation or organization | Short answer |
   | Role or title | Short answer |
   | Sector | Dropdown: Academic, Government, Tribal nation, Industry, Nonprofit, Student, Other |
   | What is your interest in digital twins, and what would you like to take away from Day 1? | Paragraph |
   | Which parts of the Urban Sea System interest you most? | Checkboxes, one per line: Hydrodynamics and circulation; Weather and climate; Watersheds and runoff; Pollution of air and water; Ports and supply chains; Hazards, natural and human-generated; Ecological systems |
   | Dietary needs | Paragraph |
   | Accessibility needs | Paragraph |
   | Day 1 plenary sessions will be recorded. Do you consent to appearing in the recording? | Multiple choice: Yes, No |
   | May we list your name and affiliation as a participant? | Multiple choice: Yes, No |
   | Anything else we should know? | Paragraph |

   Choice text must match the options in `register.yaml` exactly, including
   capitals.
2. Leave every question **not required** and add no response validation. The
   page enforces required fields. If Google requires a question that the
   page leaves blank, Google drops the whole response without saying so.
3. **Settings → Responses:**
   - Collect email addresses: **Do not collect**.
   - **Restrict to users in University of Washington: off.** UW forms have it
     on by default, and it blocks everyone else.
   - Limit to 1 response: off.
4. **Responses → Link to Sheets**, to keep responses in a Sheet as well.

## Connect it to the page

You need two things from the form: its response address and the entry id of
each question. Either send the form's link to the site maintainer, who can
read both from the public form page, or:

1. **Send → link**, copy it. It looks like
   `https://docs.google.com/forms/d/e/<form id>/viewform`. Replace `viewform`
   with `formResponse` and put it in `content/register.yaml` → `form_action`.
2. Form menu **⋮ → Get pre-filled link**. Type a different answer in each
   question, click **Get link**, and copy it. The link contains
   `entry.<number>=<your answer>` for each question. Put each
   `entry.<number>` in the matching field's `entry` in `register.yaml`.
3. `pixi run check` fails if a field has no entry id or one is malformed.

## Open registration on the site

1. `content/register.yaml`: `form_action` and every `entry` set,
   `open: true`.
2. `content/site.yaml`: `status: registration`, and `cta.primary` →
   `label: Register for Day 1`, `url: register.html`, `new_window: false`.
3. `content/faq.yaml`: update the "How do I register?" answer.
4. `pixi run check`, push, send a test registration on the live page, check
   it arrived in the form, then delete it.

## Close registration

Set `open: false` in `content/register.yaml` (the page then shows
`closed_text`), and turn off **Accepting responses** in the Google Form.

## Change the questions

Change the Google Form and `fields` in `register.yaml` together, then update
the entry ids. A new question gets a new entry id; existing ones keep theirs.

## Spam

A hidden field and a minimum time on the page catch most automated
submissions. The page shows them the thank-you and sends nothing.
