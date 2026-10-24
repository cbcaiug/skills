/**
 * payModal.js — mobile-money payment modal (vanilla JS, ES module)
 * Skill: marzpay-gas-firestore | Template v1.0.0 | pairs with Code.gs + payModal.css
 *
 * ONE state machine drives everything (phase). Nothing is enabled/disabled ad-hoc:
 *   form → submitting → waiting → success | failed | cancelled | timeout
 *
 * Non-negotiables implemented here (see references/03-paymodal-ux-spec.md):
 *   - Double-click proof: `busy` flag is set synchronously BEFORE any await.
 *   - While submitting/waiting: everything is locked EXCEPT Cancel.
 *   - Cancel = instant: generation counter invalidates all in-flight work, timers stop, UI unlocks.
 *   - Every state has visible feedback (panel + toast). No silent states.
 *   - Page-leave guard + offline banner while a payment is in flight.
 *   - Developer logging via [PayModal] console lines. Never logs tokens or full phone numbers.
 */

const DEFAULTS = {
  waitMaxMs: 150000,   // stop waiting after this long (telecom prompts usually expire sooner)
  pollFastMs: 3000,
  pollSlowMs: 5000,
  fastForMs: 45000,
  defaultCountry: 'UG',
  debug: false,
  // Only show examples we actually know. Others get a generic hint. Extend after verifying.
  examples: { UG: '0712 345 678', KE: '0710 000 000' }
};

// Friendly text for server error_code values (server also sends `error`; this wins if present).
const UX_ERRORS = {
  PHONE_EMPTY: 'Enter the mobile money number to charge.',
  PHONE_BAD_LENGTH: 'That number has the wrong length. Check it and try again.',
  PHONE_BAD_FORMAT: 'That number does not look right. Check it and try again.',
  COUNTRY_MISMATCH: 'That number belongs to a different country.',
  COUNTRY_NOT_SUPPORTED: 'Payments from this country are not available.',
  PENDING_EXISTS: 'You already have a payment waiting for approval on your phone.',
  AUTH_EXPIRED: 'Your session expired. Please sign in again.',
  AUTH_MISSING: 'Please sign in to continue.',
  AUTH_FAILED: 'We could not verify your sign-in. Please sign in again.',
  PLAN_NOT_FOUND: 'That plan is no longer available. Pick another.',
  PLAN_MISSING: 'Choose a plan first.',
  PLAN_CURRENCY_MISMATCH: 'This plan cannot be paid from the selected country.',
  UPSTREAM_NETWORK: 'Could not reach the payment service. Please try again.',
  CONFIG_MISSING: 'Payments are temporarily unavailable. Please contact support.',
  SERVER_ERROR: 'Something went wrong on our side. Please try again.',
  NETWORK: 'Network problem. Check your connection and try again.',
  BACKEND_HTML: 'The payment service is not reachable right now. Please contact support.',
  BACKEND_URL_MISSING: 'Payments are not configured yet. Please contact support.'
};

let cfg = null;
const S = {
  phase: 'form', busy: false, gen: 0, ref: null, startedAt: 0,
  countries: [], country: 'UG', planId: null, plan: null,
  pollTimer: null, tickTimer: null, failStreak: 0, root: null, lastPhone: ''
};

// ───────────────────────────── logging (developer-facing, redacted) ─────────────────────────────

