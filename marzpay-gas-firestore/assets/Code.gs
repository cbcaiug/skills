/**
 * Code.gs — MarzPay + Firestore payments backend (Google Apps Script web app)
 * Skill: marzpay-gas-firestore  |  Template v1.0.0
 *
 * WHAT THIS DOES
 *   - Receives JSON (Content-Type text/plain, so no CORS preflight) from the browser.
 *   - Verifies the Firebase ID token, starts MarzPay mobile-money collections, tracks them in
 *     Firestore, and credits the user EXACTLY ONCE when MarzPay says "completed".
 *   - Talks to Firestore over REST using ScriptApp.getOAuthToken() => no service-account key.
 *
 * HARD REQUIREMENTS (see references/01-setup-ownership.md — people lose days on these)
 *   1. The Google account that DEPLOYS this script ("Execute as: Me") must be Owner or Editor
 *      of the Firebase/GCP project that owns the Firestore database.
 *   2. This Apps Script project must be linked to that same GCP project (Project Settings →
 *      Google Cloud Platform (GCP) Project → Change project → paste the PROJECT NUMBER).
 *   3. Cloud Firestore API enabled in that GCP project.
 *   4. appsscript.json contains the two oauthScopes shipped with this skill; re-authorize once.
 *   5. Every change to this file needs Deploy → Manage deployments → ✏️ → Version: New version.
 *
 * SECRETS live in Script Properties (Project Settings → Script Properties), never in this file.
 * Required: FIREBASE_PROJECT_ID, FIREBASE_WEB_API_KEY, MARZPAY_API_KEY, MARZPAY_API_SECRET
 * Optional: see PROP_DOC below.
 */

const VERSION = '1.0.0';
const WAIT_MS_STALE = 3 * 60 * 1000;   // a 'pending' payment older than this no longer blocks a new one

// Dial codes per MarzPay docs. nsn = allowed National Significant Number lengths (digits after the
// country code, no leading 0). [UNVERIFIED] lengths for BJ, CI, GA, SL: kept loose on purpose —
// MarzPay is the authority; its rejection is mapped to a friendly message.
const COUNTRIES = {
  UG: { dial: '256', cur: ['UGX'],        nsn: [9],     name: 'Uganda' },
  KE: { dial: '254', cur: ['KES'],        nsn: [9],     name: 'Kenya' },
  RW: { dial: '250', cur: ['RWF'],        nsn: [9],     name: 'Rwanda' },
  CD: { dial: '243', cur: ['CDF', 'USD'], nsn: [9],     name: 'DR Congo' },
  ZM: { dial: '260', cur: ['ZMW'],        nsn: [9],     name: 'Zambia' },
  CM: { dial: '237', cur: ['XAF'],        nsn: [9],     name: 'Cameroon' },
  BJ: { dial: '229', cur: ['XOF'],        nsn: [8, 10], name: 'Benin' },
  CI: { dial: '225', cur: ['XOF'],        nsn: [8, 10], name: "Côte d'Ivoire" },
  GA: { dial: '241', cur: ['XAF'],        nsn: [7, 8],  name: 'Gabon' },
  CG: { dial: '242', cur: ['XAF'],        nsn: [9],     name: 'Congo-Brazzaville' },
  SN: { dial: '221', cur: ['XOF'],        nsn: [9],     name: 'Senegal' },
  SL: { dial: '232', cur: null,           nsn: [8],     name: 'Sierra Leone' }   // currency [UNVERIFIED] → no currency check
};

const PROP_DOC = {
  FIREBASE_PROJECT_ID: 'required — Firebase console → Project settings → General → Project ID',
  FIREBASE_WEB_API_KEY: 'required (account mode) — same page → Web API Key / apiKey in the web config',
  FIRESTORE_DATABASE_ID: 'optional — default "(default)"',
  MARZPAY_API_KEY: 'required — MarzPay dashboard → API Keys',
  MARZPAY_API_SECRET: 'required — MarzPay dashboard → API Keys',
  MARZPAY_API_BASE: 'optional — default https://wallet.wearemarz.com/api/v1',
  WEBAPP_EXEC_URL: 'recommended — the deployed /exec URL (used to build the MarzPay callback_url)',
  WEBHOOK_TOKEN: 'optional — random string; enables the webhook path. Polling works without it',
  ALLOWED_COUNTRIES: 'optional — comma list e.g. "UG" or "UG,KE". Default "UG"',
  ADMIN_UIDS: 'optional — comma list of Firebase UIDs allowed to call admin_adjust',
  APP_NAME: 'optional — shown in the payment description',
  AUTH_MODE: 'optional — "account" (default) or "guest" (no Firestore, no login)',
  PLANS_JSON: 'guest mode only — {"plan_200":{"name":"200 Credits","credits":200,"price":2500,"currency":"UGX"}}',
  RECEIPT_SECRET: 'guest mode only — long random string used to sign receipts',
  DEBUG: 'optional — "1" turns on debug logs (still redacted)',
  DEV_TEST_PHONE: 'optional — developer phone for selfTestCollect(), e.g. 0750000000',
  DEV_TEST_COUNTRY: 'optional — default UG',
  DEV_TEST_AMOUNT: 'optional — default 500 (UG minimum)'
};

// ───────────────────────────── routing ─────────────────────────────

const ACTIONS = {
  pay_config: payConfig_,
  account_init: accountInit_,
  payment_create: paymentCreate_,
  payment_status: paymentStatus_,
  payment_cancel: paymentCancel_,
  payment_reconcile: paymentReconcile_,
  credits_spend: creditsSpend_,
  admin_adjust: adminAdjust_,
  receipt_verify: receiptVerify_
};

function doGet(e) {
  // Health check only. NEVER return config values here.
  return json_({ ok: true, service: 'marzpay-gas-firestore', version: VERSION, ts: Date.now() });
}

