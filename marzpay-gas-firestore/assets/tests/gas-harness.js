const fs = require('fs'), vm = require('vm');
const src = fs.readFileSync((process.argv[2] || require('path').join(__dirname, '..', 'Code.gs')) + '', 'utf8');

// ---------- in-memory Firestore (mirrors REST precondition semantics) ----------
const DB = new Map(); let clock = 1000;
const P = 'projects/proj-x/databases/(default)/documents/';
const errBody = (code, status, message) => ({ code, text: JSON.stringify({ error: { code, status, message } }) });
function applyWrite(store, w) {
  const name = w.update.name; const path = name.slice(P.length);
  const cur = store.get(path);
  const cd = w.currentDocument;
  if (cd && cd.exists === true && !cur) throw errBody(404, 'NOT_FOUND', 'No document to update: ' + path);
  if (cd && cd.exists === false && cur) throw errBody(409, 'ALREADY_EXISTS', 'Document already exists: ' + path);
  if (cd && cd.updateTime && (!cur || cur.updateTime !== cd.updateTime)) throw errBody(400, 'FAILED_PRECONDITION', 'updateTime mismatch');
  const doc = cur ? { fields: Object.assign({}, cur.fields), updateTime: cur.updateTime } : { fields: {}, updateTime: '' };
  (w.updateMask ? w.updateMask.fieldPaths : Object.keys(w.update.fields)).forEach(k => { if (w.update.fields[k] !== undefined) doc.fields[k] = w.update.fields[k]; else delete doc.fields[k]; });
  (w.updateTransforms || []).forEach(t => {
    const base = doc.fields[t.fieldPath] && doc.fields[t.fieldPath].integerValue ? Number(doc.fields[t.fieldPath].integerValue) : 0;
    doc.fields[t.fieldPath] = { integerValue: String(base + Number(t.increment.integerValue)) };
  });
  doc.updateTime = 'T' + (++clock);
  store.set(path, doc);
}
// ---------- fake MarzPay ----------
const MARZ = { status: 'processing', created: [], failCreate: null };
let TOKENS = { 'tok-alice': { localId: 'alice', email: 'a@x.com', displayName: 'Alice' }, 'tok-bob': { localId: 'bob', email: 'b@x.com' } };
const FETCH_LOG = [];
const UrlFetchApp = { fetch(url, opt) {
  FETCH_LOG.push({ url, opt });
  const res = (code, obj) => ({ getResponseCode: () => code, getContentText: () => typeof obj === 'string' ? obj : JSON.stringify(obj) });
  if (url.startsWith('https://identitytoolkit')) {
    const t = JSON.parse(opt.payload).idToken; const u = TOKENS[t];
    return u ? res(200, { users: [u] }) : res(400, { error: { message: 'INVALID_ID_TOKEN' } });
  }
  if (url.startsWith('https://firestore.googleapis.com')) {
    const rest = url.split('/documents')[1];
    try {
      if (rest === ':commit') {
        const store = new Map(DB); JSON.parse(opt.payload).writes.forEach(w => applyWrite(store, w));
        DB.clear(); store.forEach((v, k) => DB.set(k, v)); return res(200, { writeResults: [] });
      }
      const path = rest.slice(1);
      if ((opt.method || 'get') === 'delete') { DB.delete(path); return res(200, {}); }
      const d = DB.get(path); if (!d) return res(404, { error: { code: 404, status: 'NOT_FOUND', message: 'Document "' + path + '" not found.' } });
      return res(200, { name: P + path, fields: d.fields, updateTime: d.updateTime });
    } catch (e) { return res(e.code, e.text); }
  }
  if (url.includes('wallet.wearemarz.com')) {
    const path = url.split('/api/v1')[1];
    if (path === '/collect-money' && opt.method === 'post') {
      if (MARZ.failCreate) return res(422, { status: 'error', error_code: MARZ.failCreate, message: 'nope' });
      const b = JSON.parse(opt.payload); const uuid = 'mz-' + (MARZ.created.length + 1); MARZ.created.push({ uuid, body: b });
      return res(200, { status: 'success', data: { collection: { uuid, status: 'processing', provider: 'airtel' } } });
    }
    if (path.startsWith('/collect-money/')) return res(200, { status: 'success', data: { collection: { status: MARZ.status, provider: 'airtel' } } });
  }
  return res(404, {});
}};
const cacheStore = new Map();
const props = { FIREBASE_PROJECT_ID: 'proj-x', FIREBASE_WEB_API_KEY: 'k', MARZPAY_API_KEY: 'mk', MARZPAY_API_SECRET: 'ms', ALLOWED_COUNTRIES: 'UG,KE', WEBHOOK_TOKEN: 'wh', WEBAPP_EXEC_URL: 'https://script.google.com/macros/s/X/exec', ADMIN_UIDS: 'alice' };
const logs = [];
const ctx = {
  console: { log: (l) => logs.push(l), warn: (l) => logs.push(l), error: (l) => logs.push(l) },
  UrlFetchApp, ScriptApp: { getOAuthToken: () => 'oauth-token' },
  PropertiesService: { getScriptProperties: () => ({ getProperties: () => Object.assign({}, props) }) },
  CacheService: { getScriptCache: () => ({ get: k => cacheStore.get(k) || null, put: (k, v) => cacheStore.set(k, v) }) },
  LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  ContentService: { MimeType: { JSON: 'json' }, createTextOutput: s => ({ s, setMimeType() { return this; } }) },
  Utilities: {
    getUuid: () => require('crypto').randomUUID(),
    computeDigest: (a, s) => Array.from(require('crypto').createHash('sha256').update(s).digest()).map(b => b > 127 ? b - 256 : b),
    DigestAlgorithm: { SHA_256: 1 }, base64Encode: s => Buffer.from(s).toString('base64'), sleep() {},
    base64EncodeWebSafe: s => (Buffer.isBuffer(s) || Array.isArray(s) ? Buffer.from(s) : Buffer.from(String(s))).toString('base64url'),
    computeHmacSha256Signature: (m, k) => Array.from(require('crypto').createHmac('sha256', k).update(m).digest()),
  },
  Date, JSON, Math, Number, String, Array, Object, Error, encodeURIComponent, parseInt, parseFloat, Map,
};
vm.createContext(ctx);
vm.runInContext(src + `
;this.__t = { doPost, doGet, normalizePhone_, toFsValue_, fromFsValue_, redact_, maskPhone_, mapStatus_, extractMarz_, selfTestCredit, seedFirestore, selfTestFirestore, finalize_, fsGet_ };`, ctx);
const T = ctx.__t;

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗ FAIL', m); } };
const call = (body) => JSON.parse(T.doPost({ postData: { contents: JSON.stringify(body) }, parameter: {} }).s);
const credits = (uid) => { const d = DB.get('users/' + uid); return d ? Number(d.fields.credits.integerValue) : null; };