const SECRET_RE = /secret|token|password|authorization|api[_-]?key|receipt/i;
const PHONE_RE = /phone|msisdn/i;
function maskPhone(p) { const s = String(p || ''); return s.length < 8 ? '***' : s.slice(0, 4) + '*'.repeat(s.length - 7) + s.slice(-3); }
function redact(v, d = 0) {
  if (v === null || v === undefined || d > 4) return v;
  if (typeof v === 'string') return v.length > 200 ? v.slice(0, 200) + '…' : v;
  if (typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.slice(0, 20).map(x => redact(x, d + 1));
  const o = {};
  for (const k of Object.keys(v)) o[k] = SECRET_RE.test(k) ? '[redacted]' : PHONE_RE.test(k) ? maskPhone(v[k]) : redact(v[k], d + 1);
  return o;
}
function log(level, event, data) {
  if (level === 'debug' && !cfg.debug) return;
  const fn = level === 'debug' ? console.log : (console[level] || console.log);
  fn.call(console, `[PayModal] ${event}`, data === undefined ? '' : redact(data));
}

// ───────────────────────────── public API ─────────────────────────────

/**
 * @param {object} o
 *  callBackend(action, payload, idToken) → Promise<json>   // your existing config/backend.js
 *  getIdToken(forceRefresh?) → Promise<string>             // () => auth.currentUser.getIdToken(force)
 *  getPlans() → [{id,name,credits,price,currency}]         // from Firestore plans (public read)
 *  showToast(msg, kind)  kind: 'success'|'warning'|'error'|'info'   // your existing toast
 *  onSuccess({creditsAdded, reference})                    // optional
 *  mode: 'account' | 'guest'                               // guest: no token, receipt returned
 */
export function initPayModal(o) {
  cfg = Object.assign({}, DEFAULTS, o);
  window.addEventListener('beforeunload', onBeforeUnload);
  window.addEventListener('offline', () => onNet(false));
  window.addEventListener('online', () => onNet(true));
  document.addEventListener('visibilitychange', onVisible);
  log('info', 'init', { debug: cfg.debug });
}

export async function openPayModal() {
  if (S.root) return;
  S.gen++; S.busy = false; S.ref = null;
  buildDom();
  setPhase('form');
  try {
    if (!S.countries.length) {
      const r = await call('pay_config', {}, false);
      S.countries = (r.countries || []);
    }
  } catch (e) { log('warn', 'pay_config.failed', { code: e.code }); }
  if (!S.countries.length) S.countries = [{ code: cfg.defaultCountry, dial: '256', name: 'Uganda', nsn: [9] }];
  if (!S.countries.some(c => c.code === S.country)) S.country = S.countries.some(c => c.code === cfg.defaultCountry) ? cfg.defaultCountry : S.countries[0].code;
  fillForm();
  log('info', 'open', { countries: S.countries.map(c => c.code) });
}

/** Called after sign-in: credits money that arrived after a cancel/timeout/closed tab. */
export async function reconcileOnLoad() {
  try {
    const r = await call('payment_reconcile', {});
    if (r.reconciled && r.status === 'completed') {
      cfg.showToast('Your earlier payment was confirmed — credits have been added.', 'success');
      log('info', 'reconcile.credited', { ref: r.reference });
    }
  } catch (e) { log('debug', 'reconcile.skip', { code: e.code }); }
}

export function closePayModal(force = false) {
  if (!S.root) return;
  if (!force && (S.phase === 'submitting' || S.phase === 'waiting')) { log('debug', 'close.blocked', { phase: S.phase }); return; }
  stopTimers(); S.gen++;
  S.root.remove(); S.root = null; S.busy = false;
  document.removeEventListener('keydown', onKey);
  log('info', 'close');
}

// ───────────────────────────── phone helpers (mirror Code.gs normalizePhone_) ─────────────────────────────

export function normalizePhoneClient(raw, cc, countries) {
  const c = countries.find(x => x.code === cc);
  if (!c) return { ok: false, code: 'COUNTRY_NOT_SUPPORTED' };
  const t = String(raw || '').trim();
  let d = t.replace(/\D/g, '');
  if (!d) return { ok: false, code: 'PHONE_EMPTY' };
  if (/^\+|^00/.test(t)) {
    const digits = d.startsWith('00') ? d.slice(2) : d;
    const other = countries.filter(x => digits.startsWith(x.dial)).sort((a, b) => b.dial.length - a.dial.length)[0];
    if (other && other.code !== cc) return { ok: false, code: 'COUNTRY_MISMATCH', switchTo: other.code };
  }
  if (d.startsWith('00' + c.dial)) d = d.slice(2 + c.dial.length);
  else if (d.startsWith(c.dial) && c.nsn.includes(d.length - c.dial.length)) d = d.slice(c.dial.length);
  else if (d.startsWith('0')) d = d.slice(1);
  if (!c.nsn.includes(d.length)) return { ok: false, code: 'PHONE_BAD_LENGTH' };
  if (d.startsWith('0')) return { ok: false, code: 'PHONE_BAD_FORMAT' };
  return { ok: true, e164: '+' + c.dial + d, national: d, pretty: '+' + c.dial + ' ' + d.replace(/(\d{3})(?=\d)/g, '$1 ') };
}

// ───────────────────────────── DOM ─────────────────────────────

function $(sel) { return S.root.querySelector(sel); }

function buildDom() {
  const root = document.createElement('div');
  root.className = 'pm-overlay';
  root.innerHTML = `
    <div class="pm-card" role="dialog" aria-modal="true" aria-labelledby="pm-title" data-phase="form">
      <h3 id="pm-title">Buy credits</h3>
      <div class="pm-banner" id="pm-net" hidden></div>
      <section class="pm-status" id="pm-status" hidden aria-live="polite"></section>
      <fieldset class="pm-form" id="pm-form">
        <label class="pm-label" for="pm-plan">Plan</label>
        <select id="pm-plan" class="pm-input"></select>

        <label class="pm-label" for="pm-country">Country</label>
        <select id="pm-country" class="pm-input"></select>

        <label class="pm-label" for="pm-phone">Mobile money number</label>
        <div class="pm-phone-row"><span class="pm-dial" id="pm-dial">+256</span>
          <input id="pm-phone" class="pm-input" type="tel" inputmode="tel" autocomplete="tel-national" /></div>
        <p class="pm-help" id="pm-help"></p>
        <p class="pm-preview" id="pm-preview" aria-live="polite"></p>
        <p class="pm-error" id="pm-error" role="alert" hidden></p>
      </fieldset>
      <div class="pm-actions">
        <button type="button" class="pm-btn pm-btn-secondary" id="pm-secondary">Close</button>
        <button type="button" class="pm-btn pm-btn-primary" id="pm-primary">Pay now</button>
      </div>
    </div>`;
  document.body.appendChild(root);
  S.root = root;
  $('#pm-primary').addEventListener('click', onPrimary);
  $('#pm-secondary').addEventListener('click', onSecondary);
  $('#pm-country').addEventListener('change', onCountry);
  $('#pm-phone').addEventListener('input', updatePreview);
  $('#pm-phone').addEventListener('blur', () => showPhoneError(false));
  $('#pm-phone').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); onPrimary(); } });
  root.addEventListener('mousedown', e => { if (e.target === root) closePayModal(); });   // blocked while in flight
  document.addEventListener('keydown', onKey);
}

