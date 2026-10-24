# Email Design System

Applies to every email `emailShell()` produces. Read this when the user
wants to discuss or tweak the look without regenerating `Code.gs`.

| Element | Spec |
|---|---|
| Container | max-width 600px, white background, 12px border-radius, subtle shadow |
| Header | Dark background (`#1f2937`), centered logo (60×60, rounded, white padding), app name, optional subtitle |
| Body | Arial/sans-serif, `#333` text, 1.7 line-height, 15px, 32px padding |
| CTA button | Solid `{{PRIMARY_COLOR}}` background, white text, rounded, drop shadow, centered on its own line |
| Callout box | Light gray background, left border in `{{PRIMARY_COLOR}}`, used for expiry notices, quoted message previews |
| Footer | WhatsApp button (`#25D366`, only if `WHATSAPP_NUMBER` set) + copyright line + link back to `APP_URL` |
| Sign-off | Always `{{CREATOR_NAME}}` / `{{CREATOR_TITLE}}, {{APP_NAME}}` — never a company name |

## Deployment checklist (fill in when generating SETUP_GUIDE.md)

1. Gather all `{{PLACEHOLDER}}` values (see SKILL.md Step 1)
2. Create/identify the log Google Sheet, copy its ID
3. Apps Script → paste `Code.gs`, substitute placeholders
4. Project Settings → Script Properties → add `logSheetId` (and any other
   secret the project's event functions need)
5. Deploy → New Deployment → Web app → Execute as Me → Anyone → copy URL
6. Test: `GAS_URL?action=ping` → expect `{"success":true,...}`
7. Wire the frontend to POST `{ action, details }` to the deployed URL
8. Re-deploy note: code edits need "New version" under Manage Deployments;
   only a genuinely new deployment (new scopes) changes the URL