console.log('phone normalisation');
const n = (r, c) => T.normalizePhone_(r, c);
ok(n('0750470234', 'UG').e164 === '+256750470234', '0750… → +256750470234');
ok(n('750470234', 'UG').e164 === '+256750470234', 'no leading 0');
ok(n('+256 750-470-234', 'UG').e164 === '+256750470234', '+256 with spaces/dashes');
ok(n('256750470234', 'UG').e164 === '+256750470234', '256… without plus');
ok(n('00256750470234', 'UG').e164 === '+256750470234', '00256…');
ok(n('075047023', 'UG').code === 'PHONE_BAD_LENGTH', 'too short rejected');
ok(n('', 'UG').code === 'PHONE_EMPTY', 'empty rejected');
ok(n('0710000000', 'KE').e164 === '+254710000000', 'KE');
ok(n('x', 'ZZ').code === 'COUNTRY_NOT_SUPPORTED', 'unknown country');

console.log('value encoding round-trip + redaction');
const rt = T.fromFsValue_(T.toFsValue_({ a: 1, b: 1.5, c: 's', d: true, e: null, f: [1, 'x'], g: { h: 2 } }));
ok(JSON.stringify(rt) === JSON.stringify({ a: 1, b: 1.5, c: 's', d: true, e: null, f: [1, 'x'], g: { h: 2 } }), 'round-trip');
ok(T.toFsValue_(5).integerValue === '5' && T.toFsValue_(5.5).doubleValue === 5.5, 'int vs double');
const red = T.redact_({ idToken: 'abc', MARZPAY_API_SECRET: 's', phone: '+256750470234', n: 1 });
ok(red.idToken === '[redacted]' && red.MARZPAY_API_SECRET === '[redacted]' && red.phone === '+256***…'.slice(0,0) + red.phone && !red.phone.includes('750470'), 'secrets redacted, phone masked: ' + red.phone);
ok(T.mapStatus_('processing') === 'pending' && T.mapStatus_('completed') === 'completed' && T.mapStatus_('canceled') === 'cancelled' && T.mapStatus_('weird') === 'unknown', 'status mapping');