function onKey(e) { if (e.key === 'Escape') { if (S.phase === 'waiting' || S.phase === 'submitting') return; closePayModal(); } }

function fillForm() {
  const plans = (cfg.getPlans && cfg.getPlans()) || [];
  const ps = $('#pm-plan'); ps.innerHTML = '';
  if (!plans.length) { const o = document.createElement('option'); o.textContent = 'No plans available'; o.value = ''; ps.appendChild(o); }
  plans.forEach(p => {
    const o = document.createElement('option');
    o.value = p.id; o.textContent = `${p.name} — ${p.credits} credits / ${p.currency} ${Number(p.price).toLocaleString()}`;
    ps.appendChild(o);
  });
  if (S.planId && plans.some(p => p.id === S.planId)) ps.value = S.planId;
  const cs = $('#pm-country'); cs.innerHTML = '';
  S.countries.forEach(c => { const o = document.createElement('option'); o.value = c.code; o.textContent = `${c.name} (+${c.dial})`; cs.appendChild(o); });
  cs.value = S.country;
  cs.disabled = S.countries.length < 2;            // one country → nothing to choose
  $('#pm-phone').value = S.lastPhone || '';
  onCountry();
}

function onCountry() {
  S.country = $('#pm-country').value;
  const c = S.countries.find(x => x.code === S.country);
  $('#pm-dial').textContent = '+' + c.dial;
  const ex = cfg.examples[S.country];
  $('#pm-phone').placeholder = ex || (c.nsn[0] + ' digits');
  // THE rule shown to users: number WITHOUT country code; we add it. Pasting +code is tolerated.
  $('#pm-help').textContent = ex
    ? `Enter the number without the country code — we add +${c.dial} for you. Example: ${ex}`
    : `Enter your mobile money number without the country code — we add +${c.dial} for you.`;
  updatePreview();
}

