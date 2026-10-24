---
name: browser-guard
description: Implements site-wide browser/in-app-webview support detection, connectivity (offline/slow) detection, and pop-up-blocked detection for any web app. Use this whenever the user asks to detect unsupported browsers, block in-app browsers (Facebook/Instagram/TikTok in-app webviews), show an offline banner, detect slow connections, catch pop-up blockers breaking sign-in/downloads, or wants a "verifying browser" splash screen. Trigger even if they only describe one of the three pieces (e.g. just "detect if pop-ups are blocked") — implement that piece using this same reference implementation rather than writing bespoke detection from scratch.
---

# Browser Guard

A drop-in, framework-agnostic reference implementation of three defensive UX
patterns for web apps, generalized from a working prototype:

1. **Browser / in-app-webview support check** — verifying-overlay → green
   check, or a full-screen blocking banner for unsupported browsers with
   real escape hatches (Android intent links, iOS instructions, desktop
   download links).
2. **Connectivity detection** — blocking offline overlay, non-blocking
   online/slow-connection toasts.
3. **Pop-up-blocked detection** — dismissible, non-blocking banner, tested
   on first user gesture, plus a public API to test synchronously before a
   real sign-in/download pop-up.

## When to use this

Use this skill any time the user wants any subset of the above for a real
web app they're building or maintaining — whether they name all three or
just one ("I want to detect if someone opens my site in the Instagram
browser", "add an offline banner", "pop-ups keep silently breaking Google
sign-in for some users"). Don't write new detection logic from scratch;
adapt the bundled reference implementation, since it already encodes the
non-obvious edge cases (Chrome major-version staleness as a WebView signal,
why iOS can't be generically WebView-detected, why the pop-up test needs a
real user gesture, why slow-connection must stay non-blocking, etc.).

## How to implement it

1. Read `assets/browser-guard.js` and `assets/browser-guard.css` in full —
   they're the actual deliverable, not just illustrative. Copy them
   verbatim into the target repo (adjust only the config object, never the
   detection logic, unless the user specifically asks for different
   thresholds/browser lists).
2. Read `reference/rollout-steps.md` for how to wire the two files into
   *every* page of the target app in one pass — the placement strategy
   differs by app shape (static multi-page site vs. Next.js vs. SPA vs.
   server-rendered app with a shared layout), and picking the wrong one
   means redoing the integration page-by-page instead of once.
3. If the user only wants one of the three systems, still copy the whole
   file — the systems are independent and inert unless triggered, so
   there's no harm in shipping all three, and it saves needing to hand-pick
   and re-test a trimmed-down version. Only trim code out if the user
   explicitly asks for a smaller bundle.
4. Confirm against the checklist in `reference/rollout-steps.md` before
   calling the task done.

## If the user wants something to hand to a *different* AI tool

If the user says they want to give this to Gemini, ChatGPT/Codex, or
another non-Claude agent (rather than have you implement it directly), give
them `reference/PORTABLE-PROMPT.md` instead of doing the implementation
yourself. It's fully self-contained (instructions + the complete code
inlined) so it works as a single paste with no other files attached.