function doPost(e) {
  const rid = Utilities.getUuid().slice(0, 8);   // request id; returned to the browser for log correlation
  const t0 = Date.now();
  try {
    if (e && e.parameter && e.parameter.hook === 'marzpay') return handleWebhook_(e, rid);
    const body = parseBody_(e);
    const action = String(body.action || '');
    const handler = ACTIONS[action];
    if (!handler) throw appErr_('UNKNOWN_ACTION', 'Unknown request.', { action: action });
    log_('info', rid, 'request', { action: action });
    const res = handler(body, rid) || {};
    res.ok = true;
    res.rid = rid;
    log_('info', rid, 'done', { action: action, ms: Date.now() - t0 });
    return json_(res);
  } catch (err) {
    return json_(errorResponse_(err, rid));
  }
}

function parseBody_(e) {
  try { return JSON.parse(e.postData.contents); }
  catch (_) { throw appErr_('BAD_REQUEST', 'Invalid request.', { why: 'body is not JSON' }); }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ───────────────────────────── errors & logging ─────────────────────────────

function appErr_(code, userMsg, internal, extra) {
  const e = new Error(code);
  e.code = code; e.userMsg = userMsg; e.internal = internal || null; e.extra = extra || null;
  return e;
}

function errorResponse_(err, rid) {
  if (err && err.code && err.userMsg) {
    log_('warn', rid, 'handled_error', { code: err.code, internal: err.internal });
    const out = { ok: false, error_code: err.code, error: err.userMsg, rid: rid };
    if (err.extra) Object.keys(err.extra).forEach(function (k) { out[k] = err.extra[k]; });
    return out;
  }
  // Unexpected: log full detail for the developer, return a generic message to the user.
  log_('error', rid, 'unhandled_exception', { message: String(err && err.message || err), stack: String(err && err.stack || '').slice(0, 800) });
  return { ok: false, error_code: 'SERVER_ERROR', error: 'Something went wrong on our side. Please try again.', rid: rid };
}

const SECRET_KEY_RE = /secret|token|password|authorization|api[_-]?key|idtoken|receipt/i;
const PHONE_KEY_RE = /phone|msisdn/i;

function maskPhone_(p) {
  const s = String(p || '');
  if (s.length < 8) return '***';
  return s.slice(0, 4) + new Array(s.length - 6).join('*') + s.slice(-3);
}

function redact_(v, depth) {
  depth = depth || 0;
  if (v === null || v === undefined) return v;
  if (depth > 4) return '[deep]';
  if (typeof v === 'string') return v.length > 300 ? v.slice(0, 300) + '…' : v;
  if (typeof v !== 'object') return v;
  if (v instanceof Date) return v.toISOString();
  if (Array.isArray(v)) return v.slice(0, 20).map(function (x) { return redact_(x, depth + 1); });
  const o = {};
  Object.keys(v).forEach(function (k) {
    if (SECRET_KEY_RE.test(k)) o[k] = '[redacted]';
    else if (PHONE_KEY_RE.test(k)) o[k] = maskPhone_(v[k]);
    else o[k] = redact_(v[k], depth + 1);
  });
  return o;
}

let _props = null;
function prop_(name, required) {
  if (!_props) _props = PropertiesService.getScriptProperties().getProperties();
  const v = _props[name];
  if (required && (v === undefined || v === '')) {
    throw appErr_('CONFIG_MISSING', 'Payments are temporarily unavailable. Please contact support.', { missing: name });
  }
  return v;
}

function log_(level, rid, event, ctx) {
  if (level === 'debug' && prop_('DEBUG') !== '1') return;
  const entry = { lvl: level, rid: rid, ev: event };
  if (ctx) entry.ctx = redact_(ctx);
  const line = JSON.stringify(entry);
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

// ───────────────────────────── HTTP helpers ─────────────────────────────

function http_(rid, label, url, opt) {
  opt = opt || {};
  opt.muteHttpExceptions = true;
  const t = Date.now();
  let res;
  try { res = UrlFetchApp.fetch(url, opt); }
  catch (e) {
    // NOTE: never log `url` — identitytoolkit URLs carry the API key.
    log_('error', rid, label + '.network', { msg: String(e && e.message || e) });
    throw appErr_('UPSTREAM_NETWORK', 'Could not reach the service. Please try again.', { label: label });
  }
  const code = res.getResponseCode();
  const text = res.getContentText();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (_) { /* non-JSON */ }
  log_('debug', rid, label, { http: code, ms: Date.now() - t });
  return { code: code, data: data, text: text };
}

// ───────────────────────────── Firestore REST ─────────────────────────────

function fsBase_() {
  return 'https://firestore.googleapis.com/v1/projects/' + prop_('FIREBASE_PROJECT_ID', true) +
    '/databases/' + (prop_('FIRESTORE_DATABASE_ID') || '(default)') + '/documents';
}
function fsName_(path) {
  return 'projects/' + prop_('FIREBASE_PROJECT_ID', true) + '/databases/' + (prop_('FIRESTORE_DATABASE_ID') || '(default)') + '/documents/' + path;
}
function fsHeaders_() { return { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }; }

function fsFail_(rid, label, r) {
  const er = (r.data && r.data.error) || {};
  const msg = String(er.message || r.text || '').slice(0, 300);
  const status = er.status || ('HTTP_' + r.code);
  let hint = '';
  if (/has not been used|SERVICE_DISABLED|is disabled/i.test(msg)) hint = 'Cloud Firestore API not enabled in the GCP project this script is linked to — or script is still on its default hidden project. See references/01-setup-ownership.md §3-4.';
  else if (r.code === 403) hint = 'PERMISSION_DENIED: the account that deployed this script is not Owner/Editor of the Firebase project (or wrong project). See §1.';
  else if (r.code === 401) hint = 'UNAUTHENTICATED: missing oauthScopes in appsscript.json or not re-authorized after adding them. See §5.';
  else if (r.code === 404) hint = 'NOT_FOUND on database: wrong FIREBASE_PROJECT_ID / FIRESTORE_DATABASE_ID, or the database has not been created yet.';
  else if (r.code === 400 && /index/i.test(msg)) hint = 'Query needs an index — open the link in the message.';
  log_('error', rid, label + '.fail', { http: r.code, status: status, msg: msg, hint: hint });
  throw appErr_('DB_' + status, 'We could not save your data right now. Please try again shortly.', { http: r.code, status: status });
}

function toFsValue_(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'string') return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toFsValue_) } };
  if (typeof v === 'object') {
    const f = {};
    Object.keys(v).forEach(function (k) { f[k] = toFsValue_(v[k]); });
    return { mapValue: { fields: f } };
  }
  throw new Error('Unsupported Firestore value type: ' + typeof v);
}
function toFsFields_(obj) {
  const f = {};
  Object.keys(obj).forEach(function (k) { f[k] = toFsValue_(obj[k]); });
  return f;
}
function fromFsValue_(v) {
  if ('nullValue' in v) return null;
  if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('timestampValue' in v) return new Date(v.timestampValue);
  if ('stringValue' in v) return v.stringValue;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(fromFsValue_);
  if ('mapValue' in v) {
    const o = {}; const f = v.mapValue.fields || {};
    Object.keys(f).forEach(function (k) { o[k] = fromFsValue_(f[k]); });
    return o;
  }
  if ('referenceValue' in v) return v.referenceValue;
  return null;
}
function fromDoc_(d) {
  const o = {};
  const f = d.fields || {};
  Object.keys(f).forEach(function (k) { o[k] = fromFsValue_(f[k]); });
  o._id = String(d.name).split('/').pop();
  o._updateTime = d.updateTime;
  return o;
}
function toMs_(v) { return v instanceof Date ? v.getTime() : (v ? new Date(v).getTime() : 0); }