function updatePreview() {
  const r = normalizePhoneClient($('#pm-phone').value, S.country, S.countries);
  const pv = $('#pm-preview');
  pv.textContent = r.ok ? `We will send the payment request to ${r.pretty}` : '';
  if (r.ok) $('#pm-error').hidden = true;
}

function showPhoneError(force) {
  const raw = $('#pm-phone').value;
  if (!raw && !force) return;
  const r = normalizePhoneClient(raw, S.country, S.countries);
  const el = $('#pm-error');
  if (r.ok) { el.hidden = true; return true; }
  el.hidden = false; el.textContent = UX_ERRORS[r.code] || 'Check the phone number.';
  if (r.code === 'COUNTRY_MISMATCH' && r.switchTo) {
    const c = S.countries.find(x => x.code === r.switchTo);
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'pm-link'; b.textContent = ` Switch to ${c.name}`;
    b.addEventListener('click', () => { $('#pm-country').value = c.code; onCountry(); showPhoneError(true); });
    el.appendChild(b);
  }
  return false;
}

// ───────────────────────────── phase machine ─────────────────────────────

function setPhase(phase, data = {}) {
  const prev = S.phase; S.phase = phase;
  log('info', 'phase', { from: prev, to: phase, ref: S.ref ? S.ref.slice(0, 8) : null });
  const card = $('.pm-card'); card.dataset.phase = phase;
  const form = $('#pm-form'), status = $('#pm-status'), prim = $('#pm-primary'), sec = $('#pm-secondary');
  const lock = phase === 'submitting' || phase === 'waiting';
  form.disabled = lock;                                  // ← grays out EVERYTHING in the form
  card.classList.toggle('pm-locked', lock);
  setBtn(prim, { loading: false, disabled: false, text: 'Pay now' });
  setBtn(sec, { loading: false, disabled: false, text: 'Close' });
  prim.hidden = false;
  status.hidden = (phase === 'form'); status.className = 'pm-status pm-status-' + phase; status.innerHTML = '';
  $('#pm-title').textContent = phase === 'success' ? 'Payment received' : 'Buy credits';

  if (phase === 'form') { prim.hidden = false; }
  if (phase === 'submitting') {
    setBtn(prim, { loading: true, disabled: true, text: 'Sending request…' });
    setBtn(sec, { text: 'Cancel' });                    // Cancel is the ONLY live control
    panel(status, 'spinner', 'Contacting the payment service…', 'This takes a few seconds.');
  }
  if (phase === 'waiting') {
    setBtn(prim, { loading: true, disabled: true, text: 'Waiting for approval…' });
    setBtn(sec, { text: 'Cancel payment' });
    panel(status, 'spinner', 'Approve the payment on your phone',
      `A payment request was sent to ${data.maskedPhone || 'your phone'}. Enter your Mobile Money PIN on your phone to approve it.`);
    const warn = document.createElement('p'); warn.className = 'pm-warn';
    warn.textContent = 'Keep this page open. Do not close this tab or app, and stay connected to the internet — otherwise we cannot confirm your payment.';
    status.appendChild(warn);
    const t = document.createElement('p'); t.className = 'pm-timer'; t.id = 'pm-timer'; status.appendChild(t);
    const bar = document.createElement('div'); bar.className = 'pm-bar'; bar.innerHTML = '<i id="pm-barfill"></i>'; status.appendChild(bar);
  }
  if (phase === 'success') {
    prim.hidden = true; setBtn(sec, { text: 'Done' });
    panel(status, 'ok', `${data.creditsAdded || ''} credits added`.trim(), 'Thank you! Your balance has been updated.');
  }
  if (phase === 'failed') {
    prim.hidden = false; setBtn(prim, { text: 'Try again' });
    panel(status, 'bad', 'Payment not completed', data.message || 'The payment did not go through. No credits were added.');
  }
  if (phase === 'cancelled') {
    prim.hidden = false; setBtn(prim, { text: 'Start again' });
    panel(status, 'warn', 'You cancelled this payment',
      'If you did not approve it on your phone, nothing was charged. If you already approved it, your credits will still be added automatically.');
  }
  if (phase === 'timeout') {
    prim.hidden = false; setBtn(prim, { text: 'Check again' });
    panel(status, 'warn', 'We did not get a response',
      'We stopped waiting. If you approved on your phone, your credits will be added automatically once confirmed. You can check again or start over.');
    const again = document.createElement('button'); again.type = 'button'; again.className = 'pm-link'; again.textContent = 'Start a new payment';
    again.addEventListener('click', () => { S.ref = null; setPhase('form'); fillForm(); });
    status.appendChild(again);
  }
}

