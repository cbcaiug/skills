# Auth UI Guide
**Skill: firebase-auth-email | {{APP_NAME}}**

This document defines the exact UX states, copy, and component patterns for
every auth screen. Match your existing app theme throughout.

---

## 1. Sign-Up View (Email / Password)

### Fields
- Email address (type="email")
- Password (type="password", min 8 chars)
- Confirm password
- Submit button: **"Create Account"**

### UX States

| State | What to show |
|-------|-------------|
| Idle | Normal form |
| Loading | Disable button, show spinner |
| **Success (Variant A — link)** | Hide form. Show green notice: _"A verification link has been sent to [email]. Check your inbox and spam folder."_ |
| **Success (Variant B — code modal)** | Account already exists in Firestore at this point. Do NOT hide the form silently — open the blocking Verification Modal (see §1a below) immediately. |
| Error — email in use | Inline red text below the email field: _"This email is already linked to an account. Sign in instead."_ — "Sign in instead" renders as a clickable link that switches to the Sign-In view. No modal, no popup. |
| Error — weak password | `"Password is too weak. Use at least 8 characters, mixing letters and numbers."` |
| Error — network | `"Network error. Check your internet connection and try again."` |
| Other error | Output from `getFriendlyAuthError(err)` |

### Resend Link (Optional — Variant A only)
If user doesn't receive the email, provide a "Resend verification link" button
that calls `signUpWithEmail` again. Firebase will reject duplicate accounts, so
you only call GAS's `user_signup` again to resend; handle by calling a
`resend_verification` action in GAS (see GAS Code.gs extension note).

---

## 1a. Choosing a verification pattern (Variant A vs Variant B)

Before generating sign-up flow code, determine which pattern this project
uses — **do not assume.** Ask the user directly, or offer to check for
yourself:

> "Should email verification use a link sent to the user's inbox (they click
> it to verify), or a 6-digit code entered in a modal right after sign-up
> (blocks the app until entered)? If this project already has an existing
> auth flow, I can look at it first and tell you which one it currently uses."

If the user says "check the existing project," read its current sign-up
component/service files before answering — look for a `/verify` route (→
Variant A) or a code-input modal component (→ Variant B). Report back what
you found and confirm before generating anything.

### Variant B: Verification Modal (6-digit code flow)

The modal appears **immediately after account creation** while the account
already exists in Firestore but is unverified. It blocks app access until
the code is entered or the user goes back to login.

**Before generating the modal's HTML/JSX, study the existing project's UI**
(if one exists) and extract its modal/overlay pattern — background colour,
border-radius, shadow style, font family, button style, backdrop. Then
present a draft to the user for approval: _"Here's what was extracted from
your UI — approve or describe changes."_ Do not finalize without that
confirmation. If it's a brand-new project with no existing UI, use the
project's `PRIMARY_COLOR`, a `#1f2937` dark header, and a standard rounded
card as defaults — and still show a preview before finalizing.

#### Modal content
- **Title:** "Verify your email"
- **Body:** "A 6-digit code has been sent to **[email]**. Enter it below to activate your account."
- **Input:** 6 boxes (one digit each) OR a single 6-digit field — match existing app style
- **Primary button:** "Verify" — disabled until 6 digits entered
- **Secondary actions (below the button):**
  - "Resend code" — calls `resendVerificationCode()`; shows inline: _"A new code has been sent."_ (60-second cooldown to prevent spam)
  - "← Back to Login" — signs the user out, closes the modal, returns to the login view
- **Error state (wrong code):** Inline red text below input: _"Incorrect code. Check your email and try again."_
- **Expired code:** Inline amber text: _"This code has expired. Use Resend code to get a new one."_
- **Success:** Close modal, show green notice: _"Email verified! You're all set."_ then redirect to app.

---

## 2. Sign-In View (Email / Password)

### Fields
- Email address
- Password
- "Forgot password?" link (switches to Forgot Password view — same page, no navigation)
- Submit button: **"Sign In"**

### UX States

| State | What to show |
|-------|-------------|
| Idle | Normal form |
| Loading | Disable button, show spinner |
| Success | Redirect to app |
| **Unverified email** | Amber/orange notice: _"Please verify your email first. Check the link sent to [email]. Also check your spam folder."_ |
| Wrong credentials | `"The email or password entered is incorrect. Please check and try again."` |
| No account | `"No account found with that email address. Check the spelling or create a new account."` |
| Too many attempts | `"Too many failed attempts. Please wait a few minutes before trying again."` |
| Other | `getFriendlyAuthError(err)` |

### Error Display Rule
- Show errors **inline**, below the form fields — never use browser `alert()`
- Never show `err.code` or `err.message` raw
- Errors should be in a styled notice box (red border-left for errors, amber for warnings)

---

## 3. Google Sign-In Button

### Button
- Label: **"Continue with Google"**
- Standard Google branding (white button, Google icon)
- Place below the email form with a divider: `— or —`

### UX States