function fsGet_(rid, path) {
  const r = http_(rid, 'fs.get', fsBase_() + '/' + path, { method: 'get', headers: fsHeaders_() });
  if (r.code === 200) return fromDoc_(r.data);
  const msg = String(r.data && r.data.error && r.data.error.message || '');
  if (r.code === 404 && !/does not exist/i.test(msg)) return null;   // plain "document not found"
  return fsFail_(rid, 'fs.get', r);
}
function fsDelete_(rid, path) {
  const r = http_(rid, 'fs.delete', fsBase_() + '/' + path, { method: 'delete', headers: fsHeaders_() });
  if (r.code !== 200 && r.code !== 404) fsFail_(rid, 'fs.delete', r);
}
function fsCommit_(rid, writes) {
  const r = http_(rid, 'fs.commit', fsBase_() + ':commit', {
    method: 'post', contentType: 'application/json', headers: fsHeaders_(),
    payload: JSON.stringify({ writes: writes })
  });
  if (r.code !== 200) fsFail_(rid, 'fs.commit', r);
  return r.data;
}

/** One Firestore write. Only the keys in `obj` are touched (updateMask). */
function wUpdate_(path, obj, o) {
  o = o || {};
  const w = { update: { name: fsName_(path), fields: toFsFields_(obj) }, updateMask: { fieldPaths: Object.keys(obj) } };
  if (o.transforms && o.transforms.length) w.updateTransforms = o.transforms;
  if (o.exists !== undefined) w.currentDocument = { exists: o.exists };
  else if (o.updateTime) w.currentDocument = { updateTime: o.updateTime };
  return w;
}
function incr_(field, n) { return { fieldPath: field, increment: { integerValue: String(Math.trunc(n)) } }; }

// ───────────────────────────── auth ─────────────────────────────

function hex_(bytes) { return bytes.map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join(''); }

function authenticate_(b, rid) {
  if (prop_('AUTH_MODE') === 'guest') return { uid: 'guest', email: '', name: '' };
  const tok = String(b.idToken || '');
  if (!tok) throw appErr_('AUTH_MISSING', 'Please sign in to continue.');
  const ck = 'tok_' + hex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, tok));   // never cache the raw token
  const cache = CacheService.getScriptCache();
  const hit = cache.get(ck);
  if (hit) return JSON.parse(hit);
  const url = 'https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + encodeURIComponent(prop_('FIREBASE_WEB_API_KEY', true));
  const r = http_(rid, 'auth.lookup', url, { method: 'post', contentType: 'application/json', payload: JSON.stringify({ idToken: tok }) });
  if (r.code !== 200 || !r.data || !r.data.users || !r.data.users[0]) {
    const m = String(r.data && r.data.error && r.data.error.message || '');
    let hint = '';
    if (r.code === 403) hint = 'Web API key restricted (HTTP referrer?) — GAS calls have no referrer. Remove referrer restriction or use an API-restricted-only key.';
    log_('warn', rid, 'auth.failed', { http: r.code, msg: m, hint: hint });
    if (/TOKEN_EXPIRED|INVALID_ID_TOKEN|USER_NOT_FOUND|CREDENTIAL_TOO_OLD/i.test(m)) throw appErr_('AUTH_EXPIRED', 'Your session expired. Please sign in again.');
    throw appErr_('AUTH_FAILED', 'Could not verify your sign-in. Please sign in again.', { http: r.code });
  }
  const u = r.data.users[0];
  const out = { uid: u.localId, email: u.email || '', name: u.displayName || '' };
  cache.put(ck, JSON.stringify(out), 300);
  return out;
}