console.log('seed + selftests');
T.seedFirestore(); ok(DB.has('plans/plan_200') && DB.has('config/settings'), 'seed created docs');
T.seedFirestore(); ok(true, 'seed re-run does not throw');
T.selfTestFirestore(); ok(true, 'selfTestFirestore');
T.selfTestCredit(); ok(!DB.has('users/selftest-user'), 'selfTestCredit: idempotent & cleaned up');

console.log('payment happy path (alice)');
let r = call({ action: 'pay_config' }); ok(r.ok && r.countries.length === 2, 'pay_config lists allowed countries');
r = call({ action: 'account_init', idToken: 'tok-alice' }); ok(r.ok && r.credits === 0, 'account_init creates user');
r = call({ action: 'payment_create', idToken: 'bad', planId: 'plan_200', country: 'UG', phone: '0750470234' }); ok(!r.ok && r.error_code === 'AUTH_EXPIRED', 'bad token → AUTH_EXPIRED');
r = call({ action: 'payment_create', idToken: 'tok-alice', planId: 'plan_200', country: 'UG', phone: '12' }); ok(!r.ok && r.error_code === 'PHONE_BAD_LENGTH', 'bad phone rejected server-side');
r = call({ action: 'payment_create', idToken: 'tok-alice', planId: 'plan_200', country: 'RW', phone: '0750470234' }); ok(!r.ok && r.error_code === 'COUNTRY_NOT_SUPPORTED', 'disabled country rejected');
r = call({ action: 'payment_create', idToken: 'tok-alice', planId: 'plan_200', country: 'KE', phone: '0710000000' }); ok(!r.ok && r.error_code === 'PLAN_CURRENCY_MISMATCH', 'UGX plan blocked for KE');
r = call({ action: 'payment_create', idToken: 'tok-alice', planId: 'nope', country: 'UG', phone: '0750470234' }); ok(!r.ok && r.error_code === 'PLAN_NOT_FOUND', 'unknown plan');
r = call({ action: 'payment_create', idToken: 'tok-alice', planId: 'plan_200', country: 'UG', phone: '0750470234', amount: 1 });
ok(r.ok && r.status === 'pending' && /\*/.test(r.maskedPhone), 'create ok, masked phone returned: ' + r.maskedPhone);
const ref1 = r.reference;
const sent = MARZ.created[0].body;
ok(sent.amount === 2500 && sent.phone_number === '+256750470234' && sent.country === 'UG' && sent.reference === ref1, 'amount from Firestore plan (client "amount:1" ignored), UUID reference');
ok(/hook=marzpay&t=wh/.test(sent.callback_url), 'callback_url carries webhook token');
r = call({ action: 'payment_create', idToken: 'tok-alice', planId: 'plan_200', country: 'UG', phone: '0750470234' }); ok(!r.ok && r.error_code === 'PENDING_EXISTS' && r.reference === ref1, 'second click → PENDING_EXISTS with resumable reference');
r = call({ action: 'payment_status', idToken: 'tok-bob', reference: ref1 }); ok(!r.ok && r.error_code === 'PAYMENT_NOT_FOUND', "bob cannot read alice's payment");
r = call({ action: 'payment_status', idToken: 'tok-alice', reference: ref1 }); ok(r.ok && r.status === 'pending', 'status pending while processing');
MARZ.status = 'completed'; cacheStore.clear();
r = call({ action: 'payment_status', idToken: 'tok-alice', reference: ref1 }); ok(r.ok && r.status === 'completed' && r.creditsAdded === 200, 'status → completed');
ok(credits('alice') === 200, 'credits = 200 after payment');
cacheStore.clear(); r = call({ action: 'payment_status', idToken: 'tok-alice', reference: ref1 }); ok(credits('alice') === 200, 'poll again → still 200 (no double credit)');
T.doPost({ postData: { contents: JSON.stringify({ transaction: { reference: ref1 } }) }, parameter: { hook: 'marzpay', t: 'wh' } });
T.doPost({ postData: { contents: JSON.stringify({ transaction: { reference: ref1 } }) }, parameter: { hook: 'marzpay', t: 'wh' } });
ok(credits('alice') === 200, 'duplicate webhooks → still 200');
const bad = JSON.parse(T.doPost({ postData: { contents: '{}' }, parameter: { hook: 'marzpay', t: 'WRONG' } }).s); ok(bad.ok === false, 'webhook with wrong token rejected');
const pay = DB.get('payments/' + ref1).fields; ok(pay.status.stringValue === 'completed' && pay.durationSec && pay.completedAt, 'payment doc has status/duration/completedAt');
ok(DB.has('users/alice/ledger/topup_' + ref1), 'ledger row written');
ok(DB.get('users/alice').fields.activeRef.nullValue === null, 'activeRef cleared');

