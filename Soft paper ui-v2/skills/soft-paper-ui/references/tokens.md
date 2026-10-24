# Design tokens (the plain-English version)

A **token** is a named value: instead of writing `#f9f9f7` everywhere, you write `--sp-bg`. Change it once and every screen follows. That is how one switch (dark mode) can restyle a whole app.

**Source of truth:** `tokens/tokens.json`. Edit it, run `scripts/build.sh`, and the CSS is regenerated. Never hand-edit the token block inside `theme.src.css`.

Each colour token holds two values: `$value` (light) and `$extensions.dark` (dark). The shape follows the W3C Design Tokens idea (`$type`, `$value`) [Unverified: not checked against the final spec].

## Three layers (idea shared with Material 3)
| Layer | Meaning | Example here |
|---|---|---|
| Reference | raw values | `#d97757` |
| System (semantic) | what it is FOR | `--sp-accent`, `--sp-danger`, `--sp-bg` |
| Component | one component's choice | `--b-bg`, `--b-hover` inside buttons |

Material 3 documents this reference/system/component split (m3.material.io/foundations/design-tokens). This theme uses the same idea with its own names, so it is not a Material 3 theme.

## Material 3 repo
I could not open `material-foundation/material-tokens` (the site blocks automated access), so I cannot confirm whether it is archived. [Unverified] Material 3's colour roles (primary, on-primary, surface, outline, error and so on) are similar to ours: `--sp-primary`, `--sp-on-primary`, `--sp-surface`, `--sp-border`, `--sp-danger`. A mapping file can be added later if you want to exchange tokens with Material tools.

## Do you need Figma?
No. Figma is a drawing app designers use to mock screens. For you, `tokens.json` + `demo.html` play that role: the tokens are the palette, the demo page is the picture, and the agent reads both.

## Adding or changing a token
1. Add/edit it in `tokens/tokens.json` (give BOTH light and dark values).
2. `./scripts/build.sh`
3. `python3 scripts/audit.py` must report 0 failures.
