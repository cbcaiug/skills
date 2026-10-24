---
name: firebase-auth-ui
description: >-
  Designs and implements Firebase Authentication UX — sign-up, sign-in,
  Google OAuth, forgot-password, email verification (link or 6-digit code
  modal), and clean/friendly error messages instead of raw Firebase error
  strings like Firebase: Error (auth/invalid-credential). Use this whenever
  the user asks to build or fix a login/signup page, add Google sign-in,
  handle Firebase auth errors, add email verification, build a forgot
  password flow, or improve auth UX in any way. This skill depends on the
  gas-email-service skill for actually sending emails (verification,
  welcome) — use both together when the project needs email-based
  verification; use this skill alone if verification/emailing isn't needed
  (e.g. Google-only auth, or just fixing error messages).
---

# Firebase Auth UI

Designs Firebase Authentication screens and wires them to clean, non-technical
error messages and (optionally) a GAS-backed email verification flow. This
skill owns the **auth UX and Firebase-specific logic**; it does not own email
sending — that's `gas-email-service`, which this skill calls into.

## Step 0 — Determine scope

Ask, or infer from context, which of these the user actually wants (don't
build all of it by default):
- Sign-up / sign-in screens (email+password, Google, or both)
- Email verification (and if so, which pattern — see Step 2)
- Forgot-password flow
- Just the error-message cleanup, on top of an existing auth flow
- Report/contact form wiring (this lives in `gas-email-service`, not here —
  point there if that's all they need)

## Step 1 — Collect required variables

Ask for whatever isn't already known:
```
1. APP_NAME, APP_URL, PRIMARY_COLOR   — same as gas-email-service; reuse
   if that skill already ran for this project, don't re-ask
2. FIREBASE_PROJECT_ID   — Firebase Console → Project Settings
3. FIREBASE_API_KEY      — Firebase Console → Project Settings → Web API Key
   (goes in Script Properties, never hardcoded)
4. GAS_WEB_APP_URL       — the deployed email-service backend's URL
   (from gas-email-service, if verification/welcome emails are needed)
```

If this is the `cbcaiug_canvas_firebase` / "CBC AI Canvas" project, reuse the
known defaults documented in `gas-email-service`'s SKILL.md rather than
re-asking.

## Step 2 — Choose the verification pattern (only if verification is in scope)

**Don't assume link vs. code.** Ask:

> "Should email verification use a link sent to the user's inbox, or a
> 6-digit code entered in a modal right after sign-up (blocks the app until
> entered)? If this project already has an auth flow, I can check it first."

If told to check the existing project: read its current sign-up
component/service files before answering. A `/verify` route means link
(Variant A); a code-input modal component means 6-digit code (Variant B).
Report what you found and confirm before generating anything.

## Step 3 — Generate the files

| File | Purpose |
|------|---------|
| `authService.js` | Sign-up, sign-in, Google OAuth, forgot-password, verification (whichever variant), report submission, sign-out — keep only the variant's functions that apply |
| `firebaseErrorMap.js` | Maps raw Firebase error codes to clean, user-facing messages — use as-is |
| Auth screen components (sign-up/sign-in/forgot-password/verification modal or `/verify` page) | Built per `references/auth-ui-guide.md`, in whatever framework the project uses |
| `auth-gas-addon.gs` snippet | Only if verification is in scope — merge into the project's `Code.gs` from `gas-email-service` (see that file's header comment for exactly what to merge) |

Start from `assets/authService.js` and `assets/firebaseErrorMap.js` — adapt,
don't regenerate from scratch. Delete whichever verification variant's
functions don't apply to this project.

## Step 4 — Behavioral rules

| Rule | Detail |
|------|--------|
| Never surface raw Firebase errors | `Firebase: Error (auth/...)` must never reach the DOM — raw errors go to `console.error()` only, UI gets `getFriendlyAuthError()` |
| `email-already-in-use` is inline, not a modal | Red text under the email field: "This email is already linked to an account. Sign in instead." — "Sign in instead" is a clickable link to the Sign-In view |
| Errors display inline, never `alert()` | Styled notice box: red border-left for errors, amber for warnings, green for success |
| Google sign-in skips verification | Google already verifies the email; don't show a "check your email" message after it |
| Forgot-password never confirms whether an email exists | Same "reset link sent" message whether or not the account exists — prevents email enumeration |
| Forgot-password is a swapped view, not a new page | Swap the sign-in form in place; provide "← Back to Login" |
| Loading states disable the submit button | Prevents double-submission |
| Theme extraction before generating any new screen/modal | See `references/auth-ui-guide.md` §9 — ask whether to study the existing UI or be told the style; always show a draft for approval before finalizing on an existing project |

## Step 5 — Reference

- `references/auth-ui-guide.md` — exact UX states/copy for every screen,
  the verification-modal spec, and the theme-extraction workflow
- `assets/authService.js`, `assets/firebaseErrorMap.js` — adapt in place
- `assets/auth-gas-addon.gs` — the Firebase-specific half of the GAS backend
  (token/code generation, Firestore updates); merge into the email service's
  `Code.gs`, don't deploy separately