function assertAdmin_(auth) {
  const list = String(prop_('ADMIN_UIDS') || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
  if (list.indexOf(auth.uid) === -1) throw appErr_('FORBIDDEN', 'Not allowed.');
}

// ───────────────────────────── phone / countries ─────────────────────────────

function allowedCountries_() {
  const list = String(prop_('ALLOWED_COUNTRIES') || 'UG').split(',').map(function (s) { return s.trim().toUpperCase(); }).filter(function (c) { return COUNTRIES[c]; });
  return list.length ? list : ['UG'];
}

/** Accepts 0750…, 750…, +256750…, 256750…, 00256750… → { ok, e164, national } */
function normalizePhone_(raw, cc) {
  const c = COUNTRIES[cc];
  if (!c) return { ok: false, code: 'COUNTRY_NOT_SUPPORTED' };
  let d = String(raw || '').replace(/[^\d]/g, '');
  if (!d) return { ok: false, code: 'PHONE_EMPTY' };
  if (d.indexOf('00' + c.dial) === 0) d = d.slice(2 + c.dial.length);
  else if (d.indexOf(c.dial) === 0 && c.nsn.indexOf(d.length - c.dial.length) !== -1) d = d.slice(c.dial.length);
  else if (d.charAt(0) === '0') d = d.slice(1);
  if (c.nsn.indexOf(d.length) === -1) return { ok: false, code: 'PHONE_BAD_LENGTH' };
  if (d.charAt(0) === '0') return { ok: false, code: 'PHONE_BAD_FORMAT' };
  return { ok: true, e164: '+' + c.dial + d, national: d };
}

const PHONE_MSG = {
  PHONE_EMPTY: 'Enter the mobile money number to charge.',
  PHONE_BAD_LENGTH: 'That number has the wrong length. Check it and try again.',
  PHONE_BAD_FORMAT: 'That number does not look right. Check it and try again.',
  COUNTRY_NOT_SUPPORTED: 'Payments from this country are not available.'
};

// ───────────────────────────── MarzPay ─────────────────────────────

function marz_(rid, label, path, method, body) {
  const base = prop_('MARZPAY_API_BASE') || 'https://wallet.wearemarz.com/api/v1';
  const auth = 'Basic ' + Utilities.base64Encode(prop_('MARZPAY_API_KEY', true) + ':' + prop_('MARZPAY_API_SECRET', true));
  const opt = { method: method || 'get', headers: { Authorization: auth, Accept: 'application/json' }, contentType: 'application/json' };
  if (body) opt.payload = JSON.stringify(body);
  return http_(rid, label, base + path, opt);
}

const MARZ_ERR = {
  VALIDATION_ERROR: ['MARZ_VALIDATION', 'The payment details were rejected. Check your number and try again.'],
  INVALID_PHONE_NUMBER: ['MARZ_BAD_PHONE', 'This number cannot be used for payment. Use a registered mobile money number.'],
  DUPLICATE_REFERENCE: ['MARZ_DUPLICATE', 'Please try again.'],
  SERVICE_NOT_SUBSCRIBED: ['MARZ_NOT_SUBSCRIBED', 'Payments are temporarily unavailable. Please contact support.'],
  SERVICE_NOT_AVAILABLE: ['MARZ_UNAVAILABLE', 'Payments are temporarily unavailable. Please try again later.'],
  ACCOUNT_FROZEN: ['MARZ_FROZEN', 'Payments are temporarily unavailable. Please contact support.'],
  UNAUTHORIZED: ['MARZ_AUTH', 'Payments are temporarily unavailable. Please contact support.'],
  FORBIDDEN: ['MARZ_FORBIDDEN', 'Payments are temporarily unavailable. Please contact support.'],
  SERVER_ERROR: ['MARZ_SERVER', 'The payment provider had a problem. Please try again in a moment.']
};

function marzFail_(rid, label, r) {
  const d = r.data || {};
  const ec = String(d.error_code || '');
  log_('error', rid, label + '.fail', { http: r.code, error_code: ec, message: String(d.message || r.text || '').slice(0, 300), errorFields: d.errors ? Object.keys(d.errors) : [] });
  const m = MARZ_ERR[ec] || ['MARZ_ERROR', 'The payment could not be started. Please try again.'];
  throw appErr_(m[0], m[1], { http: r.code, error_code: ec });
}

/** Defensive: the exact response shape is verified by selfTestCollect() logs, not assumed. */
function extractMarz_(data) {
  const d = (data && data.data) || {};
  const col = d.collection || d.transaction || d;
  const uuid = (d.collection && d.collection.uuid) || d.uuid || (d.transaction && d.transaction.uuid) || null;
  const status = String(col.status || d.status || '').toLowerCase();
  return { uuid: uuid, status: status, provider: col.provider || d.provider || null, message: String(d.message || (data && data.message) || ''), shape: Object.keys(d) };
}
function mapStatus_(s) {
  if (['completed', 'success', 'successful', 'succeeded', 'paid'].indexOf(s) !== -1) return 'completed';
  if (['cancelled', 'canceled'].indexOf(s) !== -1) return 'cancelled';
  if (['failed', 'failure', 'error', 'declined', 'rejected', 'expired'].indexOf(s) !== -1) return 'failed';
  if (['pending', 'processing', 'initiated', 'queued', 'created', ''].indexOf(s) !== -1) return 'pending';
  return 'unknown';
}
function isFinal_(s) { return s === 'completed' || s === 'failed' || s === 'cancelled'; }

function callbackUrl_() {
  const token = prop_('WEBHOOK_TOKEN');
  const base = prop_('WEBAPP_EXEC_URL');
  if (!token || !base) return null;   // polling-only mode
  return base + '?hook=marzpay&t=' + encodeURIComponent(token);
}

// ───────────────────────────── settings & plans ─────────────────────────────

function getSettings_(rid) {
  const s = fsGet_(rid, 'config/settings') || {};
  return {
    freeCredits: s.freeCredits | 0,
    creditsPerUnit: s.creditsPerUnit === undefined ? 1 : s.creditsPerUnit,
    paywallEnabled: s.paywallEnabled === undefined ? true : !!s.paywallEnabled
  };
}

function getPlan_(rid, planId) {
  if (!planId) throw appErr_('PLAN_MISSING', 'Choose a plan first.');
  if (prop_('AUTH_MODE') === 'guest') {
    let all; try { all = JSON.parse(prop_('PLANS_JSON', true)); } catch (_) { throw appErr_('CONFIG_MISSING', 'Payments are temporarily unavailable.', { bad: 'PLANS_JSON' }); }
    const p = all[planId];
    if (!p) throw appErr_('PLAN_NOT_FOUND', 'That plan is no longer available.');
    return { id: planId, name: p.name, credits: p.credits | 0, price: p.price | 0, currency: p.currency, durationDays: p.durationDays | 0 };
  }
  const p = fsGet_(rid, 'plans/' + planId);
  if (!p || p.active === false) throw appErr_('PLAN_NOT_FOUND', 'That plan is no longer available.');
  return { id: planId, name: p.name, credits: p.credits | 0, price: p.price | 0, currency: p.currency, durationDays: p.durationDays | 0 };
}

// ───────────────────────────── users ─────────────────────────────

function ensureUser_(rid, auth) {
  let u = fsGet_(rid, 'users/' + auth.uid);
  if (u) return u;
  const free = getSettings_(rid).freeCredits;
  const now = new Date();
  const writes = [wUpdate_('users/' + auth.uid, { email: auth.email, displayName: auth.name, credits: free, lifetimeCredits: 0, activeRef: null, createdAt: now }, { exists: false })];
  if (free > 0) writes.push(wUpdate_('users/' + auth.uid + '/ledger/signup_bonus', { type: 'signup_bonus', delta: free, reference: 'signup', at: now }, { exists: false }));
  try { fsCommit_(rid, writes); }
  catch (e) { u = fsGet_(rid, 'users/' + auth.uid); if (u) return u; throw e; }   // lost a creation race
  log_('info', rid, 'user.created', { uid: auth.uid, free: free });
  return fsGet_(rid, 'users/' + auth.uid);
}

// ───────────────────────────── actions ─────────────────────────────

function payConfig_(b, rid) {
  const countries = allowedCountries_().map(function (cc) { return { code: cc, dial: COUNTRIES[cc].dial, name: COUNTRIES[cc].name, nsn: COUNTRIES[cc].nsn }; });
  return { mode: prop_('AUTH_MODE') === 'guest' ? 'guest' : 'account', countries: countries, version: VERSION };
}

function accountInit_(b, rid) {
  const auth = authenticate_(b, rid);
  if (auth.uid === 'guest') return { guest: true };
  const u = ensureUser_(rid, auth);
  return { credits: u.credits | 0 };
}

function paymentCreate_(b, rid) {
  const guest = prop_('AUTH_MODE') === 'guest';
  const auth = authenticate_(b, rid);
  const cc = String(b.country || '').toUpperCase();
  if (allowedCountries_().indexOf(cc) === -1) throw appErr_('COUNTRY_NOT_SUPPORTED', PHONE_MSG.COUNTRY_NOT_SUPPORTED, { cc: cc });
  const ph = normalizePhone_(b.phone, cc);
  if (!ph.ok) throw appErr_(ph.code, PHONE_MSG[ph.code] || 'Check the phone number.', { cc: cc });
  const plan = getPlan_(rid, String(b.planId || ''));
  const cur = COUNTRIES[cc].cur;
  if (cur && cur.indexOf(plan.currency) === -1) throw appErr_('PLAN_CURRENCY_MISMATCH', 'This plan cannot be paid from the selected country.', { cc: cc, planCur: plan.currency });
  if (!(plan.price > 0)) throw appErr_('PLAN_BAD_PRICE', 'That plan is not available right now.', { plan: plan.id });

  let user = null;
  if (!guest) {
    user = ensureUser_(rid, auth);
    if (user.activeRef) {
      const prev = fsGet_(rid, 'payments/' + user.activeRef);
      if (prev && prev.uid === auth.uid && !isFinal_(prev.status)) {
        const age = Date.now() - toMs_(prev.createdAt);
        if ((prev.status === 'pending' || prev.status === 'initiating') && age < WAIT_MS_STALE) {
          throw appErr_('PENDING_EXISTS', 'You already have a payment waiting for approval on your phone.', { prev: prev._id }, { reference: prev._id });
        }
        syncPayment_(rid, prev, 'create-precheck');   // stale / user-cancelled: one last look at MarzPay before moving on
      }
    }
  }

  const reference = Utilities.getUuid();   // UUID v4 — MarzPay requires a unique v4 per collection
  const now = new Date();
  const rec = {
    uid: auth.uid, email: auth.email, phone: ph.e164, country: cc, planId: plan.id, planName: plan.name,
    amount: plan.price, currency: plan.currency, credits: plan.credits, durationDays: plan.durationDays,
    status: 'initiating', marzUuid: null, provider: null, failureReason: null, createdAt: now, updatedAt: now
  };
  if (!guest) fsCommit_(rid, [wUpdate_('payments/' + reference, rec, { exists: false })]);

  const body = {
    amount: plan.price, phone_number: ph.e164, reference: reference, country: cc,
    description: ((prop_('APP_NAME') || 'Payment') + ' - ' + plan.name).slice(0, 255),
    metadata: [{ planId: plan.id }]
  };
  const cb = callbackUrl_();
  if (cb) body.callback_url = cb;

  log_('info', rid, 'marz.collect.request', { reference: reference, cc: cc, phone: ph.e164, amount: plan.price, plan: plan.id, webhook: !!cb });
  const r = marz_(rid, 'marz.collect', '/collect-money', 'post', body);
  const ok = r.code >= 200 && r.code < 300 && r.data && r.data.status !== 'error';
  if (!ok) {
    if (!guest) fsCommit_(rid, [wUpdate_('payments/' + reference, { status: 'failed', failureReason: 'marz_create_failed', updatedAt: new Date() }, { exists: true })]);
    marzFail_(rid, 'marz.collect', r);
  }
  const x = extractMarz_(r.data);
  log_('info', rid, 'marz.collect.response', { http: r.code, uuid: x.uuid, status: x.status, shape: x.shape });
  if (!x.uuid) log_('warn', rid, 'marz.collect.no_uuid', { shape: x.shape });   // adjust extractMarz_ using this log

  let handle = reference;
  if (guest) {
    handle = x.uuid || reference;
    CacheService.getScriptCache().put('g:' + handle, plan.id, 21600);   // 6h max; see references for the replay caveat
  } else {
    const writes = [wUpdate_('payments/' + reference, { status: 'pending', marzUuid: x.uuid, provider: x.provider, updatedAt: new Date() }, { exists: true })];
    writes.push(wUpdate_('users/' + auth.uid, { activeRef: reference }));
    fsCommit_(rid, writes);
  }
  return { reference: handle, status: 'pending', maskedPhone: maskPhone_(ph.e164), amount: plan.price, currency: plan.currency, credits: plan.credits, planName: plan.name };
}

function paymentStatus_(b, rid) {
  const auth = authenticate_(b, rid);
  const ref = String(b.reference || '');
  if (!ref) throw appErr_('BAD_REQUEST', 'Invalid request.');
  if (auth.uid === 'guest') return guestStatus_(rid, ref);
  const p = fsGet_(rid, 'payments/' + ref);
  if (!p || p.uid !== auth.uid) throw appErr_('PAYMENT_NOT_FOUND', 'We could not find that payment.');
  let cur = p;
  if (!isFinal_(p.status)) cur = throttledSync_(rid, p, 'status');
  return statusView_(cur);
}

function statusView_(p) {
  let s = p.status;
  if (s === 'initiating' || s === 'user_cancelled' || s === 'timeout') s = (s === 'user_cancelled' ? 'cancelled' : 'pending');
  return { status: s, creditsAdded: p.status === 'completed' ? (p.credits | 0) : 0, message: p.status === 'failed' ? (p.failureReason || '') : '' };
}

function throttledSync_(rid, p, why) {
  const cache = CacheService.getScriptCache();
  const k = 'sync_' + p._id;
  if (cache.get(k)) return p;               // checked <3s ago; avoid hammering MarzPay
  cache.put(k, '1', 3);
  return syncPayment_(rid, p, why);
}

function syncPayment_(rid, p, why) {
  if (!p.marzUuid) return p;
  const r = marz_(rid, 'marz.status', '/collect-money/' + encodeURIComponent(p.marzUuid), 'get');
  if (r.code !== 200) { log_('warn', rid, 'marz.status.http', { http: r.code, why: why }); return p; }
  const x = extractMarz_(r.data);
  const m = mapStatus_(x.status);
  log_('info', rid, 'marz.status', { ref: p._id, raw: x.status, mapped: m, why: why, shape: x.shape });
  if (m === 'unknown') log_('warn', rid, 'marz.status.unknown', { raw: x.status });
  if (m === 'pending' || m === 'unknown') return p;
  return finalize_(rid, p._id, m, { provider: x.provider, message: x.message });
}

function finalize_(rid, ref, mapped, info) {
  const lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    const p = fsGet_(rid, 'payments/' + ref);
    if (!p) throw appErr_('PAYMENT_NOT_FOUND', 'We could not find that payment.');
    if (p.status === 'completed') return p;       // idempotent: second webhook / poll / reconcile is a no-op
    const now = new Date();
    const user = fsGet_(rid, 'users/' + p.uid);
    const clearActive = user && user.activeRef === ref;

    if (mapped === 'completed') {
      if (p.status === 'user_cancelled' || p.status === 'timeout' || p.status === 'failed') log_('warn', rid, 'late_credit', { ref: ref, was: p.status });
      const dur = Math.max(0, Math.round((now.getTime() - toMs_(p.createdAt)) / 1000));
      const uUpd = { lastTopupAt: now };
      if (clearActive) uUpd.activeRef = null;
      if (p.durationDays > 0) {
        const base = Math.max(now.getTime(), user && user.accessUntil ? toMs_(user.accessUntil) : 0);
        uUpd.accessUntil = new Date(base + p.durationDays * 86400000);
      }
      const writes = [
        wUpdate_('payments/' + ref, { status: 'completed', completedAt: now, updatedAt: now, durationSec: dur, provider: info.provider || p.provider || null }, { exists: true }),
        wUpdate_('users/' + p.uid, uUpd, { transforms: [incr_('credits', p.credits | 0), incr_('lifetimeCredits', p.credits | 0)] }),
        wUpdate_('users/' + p.uid + '/ledger/topup_' + ref, { type: 'topup', delta: p.credits | 0, reference: ref, planId: p.planId, amount: p.amount, currency: p.currency, at: now }, { exists: false })
      ];
      try { fsCommit_(rid, writes); }
      catch (e) {
        if (e.code === 'DB_ALREADY_EXISTS') {   // ledger row exists → credits were already applied earlier
          log_('warn', rid, 'credit.already_applied', { ref: ref });
          fsCommit_(rid, [wUpdate_('payments/' + ref, { status: 'completed', updatedAt: now }, { exists: true })]);
        } else throw e;
      }
      log_('info', rid, 'credit.applied', { ref: ref, uid: p.uid, credits: p.credits, durSec: dur });
    } else {
      const writes = [wUpdate_('payments/' + ref, { status: mapped, failureReason: String(info.message || mapped).slice(0, 200), updatedAt: now }, { exists: true })];
      if (clearActive) writes.push(wUpdate_('users/' + p.uid, { activeRef: null }));
      fsCommit_(rid, writes);
      log_('info', rid, 'payment.closed', { ref: ref, status: mapped });
    }
    return fsGet_(rid, 'payments/' + ref);
  } finally {
    lock.releaseLock();
  }
}

