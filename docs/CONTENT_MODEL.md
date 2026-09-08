# Content model

Every file in `content/` is plain YAML. Strings marked *(md)* accept Markdown
(links, emphasis, lists). Dates are ISO `YYYY-MM-DD`. Any list item that
describes a person, organization, or figure may carry `published: true|false`
(default true) and a free-text `note` for maintainers.

## site.yaml

| Key | Type | Meaning |
| --- | --- | --- |
| `name`, `short_name` | string | Event name, and the short form used in the nav |
| `title` | string | Full title, used in the page title and hero |
| `tagline` | string | One sentence, used in metadata |
| `description` | string | Meta description (about 160 characters) |
| `url` | string | Canonical site URL, must end with `/` |
| `repo` | string | GitHub repository URL |
| `og_image` | path | Social-sharing image, relative to repo root |
| `event.start`, `event.end` | date | Workshop dates |
| `event.dates_confirmed` | bool | `false` shows a "provisional" chip next to the dates |
| `event.dates_note` | string | Tooltip on the provisional chip |
| `event.timezone_label` | string | Shown with the program |
| `event.countdown_iso` | string | ISO datetime with offset; drives the countdown |
| `event.city`, `event.host` | string | Location line |
| `event.format`, `event.attendance` | string | Format line |
| `status` | enum | One of the keys of `status_labels` |
| `status_labels` | map | Label for each status |
| `hero.eyebrow` | string | Small line above the title |
| `hero.heading` | string | Hero title |
| `hero.heading_accent` | string | Substring of `heading` rendered in the accent color |
| `hero.lead` | string (md) | Hero paragraph |
| `hero.figure` | figure id | Figure shown beside the hero text |
| `cta.primary`, `cta.secondary` | object | `label`, `url`, optional `new_window` |
| `nav` | list | `label`, `href` (anchors like `#program` or page files) |
| `contact` | object | `name`, `email`, `note` |
| `footer` | object | `tagline`, `attribution`, `copyright_holder`, `license_note` |

## about.yaml

`kicker`, `heading`, `lead` *(md)*, optional `body` *(md)*, `pillars[]`
(`icon`, `title`, `text`), `stats[]` (`value`, `label`), optional `figure`,
and `prototype` (`kicker`, `heading`, `body` *(md)*, `points[]` with `title`
and `text`, `figure`).

Optional `foundations` (`kicker`, `heading`, `intro`, `items[]` with `name`,
`idea`, `text`, `obligation`, `obligation_text`, and optional `figure`) renders
the "what complex adaptive means" section between About and the prototype.

Icons available: `globe`, `layers`, `twin`, `wave`, `cloud`, `river`,
`factory`, `ship`, `alert`, `sensor`, `users`, `pin`, `calendar`.

## modules.yaml

- `kicker`, `heading`, `intro` *(md)*
- `readiness_scale[]`: labels from least to most ready; its length sets the
  meter size
- `modules[]`: `id`, `number`, `icon`, `name`, optional `subtitle`,
  `summary` *(md)*, `existing[]` (short names of existing models or
  programs), `readiness` (integer within the scale), optional `note` *(md)*
- `architecture`: `kicker`, `heading`, `intro`, `layers[]` (`number`,
  `name`, `text`), optional `figure`
- `partnership`: `kicker`, `heading`, `text` *(md)*

## program.yaml

- `status`: `draft | confirmed | final`
- `status_note`, `timezone_label`, `arc` *(md)*
- `type_labels`: label shown for each session `type`
- `days[]`: `id`, `label`, `theme`, `date`, `summary` *(md)*, `sessions[]`
- session: `time` (string), `title`, optional `type` (`plenary | talk |
  working | session | social | break`, default `session`), optional
  `description` *(md)*, optional `leads[]` (names; matching `team.yaml`
  names become links), optional `resources[]` (`title`, `url`)

## team.yaml

`kicker`, `heading`, `intro` *(md)*, `groups[]` (display order), `people[]`:
`name`, `role`, optional `title`, `affiliation`, `group` (one of `groups`),
optional `photo` (URL or `assets/img/people/...`), optional `bio` *(md)*,
optional `links[]` (`label`, `url`), `published`, `note`.

## partners.yaml

`kicker`, `heading`, optional `intro`, optional `note`, `tiers[]` (display
order), `organizations[]`: `name`, `tier`, optional `url`, optional `logo`
(`assets/img/partners/...`), `published`, `note`.

## venue.yaml

`kicker`, `heading`, `venue` (`name`, `detail`, `address`, `map_url`),
`travel[]` (`title`, `text` *(md)*), optional `notes[]` *(md)*.

## faq.yaml

`kicker`, `heading`, `intro` *(md)*, `audiences[]` (`title`, `text`),
`outputs` (`heading`, `items[]`), `questions[]` (`q`, `a` *(md)*).

## resources.yaml

`kicker`, `heading`, `intro`, `items[]`: `title`, `authors`, `venue`,
optional `url`, optional `kind` (`paper | report | website | draft`),
`summary`.

## figures.yaml

`figures[]`: `id` (referenced elsewhere), `file` (under
`assets/img/figures/`), `alt` (what the image shows, for screen readers),
`caption`, `credit`, optional `gallery` (default true), `published`, `note`.

## pages/*.md

Front matter: `title`, `description`, optional `kicker`, optional `slug`.
The body is Markdown. Output is `<slug>.html`, linked from the footer.
