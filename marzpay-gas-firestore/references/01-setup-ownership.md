# 01 — Setup, ownership & deployment (GAS ↔ Firestore without a service-account key)

Read this BEFORE writing code. Almost every "GAS can't write to Firestore" failure is in §1–§5.

## Why no service-account key
Some Google accounts/organisations block key creation ("Key creation is not allowed on this service account…" — an
organisation policy; Google has been moving toward keyless auth) [UNVERIFIED: policy name/timeline not re-checked this session].
Apps Script sidesteps it: `ScriptApp.getOAuthToken()` returns an OAuth token **for the Google account that deployed the web app**
("Execute as: Me"). Firestore sees that *person*, not a service account. No key file, no base64, nothing to leak.

## §1 THE OWNERSHIP RULE (non-negotiable, learned the hard way)
> The Google account that owns/deploys the Apps Script project must be the **Owner** of the Firebase/GCP project that holds
> Firestore — or must have been added to it as **Editor** (or at least the Cloud Datastore User role).

If not: every Firestore call returns `403 PERMISSION_DENIED`, even though the code is perfect.
- **Same person owns both?** Perfect — nothing to do.
- **Different accounts?** Firebase owner: Firebase console → ⚙ Project settings → **Users and permissions** → **Add member** →
  the GAS owner's Google email → role **Editor**. (Or in console.cloud.google.com → IAM & Admin → IAM → Grant access.)
  Cleanest alternative: create the Apps Script project while signed in as the Firebase owner.
- AI: ALWAYS ask: *"Which Google account created the Firebase project, and which account will deploy the Apps Script?"* If they differ, walk them through adding the member before anything else.
- Editor is confirmed sufficient by multiple sources; the narrower `roles/datastore.user` is [UNVERIFIED] — recommend Editor unless the user insists on least-privilege, then test with `selfTestFirestore()`.

## §2 Create the pieces (once)
1. Firebase project exists, Authentication enabled (Google sign-in or whatever the user chose), **Firestore database created**
   (see 04-firestore-data-and-rules.md for Standard vs Enterprise edition — choose **Standard** unless the user has a reason).
2. script.google.com → **New project** (signed in as the account from §1). Name it e.g. `<app>-payments-backend`.

## §3 Link the Apps Script project to the Firebase GCP project
Apps Script runs on a hidden default GCP project that has no Firestore. Switch it:
1. Firebase console → ⚙ Project settings → General → copy **Project number** (digits; NOT the Project ID).
2. Apps Script → ⚙ **Project Settings** → section *Google Cloud Platform (GCP) Project* → **Change project** → paste the number → Set project.
   - Error "you do not have permission…" = §1 not satisfied (account isn't Owner/Editor), or the project is under an organisation that restricts it.

## §4 Enable the API
console.cloud.google.com → pick the Firebase project (top bar) → **APIs & Services → Library** → search **Cloud Firestore API** → **Enable**.
(Symptom if skipped: `Cloud Firestore API has not been used in project … before or it is disabled`.)

## §5 Manifest scopes + authorize
1. Apps Script → ⚙ Project Settings → tick **Show "appsscript.json" manifest file in editor**.
2. Replace its contents with `assets/appsscript.json` (scopes: `datastore`, `script.external_request`; web app: execute as *me*, access *Anyone*).
3. Paste `assets/Code.gs` into Code.gs.
4. Select function **`authorizeOnce`** → Run → review permissions → Allow. (If Google shows "unverified app": Advanced → Go to project (unsafe) — it is the user's own script.)
5. Re-run `authorizeOnce` after EVERY future scope change. Symptom if skipped: `401 UNAUTHENTICATED` / "Authorization is required".

## §6 Script Properties (secrets live here — never in Code.gs, never in the browser)
Apps Script → ⚙ Project Settings → **Script Properties → Edit script properties → Add**. Names/values are in `PROP_DOC` at the top of Code.gs
and `assets/.env.local.template` §B (where to find each value). Minimum: `FIREBASE_PROJECT_ID`, `FIREBASE_WEB_API_KEY`, `MARZPAY_API_KEY`, `MARZPAY_API_SECRET`, `WEBAPP_EXEC_URL`.
Alternatives the user may prefer: hardcode in Code.gs (works, but anyone with Editor access to the script — or a pasted screenshot — exposes it;
warn once, respect the choice) — or Vercel env vars (only if you add a proxy; GAS cannot read Vercel env). Default recommendation: Script Properties.
Run `selfTestConfig` → it lists missing required names (never values).

## §7 Deploy as a web app (and the redeploy trap)
Deploy → **New deployment** → type **Web app** → Execute as **Me** → Who has access **Anyone** → Deploy → copy the **/exec** URL.
- Put that URL in: browser `VITE_GAS_BACKEND_URL` AND Script Property `WEBAPP_EXEC_URL`.
- **TRAP:** editing Code.gs does NOT change the live URL. Deploy → **Manage deployments → ✏ edit → Version: New version → Deploy**. (URL stays the same.)
  Symptom: "I fixed it but nothing changed." The `/dev` URL runs latest code but only works for the owner — never use it in the app.
- "Anyone" (not "Anyone with Google account") — otherwise the browser gets a Google login HTML page instead of JSON.
- Verify: open the /exec URL in a browser → JSON `{"ok":true,"service":"marzpay-gas-firestore",…}`.

## §8 Prove each layer (cashless) — see 06-testing-and-dev-number.md
`selfTestConfig` → `selfTestFirestore` → `seedFirestore` → `selfTestCredit` → `selfTestMarzReadOnly` → (dev number) `selfTestCollect`.

## Symptom → cause (setup)
| Symptom (GAS Executions log / browser) | Cause | Fix |
|---|---|---|
| `403 PERMISSION_DENIED` on fs.* | §1 owner/editor | add account as Editor |
| `Cloud Firestore API has not been used in project N` | §3 not linked or §4 not enabled (N = hidden default project ⇒ §3) | link project, enable API |
| `401 UNAUTHENTICATED` / "Authorization is required" | §5 scopes | fix manifest, run `authorizeOnce` |
| `404` on every doc incl. `config/settings` | wrong `FIREBASE_PROJECT_ID`, database not created, or non-default database id | check ID; create DB; set `FIRESTORE_DATABASE_ID` |
| Browser gets HTML / "Invalid JSON" | access not "Anyone", or URL is /dev, or deployment is stale | §7 |
| Works for you, not for users | deployed "Execute as: User accessing" or /dev URL | redeploy as Me / Anyone |
| `CONFIG_MISSING` in logs | Script Property missing/typo (names are case-sensitive, no trailing spaces) | `selfTestConfig` |
| `auth.failed … Web API key restricted` | API key has HTTP-referrer restriction (GAS sends no referrer) | Google Cloud Console → APIs & Services → Credentials → key → remove referrer restriction, keep API restriction |