| State | What to show |
|-------|-------------|
| Loading | Disable button, spinner |
| Success (new user) | Redirect to app; welcome email sent automatically |
| Success (returning) | Redirect to app |
| Popup closed | `"The sign-in window was closed before completing. Please try again."` |
| Other | `getFriendlyAuthError(err)` |

### Note
Google sign-in does **not** require email verification — Google already verifies it.
Do not show a "check your email" message after Google sign-in.

---

## 4. Forgot Password View

### Trigger
Clicking "Forgot password?" on the Sign-In view **in-place** — swap the sign-in
form with the forgot-password form without navigating away.

### Fields
- Email address
- Submit button: **"Send Reset Link"**
- Back link: **"← Back to Login"** (swaps back to sign-in view)

### UX States

| State | What to show |
|-------|-------------|
| Idle | Email field + Send Reset Link button |
| Loading | Disable button, show spinner |
| **Success** | Hide form. Show: _"A password reset link has been sent to [email]. Also check your spam folder."_ + **"← Back to Login"** link |
| Invalid email | `"Please enter a valid email address."` |
| Network error | `"Network error. Check your internet connection and try again."` |
| Other | `getFriendlyAuthError(err)` |

### Security Note
For `auth/user-not-found`, `authService.js` returns the same success message
as a real send. This prevents email enumeration attacks. Do not change this behaviour.

---

## 5. Email Verification Landing Page (`/verify`) — Variant A only

This page is loaded when the user clicks the verification link from their email.
Skip this section entirely for Variant B (modal) projects.

### On Mount
1. Read `token` and `email` from URL query params
2. Also read `uid` — this must be stored in the URL too OR you derive it by
   listening for the Firebase user session. Recommended: embed uid in the link:
   `APP_URL/verify?token=TOKEN&email=EMAIL&uid=UID`
3. Call `handleVerificationLink(token, email, uid)` from `authService.js`
4. GAS checks token, email, expiry → marks Verified → sends welcome email

### UX States

| State | What to show |
|-------|-------------|
| Checking... | Spinner: "Verifying your email..." |
| **Success** | Green checkmark: _"Email verified! You can now sign in."_ + **"Sign In"** button |
| Expired | Red notice: _"This verification link has expired. Please sign up again."_ + Sign Up link |
| Invalid | _"Invalid or already-used verification link."_ |
| Missing params | _"This verification link is incomplete or malformed."_ |

---

## 6. Report / Contact Form

Wire any "Send Report", "Contact", or "Submit Feedback" button to `submitReport(details)`.

### On Submit
1. Collect: `name`, `email`, `message`, `subject` (optional), `type` (optional)
2. Call `submitReport(details)` from `authService.js`
3. On success → show: _"Your message has been sent. Check your email for a confirmation."_
4. On failure → show: _"Failed to send your message. Please try WhatsApp for immediate support."_
   with a WhatsApp button linking to `https://wa.me/{{WHATSAPP_NUMBER}}`

---

## 7. Error Display Component Pattern

A reusable inline error/notice component:

```jsx
// React example
function AuthNotice({ type = 'error', message }) {
  if (!message) return null;
  const colors = {
    error:   { border: '#ef4444', bg: '#fef2f2', text: '#991b1b' },
    warning: { border: '#f59e0b', bg: '#fffbeb', text: '#92400e' },
    success: { border: '#10b981', bg: '#f0fdf4', text: '#065f46' },
  };
  const c = colors[type] || colors.error;
  return (
    <div style={{
      borderLeft: `4px solid ${c.border}`,
      background: c.bg,
      color:      c.text,
      padding:    '12px 16px',
      borderRadius: '6px',
      fontSize:   '14px',
      lineHeight: '1.5',
      margin:     '12px 0',
    }}>
      {message}
    </div>
  );
}
```

Usage:
```jsx
<AuthNotice type="error"   message={errorMsg} />
<AuthNotice type="success" message={successMsg} />
<AuthNotice type="warning" message={warningMsg} />
```

---

## 8. General Rules

- **Never** show `err.code`, `err.message`, or anything containing "Firebase" in the UI
- Raw errors go to `console.error()` only
- All errors pass through `getFriendlyAuthError()` before display
- Loading states must disable the submit button (prevents double-submissions)
- Use `{{PRIMARY_COLOR}}` for primary buttons
- Maintain the existing app's color scheme — do not introduce new colors
- WhatsApp support button must appear on error states where the user may be stuck (only if `WHATSAPP_NUMBER` is configured)

## 9. Theme Extraction (applies to every modal/screen this skill generates)

Before generating any modal or branded auth component for a project that
already has UI:
1. Ask: _"Should I study your existing UI files to match the modal/form
   style automatically, or would you prefer to describe the style?"_
2. If asked to study it: read the relevant component/CSS files, extract
   colours, border-radius, shadows, and fonts, then present a draft with:
   _"Here's what was extracted from your UI — approve or describe changes."_
3. Do not finalize any generated modal/screen without user confirmation
   when working on an existing project.
4. Brand-new project with no existing UI: default to `{{PRIMARY_COLOR}}`, a
   `#1f2937` dark header, and a standard rounded-card style — still show a
   preview before finalizing.