function paymentCancel_(b, rid) {
  const auth = authenticate_(b, rid);
  const ref = String(b.reference || '');
  if (auth.uid === 'guest') return { status: 'cancelled' };
  const p = fsGet_(rid, 'payments/' + ref);
  if (!p || p.uid !== auth.uid) throw appErr_('PAYMENT_NOT_FOUND', 'We could not find that payment.');
  if (isFinal_(p.status)) return statusView_(p);
  const st = b.reason === 'timeout' ? 'timeout' : 'user_cancelled';
  fsCommit_(rid, [wUpdate_('payments/' + ref, { status: st, updatedAt: new Date() }, { exists: true })]);
  log_('info', rid, 'payment.user_cancel', { ref: ref, as: st });
  // activeRef stays set on purpose: if the telecom still completes it, reconcile credits it later.
  return { status: 'cancelled' };
}

function paymentReconcile_(b, rid) {
  const auth = authenticate_(b, rid);
  if (auth.uid === 'guest') return { status: 'none' };
  const u = fsGet_(rid, 'users/' + auth.uid);
  if (!u || !u.activeRef) return { status: 'none' };
  const p = fsGet_(rid, 'payments/' + u.activeRef);
  if (!p || p.uid !== auth.uid) return { status: 'none' };
  const cur = isFinal_(p.status) ? p : syncPayment_(rid, p, 'reconcile');
  return Object.assign(statusView_(cur), { reference: cur._id, reconciled: true });
}

