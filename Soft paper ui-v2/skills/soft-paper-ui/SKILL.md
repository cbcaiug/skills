---
name: "soft-paper-ui"
description: A complete, reversible design system (warm paper-white surfaces, pill buttons, serif headings, blue controls, amber warnings, custom toasts and modals, automatic dark mode) inspired by the Claude Android app. Use this skill whenever the user asks to apply, install, switch on, restyle with, or reverse "the theme", "the design system", "soft paper", "Claude-style UI", or asks for any web page or app screen, form, button, modal, toast, banner, loader, list, settings page, navigation, table or dark mode to look consistent. Also use it to replace native browser alert/confirm/prompt dialogs. Use even if the user only says "make it look like my other apps".
---

# Soft Paper UI

One CSS file + one small JS file give any web page or web app the full look. Everything is scoped
to `<html data-theme-pack="soft-paper">`, so the theme is **fully reversible**: remove that attribute
and the page returns to exactly how it was.

## Files
- `assets/theme.css` — built, scoped stylesheet (tokens + every component). Never hand-edit; edit `theme.src.css` then run `scripts/build.sh`.
- `assets/theme.js` — runtime: `SoftPaper.enable/disable/toggle`, toasts, modals (alert/confirm/prompt), bottom sheet, menu, loader, tap ripple.
- `assets/demo.html` — every component in one page. Open it to see the target look.
- `references/components.md` — class and API cheat sheet. Read before building any screen.
- `references/revert.md` — how to turn the theme off or remove it completely.
- `references/fonts.md` — font choices and licence note. Read before changing fonts.
- `references/tokens.md` — what tokens are, how to change one (`tokens/tokens.json` is the single source of truth).
- `references/motion.md` — every animation, timing and the honesty rules for feedback.
- `references/checklist.md` — acceptance checklist, copy rules, handoff rules. Run it before finishing any screen.
- `scripts/audit.py` — automated contrast/state audit (every button variant x hover/press x light/dark). Must report 0 failures.
- `scripts/build.sh` — regenerates CSS from tokens and icons into `theme.css`/`theme.js`.

## Install (any project)
1. Copy `assets/theme.css` and `assets/theme.js` into the project's public/static folder.
2. In the HTML `<head>`: `<link rel="stylesheet" href="/theme.css">` and before `</body>`: `<script src="/theme.js"></script>`.
   For React/Vite/Next: import the CSS once at the root and load the script (or `import` it) once.
3. The script switches the theme on automatically. To keep it manual, set `data-theme-pack-manual` on `<html>` and call `SoftPaper.enable()`.
4. Dark mode follows the phone/computer setting automatically. Force with `SoftPaper.setColor('light'|'dark'|'system')`.

## Rules the agent MUST follow when building UI with this theme
1. **Use tokens, never raw values.** Colors come from `var(--sp-*)`; radii from `--sp-r-*`; spacing from `--sp-s*`. No hard-coded hex in components.
2. **Buttons are pill-shaped.** Primary = near-black fill (inverts in dark). One primary button per view. Danger actions use `sp-btn-danger`. Minimum tap height 44px.
3. **Headings use the serif font, UI text uses the sans font.** Do not add other fonts.
4. **No native dialogs.** Never use `alert()`, `confirm()`, `prompt()`. Use `SoftPaper.alert/confirm/prompt` (they return Promises: `await SoftPaper.confirm({...})`) and `SoftPaper.toast`.
5. **Feedback mapping:** quick result → toast; something needs attention but page still usable → amber `sp-banner is-warning`; blocking decision → modal; failure → red toast or `is-error` banner; success → green toast.
6. **Amber means warning/limits, blue means selected/active/interactive control, orange (accent) is brand only** (avatar, empty-state mark, progress-top). Never use accent orange for errors.
7. **Every interactive element needs all states:** default, hover, pressed (`:active` shrinks to 0.97 and darkens), focus-visible ring, disabled (45% opacity), loading (`aria-busy="true"` on buttons).
8. **Loading:** buttons → `aria-busy`; lists/cards → `sp-skeleton`; chat/AI → `sp-typing`; full screen → `SoftPaper.loading(true,'text')`.
9. **Lists/settings rows** use `sp-list` + `sp-list-item` (white rounded group on the paper background, hairline dividers, selected row text turns blue).
10. **Mobile first.** Use bottom sheets (`SoftPaper.sheet`) for pickers on phones, `sp-bottomnav` for primary navigation, respect safe-area insets (already built in).
11. **Accessibility is not optional:** keep `aria-*` attributes, labels on every input, Escape closes overlays, respect reduced motion (built in).
12. **Icons:** only use the built-in Lucide sprite: `<span data-icon="house"></span>` or `SoftPaper.icon('house')`. Never draw icons by hand. List of names: `SoftPaper.iconNames`. Sidebar toggle uses `panel-left-open` / `panel-left-close` (handled by `SoftPaper.sidebar`).
13. **Navigation:** desktop uses `sp-navbar` (+ `sp-shell`/`sp-sidebar` for app layouts, collapses to an icon rail); phones use the slide-in drawer and `sp-bottomnav`. Wire with `SoftPaper.sidebar({shell,toggle})`.
14. **Text boxes** use `.sp-textbox` (leading icon, clear, password toggle, multiline, counter, OTP, stepper). Always a `<label>`, errors below the field with an icon or text, never colour alone.
15. **Async work** (payments, downloads, saves) uses `SoftPaper.asyncButton` and `SoftPaper.status`. Success is only shown after the server confirms.
16. **Before finishing any screen** run `scripts/audit.py` and the checklist in `references/checklist.md`.
17. **Do not change the theme file to fix one screen.** Add a page-local class instead, or ask the user.

## Reverse / remove
See `references/revert.md`. Quick version: `SoftPaper.disable()` in code, or delete the `data-theme-pack` attribute, or remove the two include lines.

## When something is missing
If a component is needed that is not in `references/components.md`, build it from the tokens in the same style (paper surface, 1px `--sp-border`, radius from the scale, pill for actions, 120ms transitions) and tell the user so it can be added to the theme.
