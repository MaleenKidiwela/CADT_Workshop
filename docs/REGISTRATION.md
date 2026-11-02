# Day 1 registration

`register.html` is built from `content/register.yaml` and
`templates/register.html`. The form sends each response to a Google Apps
Script web app (`scripts/registration.gs`) that adds a row to a Google Sheet
held by the organizers. Days 2 and 3 are by invitation and have no
registration.

## Set up the Sheet (once, about 10 minutes)

Use a UW Google account that the organizers can share.

1. Create a new Google Sheet, for example "CADT 2026 Day 1 registrations".
2. In the Sheet: **Extensions → Apps Script**. Delete the sample code, paste
   the whole of `scripts/registration.gs`, and save.
3. **Deploy → New deployment**. Type: **Web app**.
   - Execute as: **Me**
   - Who has access: **Anyone**
4. Click **Deploy** and approve the permission prompts. Google warns that the
   app is unverified, because you wrote it: choose **Advanced → Go to
   (project name)**.
5. Copy the **Web app URL** (it ends in `/exec`). Opening it in a browser
   should show `{"ok":true,"open":true}`.
6. Put the URL in `content/register.yaml` → `endpoint`.

The first response creates a **Responses** tab with one column per field.
Share the Sheet with the organizers who need it.

## Open registration on the site

1. `content/register.yaml`: `endpoint` set, `open: true`.
2. `content/site.yaml`: `status: registration`, and `cta.primary` →
   `label: Register for Day 1`, `url: register.html`, `new_window: false`.
3. `content/faq.yaml`: update the "How do I register?" answer.
4. `pixi run check`, then send a test registration and delete its row.

## Close registration

Set `open: false` in `content/register.yaml` (the page then shows
`closed_text`), and set `OPEN = false` in the Apps Script and redeploy, so
the endpoint also refuses late submissions.

## Change the questions

Edit `fields` in `content/register.yaml`. Keep `FIELDS` and `REQUIRED` in
`scripts/registration.gs` the same (`pixi run check` fails if they differ),
paste the script into Apps Script again, and redeploy: **Deploy → Manage
deployments → Edit → Version: New version**. Editing an existing deployment
keeps the same URL. Once responses have arrived, add new fields at the end,
so existing columns keep their meaning.

## Options in the script

- `SEND_CONFIRMATION = true` sends each registrant a short email from the
  account that deployed the script.
- Bots: a hidden field and a minimum time on the page drop most automated
  submissions without storing them.
