---
name: gas-email-service
description: Sets up a branded transactional email backend on Google Apps Script (GAS) for any web app — welcome emails, admin signup notifications, contact/report form auto-replies, and any other "fire an email when X happens" flow. Use this whenever the user wants to send emails from a web app without a paid email service, wants a GAS Web App as their email backend, mentions MailApp/GmailApp, asks to wire a contact/report/feedback form to send a confirmation email, wants an admin notified on signups or form submissions, or asks for branded/personalized HTML email templates. Also use this as the email-sending foundation when another skill (e.g. an auth skill) needs to send emails but doesn't own its own mail logic — don't duplicate email-sending code, generate it once here and have the other skill call into it.
---

# GAS Email Service

Generates a Google Apps Script (GAS) Web App that sends branded HTML emails —
welcome messages, admin notifications, and form-submission auto-replies — using
`MailApp`, with a Google Sheet as a free log/database. No external email
service or paid API required.

This skill is **backend-only**. It does not design frontend UI. If the request
also involves login/signup screens or Firebase Auth UX, use those alongside
this one — this skill provides the email-sending backend; auth-flow skills
should call into it rather than re-implementing email sending.

## Step 1 — Collect required variables

Ask for these up front, as a numbered list. Skip anything already known from
context (e.g. already stated in the conversation, or an existing project's
current config). Never invent values — leave a `// TODO` placeholder for
anything not provided.

```
1. APP_NAME        — Full app name shown in email headers
2. APP_URL         — Live URL of the app
3. APP_TAGLINE      — One-sentence description shown in the email footer
4. LOGO_URL         — Direct image URL for the email header logo
5. ADMIN_EMAIL      — Address that receives admin notifications
6. WHATSAPP_NUMBER  — International format, no "+" (omit if no WhatsApp support line wanted)
7. CREATOR_NAME     — Sign-off name in emails
8. CREATOR_TITLE    — Sign-off title (e.g. "Creator", "Founder")
9. PRIMARY_COLOR    — Accent hex color for buttons/links
10. LOG_SHEET_ID     — Google Sheet ID to use as the log spreadsheet
```

Also ask: **which email events does this project need?** Don't assume all of
them — offer a checklist:
- [ ] Signup notification to admin
- [ ] Welcome email to new user
- [ ] Admin BCC'd on the welcome email
- [ ] Contact/report form → auto-reply to sender ("message received")
- [ ] Contact/report form → notification to admin with full message content
- [ ] Anything else event-specific (name it — this skill can template any
  "event happens → send templated email" flow, not just the ones listed)

## Step 2 — Non-negotiable copywriting rule

**No "we", "us", "our" anywhere in email copy.** The sender is one person, not
a company. Every email signs off as:

```
{{CREATOR_NAME}} | {{CREATOR_TITLE}}, {{APP_NAME}}
```

If the user gives you email copy that uses "we/us/our", rewrite it in first-
person-singular or neutral voice before templating it, and flag the change.

## Step 3 — Generate the files

| File | Purpose |
|------|---------|
| `Code.gs` | Full GAS backend: config, email shell/header/footer/CTA builders, the requested email functions, `doPost`/`doGet` router, sheet logging |
| `SETUP_GUIDE.md` | Deployment steps: script properties, spreadsheet setup, web app deployment, frontend wiring |

Start from `assets/Code.gs` in this skill folder — **adapt, don't regenerate
from scratch.** It already has the header/footer/CTA button builders and the
report auto-reply / admin notification functions correctly wired. Substitute
`{{PLACEHOLDER}}` tokens, remove any event blocks the user didn't ask for in
Step 1, and add new ones following the same pattern (see "Adding a new email
event" below).

If this project is `cbcaiug_canvas_firebase`, or the user says it's the "CBC
AI Tool" / "CBC AI Canvas" project, use these known defaults instead of
asking again — confirm them briefly rather than re-collecting:
- APP_NAME = "CBC AI Canvas" | PRIMARY_COLOR = "#f59e0b" (amber theme)
- ADMIN_EMAIL = "cbcaitool@gmail.com" | WHATSAPP_NUMBER = "256726563041"
- CREATOR_NAME = "Derrick M" | CREATOR_TITLE = "Creator"

## Step 4 — Behavioral rules

| Rule | Detail |
|------|--------|
| Secrets never hardcoded | `FIREBASE_API_KEY`, `logSheetId`, and any other credential are read via `PropertiesService.getScriptProperties()`, never written as literals in `Code.gs` |
| Every mail call is non-blocking | Wrap each `MailApp.sendEmail` call in try/catch; log failures with `console.error`, never let one failed email break the response |
| Sheet auto-creates | The log sheet and its header row are created on first write if missing — never assume it pre-exists |
| Emails are HTML, not plain text | Use `emailShell()` for every email so header/footer/branding stay consistent |
| Every event = admin notification + optional user-facing copy | Follow the `doPost` action pattern: one `action` string per event, routed in a single handler, so a project's existing `doPost` (if any) can have these actions merged in without being replaced |
| Personalize, don't templatize visibly | No literal "Dear User" or unresolved merge-tag look — use the actual name/email supplied, falling back to a neutral phrase ("there") only when no name was given |

### Adding a new email event
1. Add one `send<Event>Email(details)` function using `emailShell(subtitle, bodyHtml)`
2. Add one `action` branch in `doPost` that calls it
3. Document the new action's request body shape in `SETUP_GUIDE.md`

## Step 5 — Reference

- `assets/Code.gs` — full template, adapt in place
- `references/email-design-system.md` — the header/footer/CTA button visual
  spec, if you need to explain or modify the look without regenerating code