function panel(host, kind, title, text) {
  const ico = document.createElement('div'); ico.className = 'pm-ico pm-ico-' + kind;
  ico.textContent = kind === 'ok' ? '✓' : kind === 'bad' ? '✕' : kind === 'warn' ? '!' : '';
  const h = document.createElement('h4'); h.textContent = title;
  const p = document.createElement('p'); p.textContent = text;
  host.append(ico, h, p);
}

function setBtn(b, { loading, disabled, text }) {
  if (text !== undefined) b.textContent = text;
  if (loading !== undefined) { b.classList.toggle('pm-loading', !!loading); b.setAttribute('aria-busy', loading ? 'true' : 'false'); }
  if (disabled !== undefined) b.disabled = !!disabled;
}

// ───────────────────────────── actions ─────────────────────────────

function onSecondary() {
  if (S.phase === 'submitting' || S.phase === 'waiting') return cancelPayment('user');
  closePayModal(true);
}

function onPrimary() {
  if (S.busy) { log('debug', 'click.ignored', { reason: 'busy' }); return; }       // sync guard: first line, before anything async
  const p = S.phase;
  if (p === 'form' || p === 'failed' || p === 'cancelled') { if (p !== 'form') { setPhase('form'); fillForm(); return; } return submit(); }
  if (p === 'timeout') return checkOnce();
}

async function submit() {
  S.busy = true;                                              // ← lock FIRST
  const planId = $('#pm-plan').value;
  if (!planId) { S.busy = false; return toastErr('PLAN_MISSING'); }
  if (!navigator.onLine) { S.busy = false; return toastErr('NETWORK'); }
  if (!showPhoneError(true)) { S.busy = false; $('#pm-phone').focus(); return; }
  const ph = normalizePhoneClient($('#pm-phone').value, S.country, S.countries);
  S.planId = planId; S.lastPhone = $('#pm-phone').value;
  const gen = ++S.gen;
  setPhase('submitting');
  log('info', 'submit', { planId, country: S.country, phone: ph.e164 });
  const t0 = Date.now();
  try {
    const r = await call('payment_create', { planId, country: S.country, phone: ph.e164 });
    log('info', 'create.ok', { ms: Date.now() - t0, rid: r.rid, ref: r.reference });
    if (gen !== S.gen) { call('payment_cancel', { reference: r.reference, reason: 'user' }).catch(() => {}); return; }   // cancelled while request was in flight
    S.ref = r.reference; S.startedAt = Date.now(); S.failStreak = 0;
    setPhase('waiting', r);
    startTick(gen); schedulePoll(gen);
  } catch (e) {
    if (gen !== S.gen) return;
    log('warn', 'create.failed', { code: e.code, rid: e.rid, http: e.http });
    if (e.code === 'PENDING_EXISTS' && e.reference) {      // resume instead of double-charging
      S.ref = e.reference; S.startedAt = Date.now(); S.failStreak = 0;
      setPhase('waiting', { maskedPhone: 'your phone' }); startTick(gen); schedulePoll(gen);
      return cfg.showToast(UX_ERRORS.PENDING_EXISTS, 'warning');
    }
    S.busy = false;
    setPhase('form'); fillForm();
    const el = $('#pm-error'); el.hidden = false; el.textContent = friendly(e) + (e.rid ? `  (ref ${e.rid})` : '');
    cfg.showToast(friendly(e), 'error');
  }
}

