import { JSDOM } from 'jsdom';
import fs from 'fs'; import os from 'os'; import path from 'path'; import { fileURLToPath } from 'url';
// payModal.js is an ES module but may sit in a CommonJS project: test a temp .mjs copy
const here = path.dirname(fileURLToPath(import.meta.url)); const tmp = path.join(os.tmpdir(), 'pm-under-test.mjs');
fs.copyFileSync(path.join(here, '..', 'payModal.js'), tmp);
const dom = new JSDOM('<!doctype html><body></body>', { url: 'http://localhost/' });
globalThis.window = dom.window; globalThis.document = dom.window.document;
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
const { initPayModal, openPayModal, closePayModal, normalizePhoneClient } = await import(tmp);
let pass=0, fail=0; const ok=(c,m)=>{c?pass++:fail++;console.log(c?'  ✓':'  ✗ FAIL',m)};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const toasts=[]; const calls=[]; let statusResp={ok:true,status:'pending'}; let createDelay=0;
initPayModal({
  mode:'account', waitMaxMs:700, pollFastMs:40, pollSlowMs:40, fastForMs:1000,
  getIdToken: async()=>'tok', getPlans:()=>[{id:'p1',name:'200',credits:200,price:2500,currency:'UGX'}],
  showToast:(m,k)=>toasts.push([k,m]),
  callBackend: async(action,payload)=>{ calls.push(action);
    if(action==='pay_config') return {ok:true,countries:[{code:'UG',dial:'256',name:'Uganda',nsn:[9]},{code:'KE',dial:'254',name:'Kenya',nsn:[9]}]};
    if(action==='payment_create'){ await sleep(createDelay); return {ok:true,reference:'ref-'+calls.length+'-aaaa',status:'pending',maskedPhone:'+256***234',rid:'r1'}; }
    if(action==='payment_status') return statusResp;
    return {ok:true,status:'cancelled'}; }
});
const $=s=>document.querySelector(s); const count=a=>calls.filter(x=>x===a).length;

console.log('phone helper');
const C=[{code:'UG',dial:'256',nsn:[9]},{code:'KE',dial:'254',nsn:[9]}];
ok(normalizePhoneClient('+254710000000','UG',C).code==='COUNTRY_MISMATCH' && normalizePhoneClient('+254710000000','UG',C).switchTo==='KE','+254 while UG selected → mismatch, offers KE');
ok(normalizePhoneClient('0750 470 234','UG',C).pretty==='+256 750 470 234','pretty preview');

console.log('open + form');
await openPayModal(); await sleep(10);
ok($('.pm-card').dataset.phase==='form','form phase'); ok($('#pm-help').textContent.includes('without the country code'),'help text states the no-country-code rule');
$('#pm-phone').value='0750470234'; $('#pm-phone').dispatchEvent(new dom.window.Event('input'));
ok($('#pm-preview').textContent.includes('+256 750 470 234'),'live preview shows final number');

console.log('double-click safety + locked waiting UI');
createDelay=60;
$('#pm-primary').click(); $('#pm-primary').click(); $('#pm-primary').click();
ok($('.pm-card').dataset.phase==='submitting','submitting immediately'); ok($('#pm-primary').disabled && $('#pm-primary').classList.contains('pm-loading'),'primary disabled + spinner on first click');
await sleep(120);
ok(count('payment_create')===1,'3 rapid clicks → exactly ONE payment_create');
ok($('.pm-card').dataset.phase==='waiting','waiting phase');
ok($('#pm-form').disabled && $('#pm-primary').disabled && !$('#pm-secondary').disabled,'form+Pay locked, Cancel live');
ok($('#pm-status').textContent.includes('Keep this page open'),'stay-on-page warning visible');
ok(count('payment_status')>=1,'polling started');

console.log('cancel is instant and stops everything');
statusResp={ok:true,status:'pending'};
$('#pm-secondary').click();
const n=count('payment_status');
ok($('.pm-card').dataset.phase==='cancelled' && !$('#pm-form').disabled && !$('#pm-primary').disabled,'cancelled: UI unlocked immediately');
ok(toasts.some(t=>t[0]==='warning'&&/cancel/i.test(t[1])),'amber toast shown');
ok($('#pm-status').textContent.includes('You cancelled'),'cancel feedback panel');
await sleep(200);
ok(count('payment_status')===n,'no polls after cancel'); ok(count('payment_cancel')===1,'server notified once');

console.log('late "completed" after cancel is ignored by the UI');
statusResp={ok:true,status:'completed',creditsAdded:200};
await sleep(100); ok($('.pm-card').dataset.phase==='cancelled','still cancelled (server credits via reconcile)');

console.log('retry → success');
$('#pm-primary').click(); await sleep(5); ok($('.pm-card').dataset.phase==='form','Start again → form');
createDelay=0; statusResp={ok:true,status:'pending'};
$('#pm-primary').click(); await sleep(60); statusResp={ok:true,status:'completed',creditsAdded:200}; await sleep(120);
ok($('.pm-card').dataset.phase==='success','success phase'); ok(toasts.some(t=>t[0]==='success'),'green toast'); ok($('#pm-primary').hidden,'Pay hidden on success');
$('#pm-secondary').click(); ok(!$('.pm-overlay'),'Done closes modal');

console.log('cancel while create request in flight → server told to cancel');
await openPayModal(); await sleep(10); $('#pm-phone').value='0750470234';
createDelay=100; const before=count('payment_cancel');
$('#pm-primary').click(); await sleep(10); $('#pm-secondary').click();
ok($('.pm-card').dataset.phase==='cancelled','cancelled during submitting'); await sleep(200);
ok(count('payment_cancel')===before+2 || count('payment_cancel')>before,'late-created payment gets cancelled server-side');
ok($('.pm-card').dataset.phase==='cancelled','late create response did not revive the UI');
closePayModal(true);

console.log('timeout + failed + errors');
await openPayModal(); await sleep(10); $('#pm-phone').value='0750470234'; createDelay=0; statusResp={ok:true,status:'pending'};
$('#pm-primary').click(); await sleep(900);
ok($('.pm-card').dataset.phase==='timeout','timeout phase after waitMax'); ok($('#pm-primary').textContent==='Check again','Check again offered');
closePayModal(true);
await openPayModal(); await sleep(10); $('#pm-phone').value='0750470234'; statusResp={ok:true,status:'failed',message:'Insufficient funds'};
$('#pm-primary').click(); await sleep(150);
ok($('.pm-card').dataset.phase==='failed' && toasts.some(t=>t[0]==='error'),'failed → red panel + toast'); closePayModal(true);

console.log('validation');
await openPayModal(); await sleep(10); $('#pm-phone').value='12'; const c0=count('payment_create'); $('#pm-primary').click(); await sleep(20);
ok(count('payment_create')===c0 && !$('#pm-error').hidden,'bad number blocked client-side with message'); closePayModal(true);
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail?1:0);