function creditsSpend_(b, rid) {
  const auth = authenticate_(b, rid);
  const requestId = String(b.requestId || '');
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(requestId)) throw appErr_('BAD_REQUEST', 'Invalid request.');
  const units = Math.floor(Number(b.units));
  if (!(units >= 0 && units <= 100000)) throw appErr_('BAD_REQUEST', 'Invalid request.');
  const s = getSettings_(rid);
  if (!s.paywallEnabled) return { cost: 0, charged: false, paywall: false };
  const cost = units * s.creditsPerUnit;
  const ledgerPath = 'users/' + auth.uid + '/ledger/spend_' + requestId;
  const dup = fsGet_(rid, ledgerPath);
  if (dup) return { cost: -dup.delta, charged: false, unchanged: true };   // same requestId → never charge twice
  if (cost <= 0) return { cost: 0, charged: false };
  ensureUser_(rid, auth);
  for (let i = 0; i < 3; i++) {
    const u = fsGet_(rid, 'users/' + auth.uid);
    const bal = u.credits | 0;
    if (bal < cost) throw appErr_('INSUFFICIENT_CREDITS', 'Not enough credits.', { bal: bal, cost: cost }, { required: cost, balance: bal, shortfall: cost - bal });
    try {
      fsCommit_(rid, [
        wUpdate_('users/' + auth.uid, {}, { updateTime: u._updateTime, transforms: [incr_('credits', -cost)] }),
        wUpdate_(ledgerPath, { type: 'spend', delta: -cost, units: units, reference: requestId, at: new Date() }, { exists: false })
      ]);
      log_('info', rid, 'credits.spent', { uid: auth.uid, cost: cost });
      return { cost: cost, charged: true, balance: bal - cost };
    } catch (e) {
      if (e.code === 'DB_FAILED_PRECONDITION' || e.code === 'DB_ABORTED') { log_('warn', rid, 'credits.retry', { i: i }); continue; }
      throw e;
    }
  }
  throw appErr_('BUSY', 'Busy right now. Please try again.');
}