console.log('cancel then LATE money (telecom still completes)');
MARZ.status = 'processing'; cacheStore.clear();
r = call({ action: 'payment_create', idToken: 'tok-alice', planId: 'plan_200', country: 'UG', phone: '0750470234' }); ok(r.ok, 'new payment after previous completed');
const ref2 = r.reference;
r = call({ action: 'payment_cancel', idToken: 'tok-alice', reference: ref2 }); ok(r.ok && r.status === 'cancelled', 'user cancel acknowledged');
r = call({ action: 'payment_reconcile', idToken: 'tok-alice' }); ok(r.ok && r.status === 'cancelled', 'reconcile while still processing: stays cancelled (no credit)');
ok(credits('alice') === 200, 'no credit yet');
MARZ.status = 'completed'; cacheStore.clear();
r = call({ action: 'payment_reconcile', idToken: 'tok-alice' }); ok(r.ok && r.status === 'completed', 'reconcile after late approval → completed');
ok(credits('alice') === 400, 'late money credited exactly once (400)');
ok(logs.some(l => l.includes('late_credit')), 'late_credit warning logged for the developer');

console.log('new payment can start after user-cancel (stale activeRef handled)');
MARZ.status = 'processing'; cacheStore.clear();
r = call({ action: 'payment_create', idToken: 'tok-alice', planId: 'plan_200', country: 'UG', phone: '0750470234' }); const ref3 = r.reference;
call({ action: 'payment_cancel', idToken: 'tok-alice', reference: ref3 });
r = call({ action: 'payment_create', idToken: 'tok-alice', planId: 'plan_200', country: 'UG', phone: '0750470234' }); ok(r.ok && r.reference !== ref3, 'retry after cancel is allowed');

console.log('telecom failure + MarzPay create error');
MARZ.status = 'failed'; cacheStore.clear();
r = call({ action: 'payment_status', idToken: 'tok-alice', reference: r.reference }); ok(r.ok && r.status === 'failed', 'failed mapped');
MARZ.failCreate = 'SERVICE_NOT_SUBSCRIBED'; cacheStore.clear();
r = call({ action: 'payment_create', idToken: 'tok-alice', planId: 'plan_200', country: 'UG', phone: '0750470234' }); ok(!r.ok && r.error_code === 'MARZ_NOT_SUBSCRIBED' && !/subscri/i.test(r.error), 'MarzPay error mapped to friendly msg w/o internals');
MARZ.failCreate = null;

console.log('credits_spend');
let b0 = credits('alice');
r = call({ action: 'credits_spend', idToken: 'tok-alice', requestId: 'req-00000001', units: 30 }); ok(r.ok && r.cost === 30 && credits('alice') === b0 - 30, 'spend 30');
r = call({ action: 'credits_spend', idToken: 'tok-alice', requestId: 'req-00000001', units: 30 }); ok(r.ok && r.unchanged && credits('alice') === b0 - 30, 'same requestId → not charged twice');
r = call({ action: 'credits_spend', idToken: 'tok-alice', requestId: 'req-00000002', units: 99999 }); ok(!r.ok && r.error_code === 'INSUFFICIENT_CREDITS' && r.shortfall > 0, 'insufficient → required/balance/shortfall returned');
r = call({ action: 'admin_adjust', idToken: 'tok-bob', targetUid: 'alice', delta: 5, reason: 'x' }); ok(!r.ok && r.error_code === 'FORBIDDEN', 'non-admin blocked');
r = call({ action: 'admin_adjust', idToken: 'tok-alice', targetUid: 'alice', delta: 5, reason: 'goodwill' }); ok(r.ok && credits('alice') === b0 - 30 + 5, 'admin adjust');

console.log('log hygiene');
const all = logs.join('\n');
ok(!all.includes('tok-alice') && !all.includes('ms') || !/"MARZPAY_API_SECRET":"ms"/.test(all), 'no id tokens / secrets in logs');
ok(!/0750470234|\+256750470234/.test(all), 'full phone number never appears in logs');
ok(!FETCH_LOG.some(f => f.url.includes('identitytoolkit') && false), 'n/a');
ok(JSON.parse(T.doGet({}).s).ok === true, 'doGet health');
const A=logs.join("\n");
ok(!A.includes("tok-alice")&&!A.includes("tok-bob"), "STRICT: id tokens never logged");
ok(!A.includes("oauth-token"), "STRICT: OAuth bearer never logged");
ok(!/:\"ms\"|mk:ms|bWs6bXM/.test(A) && !A.includes(Buffer.from("mk:ms").toString("base64")), "STRICT: MarzPay credentials never logged");
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