function schedulePoll(gen) {
  if (gen !== S.gen) return;
  const el = Date.now() - S.startedAt;
  if (el >= cfg.waitMaxMs) return onTimeout(gen);
  S.pollTimer = setTimeout(() => pollOnce(gen), el < cfg.fastForMs ? cfg.pollFastMs : cfg.pollSlowMs);
}

async function pollOnce(gen) {
  if (gen !== S.gen) return;                                 // cancelled/closed: stop silently
  if (!navigator.onLine) { onNet(false); return schedulePoll(gen); }
  try {
    const r = await call('payment_status', { reference: S.ref });
    if (gen !== S.gen) return;                               // ignore late answers after Cancel
    if (S.failStreak) { S.failStreak = 0; onNet(true); }
    log('debug', 'poll', { status: r.status, rid: r.rid });
    if (r.status === 'completed') return finish('success', r);
    if (r.status === 'failed') return finish('failed', r);
    if (r.status === 'cancelled') return finish('failed', { message: 'The payment was declined or cancelled on your phone. No credits were added.' });
    schedulePoll(gen);
  } catch (e) {
    if (gen !== S.gen) return;
    S.failStreak++;
    log('warn', 'poll.failed', { code: e.code, streak: S.failStreak, rid: e.rid });
    if (S.failStreak >= 3) banner('Connection problem — still trying to confirm your payment…');
    schedulePoll(gen);                                       // never fail the payment because OUR polling failed
  }
}

function finish(phase, data) {
  stopTimers(); S.busy = false;
  S.gen++;                                                   // kill any in-flight work
  banner('');
  setPhase(phase, data);
  if (phase === 'success') { cfg.showToast(`Payment successful — ${data.creditsAdded} credits added.`, 'success'); if (cfg.onSuccess) cfg.onSuccess({ creditsAdded: data.creditsAdded, reference: S.ref, receipt: data.receipt }); }
  if (phase === 'failed') cfg.showToast(data.message || 'Payment failed. No credits were added.', 'error');
  log('info', 'finish', { phase });
}

function cancelPayment(reason) {
  const ref = S.ref;
  stopTimers(); S.gen++; S.busy = false;                     // ← everything in flight is now stale; UI unlocks immediately
  banner('');
  setPhase('cancelled');
  cfg.showToast('Payment cancelled.', 'warning');
  log('info', 'cancel', { reason, ref: ref ? ref.slice(0, 8) : null });
  if (ref) call('payment_cancel', { reference: ref, reason }).catch(e => log('debug', 'cancel.notify.failed', { code: e.code }));
  // Server keeps reconciling: if the telecom still completes, credits arrive via reconcileOnLoad().
}

function onTimeout(gen) {
  if (gen !== S.gen) return;
  stopTimers(); S.busy = false; S.gen++;
  banner('');
  if (S.ref) call('payment_cancel', { reference: S.ref, reason: 'timeout' }).catch(() => {});
  setPhase('timeout');
  cfg.showToast('No response yet. We stopped waiting.', 'warning');
  log('warn', 'timeout', { waitedMs: Date.now() - S.startedAt });
}

async function checkOnce() {
  if (S.busy || !S.ref) return;
  S.busy = true;
  const b = $('#pm-primary'); setBtn(b, { loading: true, disabled: true, text: 'Checking…' });
  try {
    const r = await call('payment_status', { reference: S.ref });
    S.busy = false;
    if (r.status === 'completed') return finish('success', r);
    if (r.status === 'failed') return finish('failed', r);
    setBtn(b, { loading: false, disabled: false, text: 'Check again' });
    cfg.showToast('Still no confirmation yet.', 'warning');
  } catch (e) {
    S.busy = false; setBtn(b, { loading: false, disabled: false, text: 'Check again' });
    cfg.showToast(friendly(e), 'error');
  }
}

