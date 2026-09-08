# Agent instructions

Read `CLAUDE.md` first; it is the source of truth for this repository. The
essentials:

- Edit content in `content/*.yaml` and `content/pages/*.md`. Never edit
  `_site/`.
- Run `pixi run check` before committing. It must pass.
- Do not invent facts. Unknown → "to be announced" or `published: false`.
- `materials/` is private and git-ignored. Never commit it or quote from it.
- Plain voice, short sentences, no hype words, no em dashes.
- Relative links only.

Commands: `pixi run build`, `pixi run serve`, `pixi run check`,
`pixi run figures`. Python runs through pixi only.