function adminAdjust_(b, rid) {
  const auth = authenticate_(b, rid);
  assertAdmin_(auth);
  const uid = String(b.targetUid || '');
  const delta = Math.trunc(Number(b.delta));
  const reason = String(b.reason || '').slice(0, 200);
  if (!uid || !delta || !reason) throw appErr_('BAD_REQUEST', 'targetUid, non-zero delta and reason are required.');
  fsCommit_(rid, [
    wUpdate_('users/' + uid, {}, { exists: true, transforms: [incr_('credits', delta)] }),
    wUpdate_('users/' + uid + '/ledger/adj_' + Utilities.getUuid(), { type: 'adjust', delta: delta, reason: reason, by: auth.uid, at: new Date() }, { exists: false })
  ]);
  log_('info', rid, 'admin.adjust', { by: auth.uid, uid: uid, delta: delta });
  return { adjusted: delta };
}

// ───────────────────────────── webhook (optional path) ─────────────────────────────

function handleWebhook_(e, rid) {
  const t = prop_('WEBHOOK_TOKEN');
  if (!t || String(e.parameter.t || '') !== t) { log_('warn', rid, 'webhook.rejected', { reason: 'bad or missing token' }); return json_({ ok: false }); }
  let payload = {};
  try { payload = JSON.parse(e.postData.contents); } catch (_) { log_('warn', rid, 'webhook.bad_json'); return json_({ ok: true, ignored: true }); }
  const ref = (payload.transaction && payload.transaction.reference) || payload.reference || null;
  log_('info', rid, 'webhook.received', { ref: ref, event: payload.event_type || null, keys: Object.keys(payload) });   // keys help verify the real shape
  if (!ref) return json_({ ok: true, ignored: true });
  const p = fsGet_(rid, 'payments/' + ref);
  if (p) syncPayment_(rid, p, 'webhook');   // NEVER trust the payload: re-fetch the truth from MarzPay
  return json_({ ok: true });
}

// ───────────────────────────── guest mode (no accounts, no Firestore) ─────────────────────────────

function guestStatus_(rid, handle) {
  const r = marz_(rid, 'marz.status', '/collect-money/' + encodeURIComponent(handle), 'get');
  if (r.code !== 200) return { status: 'pending' };
  const x = extractMarz_(r.data);
  const m = mapStatus_(x.status);
  if (m !== 'completed') return { status: m === 'unknown' ? 'pending' : m };
  const planId = CacheService.getScriptCache().get('g:' + handle);
  if (!planId) return { status: 'failed', message: 'Receipt expired. Contact support with your payment reference.' };
  const plan = getPlan_(rid, planId);
  const receipt = signReceipt_({ h: handle, p: plan.id, c: plan.credits, iat: Date.now() });
  return { status: 'completed', creditsAdded: plan.credits, receipt: receipt };
}
function signReceipt_(payload) {
  const b64 = Utilities.base64EncodeWebSafe(JSON.stringify(payload));
  const sig = Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(b64, prop_('RECEIPT_SECRET', true)));
  return b64 + '.' + sig;
}
function receiptVerify_(b, rid) {
  const parts = String(b.receipt || '').split('.');
  if (parts.length !== 2) return { valid: false };
  const sig = Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(parts[0], prop_('RECEIPT_SECRET', true)));
  if (sig !== parts[1]) return { valid: false };
  const payload = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(parts[0])).getDataAsString());
  return { valid: true, planId: payload.p, credits: payload.c };
}

// ═════════════════════════ EDITOR-RUN HELPERS (not web endpoints) ═════════════════════════
// Run these from the Apps Script editor (select function → Run). Output: Executions panel / Logs.
// They are the "cashless test ladder" — see references/06-testing-and-dev-number.md.

function authorizeOnce() {
  // Forces the OAuth consent screen for the manifest scopes. Run once after every scope change.
  const rid = 'auth0000';
  fsGet_(rid, 'config/settings');
  UrlFetchApp.fetch('https://wallet.wearemarz.com', { muteHttpExceptions: true });
  log_('info', rid, 'authorizeOnce.ok');
}