// ───────────────────────────── timers, guards, banners ─────────────────────────────

function startTick(gen) {
  clearInterval(S.tickTimer);
  S.tickTimer = setInterval(() => {
    if (gen !== S.gen || !S.root) return clearInterval(S.tickTimer);
    const el = Date.now() - S.startedAt, left = Math.max(0, cfg.waitMaxMs - el);
    const t = $('#pm-timer'), f = $('#pm-barfill');
    const mmss = ms => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;
    if (t) t.textContent = `Waiting ${mmss(el)} · we will stop waiting in about ${mmss(left)}`;
    if (f) f.style.width = Math.min(100, (el / cfg.waitMaxMs) * 100) + '%';
  }, 1000);
}
function stopTimers() { clearTimeout(S.pollTimer); clearInterval(S.tickTimer); S.pollTimer = S.tickTimer = null; }

function banner(msg) { if (!S.root) return; const b = $('#pm-net'); b.hidden = !msg; b.textContent = msg || ''; }
function onNet(online) {
  if (!S.root) return;
  if (S.phase !== 'waiting' && S.phase !== 'submitting') return;
  banner(online ? '' : 'You are offline. Reconnect — we will keep checking your payment automatically.');
  log(online ? 'info' : 'warn', online ? 'net.online' : 'net.offline');
  if (online && S.phase === 'waiting') { clearTimeout(S.pollTimer); pollOnce(S.gen); }
}
function onVisible() { if (document.visibilityState === 'visible' && S.phase === 'waiting' && S.root) { log('debug', 'visible.pollNow'); clearTimeout(S.pollTimer); pollOnce(S.gen); } }
function onBeforeUnload(e) { if (S.phase === 'waiting' || S.phase === 'submitting') { e.preventDefault(); e.returnValue = ''; } }

// ───────────────────────────── backend bridge ─────────────────────────────

function friendly(e) { return (e && (UX_ERRORS[e.code] || e.message)) || UX_ERRORS.SERVER_ERROR; }
function toastErr(code) { cfg.showToast(UX_ERRORS[code], 'warning'); }

/** Wraps cfg.callBackend; always rejects with an Error that has .code/.rid/.http/.reference. Retries once on expired token. */
async function call(action, payload, needAuth = true, retried = false) {
  let token = null;
  if (needAuth && cfg.mode !== 'guest') {
    try { token = await cfg.getIdToken(retried); } catch (_) { throw mkErr('AUTH_MISSING', 'Please sign in to continue.'); }
  }
  let res;
  try { res = await cfg.callBackend(action, payload, token); }
  catch (e) { throw mkErr('NETWORK', UX_ERRORS.NETWORK); }
  if (!res || typeof res !== 'object') throw mkErr('SERVER_ERROR', UX_ERRORS.SERVER_ERROR);
  if (res.ok === false) {
    if (res.error_code === 'AUTH_EXPIRED' && needAuth && !retried) return call(action, payload, needAuth, true);
    // backend.js returns {ok:false,error} WITHOUT error_code for transport problems: "Invalid JSON" = GAS sent an HTML page
    const code = res.error_code || (/JSON/i.test(res.error || '') ? 'BACKEND_HTML' : /not configured/i.test(res.error || '') ? 'BACKEND_URL_MISSING' : 'NETWORK');
    if (!res.error_code) log('error', 'backend.transport', { action, error: res.error });
    const err = mkErr(code, UX_ERRORS[code] || res.error || UX_ERRORS.SERVER_ERROR);
    err.rid = res.rid; err.http = res.http; err.reference = res.reference;
    throw err;
  }
  return res;
}
function mkErr(code, msg) { const e = new Error(msg); e.code = code; return e; }
