# Reverting the theme

| Goal | Do this |
|---|---|
| Turn off now (keep files) | `SoftPaper.disable()` or remove `data-theme-pack="soft-paper"` from `<html>` |
| Turn on again | `SoftPaper.enable()` |
| Remove completely | Delete the `<link ... theme.css>` and `<script ... theme.js>` lines, delete the two files |
| Add a user toggle | `<button onclick="SoftPaper.toggle()">Toggle theme</button>` |

Why it is safe: every rule in `theme.css` starts with `html[data-theme-pack="soft-paper"]`, so with the attribute removed no rule matches. The only things the script touches are that attribute, `data-color`, and two localStorage keys (`sp-enabled`, `sp-color`).
Tested: with the attribute removed the page background returned to the browser default.