function selfTestConfig() {
  const rid = 'cfg00000';
  const props = PropertiesService.getScriptProperties().getProperties();
  const need = ['FIREBASE_PROJECT_ID', 'MARZPAY_API_KEY', 'MARZPAY_API_SECRET'];
  if (props.AUTH_MODE !== 'guest') need.push('FIREBASE_WEB_API_KEY');
  const missing = need.filter(function (k) { return !props[k]; });
  const present = Object.keys(PROP_DOC).filter(function (k) { return !!props[k]; });
  log_('info', rid, 'selfTestConfig', { missingRequired: missing, presentNames: present, allowedCountries: allowedCountries_(), webhook: !!callbackUrl_() });
  if (missing.length) throw new Error('Missing required Script Properties: ' + missing.join(', '));
}

function selfTestFirestore() {
  const rid = 'fs000000';
  const path = '_selftest/ping';
  fsCommit_(rid, [wUpdate_(path, { at: new Date(), n: 1 })]);
  const d = fsGet_(rid, path);
  if (!d || d.n !== 1) throw new Error('Firestore read-after-write failed');
  fsDelete_(rid, path);
  log_('info', rid, 'selfTestFirestore.ok', { note: 'GAS can read+write+delete Firestore. Ownership/API/scopes are fine.' });
}

/** Proves idempotent crediting with ZERO money: fake payment → finalize twice → credits applied once. */
function selfTestCredit() {
  const rid = 'cr000000';
  const uid = 'selftest-user';
  const ref = 'selftest-' + Utilities.getUuid().slice(0, 8);
  const now = new Date();
  fsCommit_(rid, [
    wUpdate_('users/' + uid, { credits: 0, lifetimeCredits: 0, activeRef: ref, createdAt: now }),
    wUpdate_('payments/' + ref, { uid: uid, status: 'pending', credits: 7, planId: 'selftest', amount: 1, currency: 'UGX', durationDays: 0, createdAt: now, updatedAt: now }, { exists: false })
  ]);
  finalize_(rid, ref, 'completed', {});
  finalize_(rid, ref, 'completed', {});
  const u = fsGet_(rid, 'users/' + uid);
  const ok = u.credits === 7;
  log_(ok ? 'info' : 'error', rid, 'selfTestCredit.' + (ok ? 'ok' : 'FAILED'), { credits: u.credits, expected: 7 });
  fsDelete_(rid, 'users/' + uid + '/ledger/topup_' + ref);
  fsDelete_(rid, 'payments/' + ref);
  fsDelete_(rid, 'users/' + uid);
  if (!ok) throw new Error('Credits applied ' + u.credits + ' times 1 — expected exactly 7');
}

/** No money moves. Confirms MarzPay credentials + subscriptions. */
function selfTestMarzReadOnly() {
  const rid = 'mz000000';
  const a = marz_(rid, 'marz.services', '/services', 'get');
  log_('info', rid, 'GET /services', { http: a.code, keys: a.data ? Object.keys(a.data) : null, preview: String(a.text).slice(0, 400) });
  const b = marz_(rid, 'marz.collect.services', '/collect-money/services', 'get');
  log_('info', rid, 'GET /collect-money/services', { http: b.code, preview: String(b.text).slice(0, 600) });
  if (a.code === 401 || b.code === 401) throw new Error('MarzPay rejected the key/secret (401). Check Script Properties.');
}

/**
 * Real push to DEV_TEST_PHONE for DEV_TEST_AMOUNT (default 500). Two ways to run it:
 *   - do NOT enter the PIN  → verifies push arrives + cancel/timeout paths (no money moves)
 *   - enter the PIN         → verifies the full completed path (costs the test amount)
 */
function selfTestCollect() {
  const rid = 'col00000';
  const cc = (prop_('DEV_TEST_COUNTRY') || 'UG').toUpperCase();
  const ph = normalizePhone_(prop_('DEV_TEST_PHONE', true), cc);
  if (!ph.ok) throw new Error('DEV_TEST_PHONE invalid: ' + ph.code);
  const ref = Utilities.getUuid();
  const body = { amount: Number(prop_('DEV_TEST_AMOUNT') || 500), phone_number: ph.e164, reference: ref, country: cc, description: 'selfTestCollect' };
  const cb = callbackUrl_(); if (cb) body.callback_url = cb;
  const r = marz_(rid, 'marz.collect', '/collect-money', 'post', body);
  const x = extractMarz_(r.data);
  log_('info', rid, 'collect.created', { http: r.code, uuid: x.uuid, status: x.status, shape: x.shape, preview: String(r.text).slice(0, 500) });
  if (!x.uuid) throw new Error('No uuid found in create response — read the preview in the log and adjust extractMarz_().');
  let last = '';
  for (let i = 0; i < 24; i++) {          // ~2 minutes
    Utilities.sleep(5000);
    const s = marz_(rid, 'marz.status', '/collect-money/' + encodeURIComponent(x.uuid), 'get');
    const y = extractMarz_(s.data);
    if (y.status !== last) { log_('info', rid, 'collect.status', { t: (i + 1) * 5, raw: y.status, mapped: mapStatus_(y.status), preview: String(s.text).slice(0, 500) }); last = y.status; }
    if (isFinal_(mapStatus_(y.status))) break;
  }
  log_('info', rid, 'selfTestCollect.end', { lastRaw: last });
}

/** Creates config/settings + one sample plan. Safe to re-run (never overwrites). Edit values first. */
function seedFirestore() {
  const rid = 'seed0000';
  const now = new Date();
  const items = [
    ['config/settings', { freeCredits: 0, creditsPerUnit: 1, paywallEnabled: true }],
    ['plans/plan_200', { name: '200 Credits', credits: 200, price: 2500, currency: 'UGX', active: true, sortOrder: 1, updatedAt: now, updatedBy: 'seed' }]
  ];
  items.forEach(function (it) {
    try { fsCommit_(rid, [wUpdate_(it[0], it[1], { exists: false })]); log_('info', rid, 'seed.created', { path: it[0] }); }
    catch (e) { if (e.code === 'DB_ALREADY_EXISTS') log_('info', rid, 'seed.exists', { path: it[0] }); else throw e; }
  });
}
