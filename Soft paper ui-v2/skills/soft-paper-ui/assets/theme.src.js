/* SOFT PAPER UI runtime. No dependencies. Works with plain HTML, React, Vue, anything.
   Switch:   SoftPaper.enable() / disable() / toggle() / setColor('light'|'dark'|'system')
   Feedback: toast(msg,{type,action,onAction,duration}) · alert/confirm/prompt/modal -> Promise · sheet · menu · loading · offlineBanner
   Motion:   transition(fn) · tabs(el) · segmented(el) · bump(el) · asyncButton(btn, fn, opts) · status(el).set(state, copy)
   Layout:   sidebar({toggle, shell}) · icon(name) · mountIcons()
   Auto:     data-icon · data-tip · data-sp-clear · data-sp-password · data-sp-autogrow · data-sp-counter */
(function (global) {
  "use strict";
  var KEY = "sp-enabled", CKEY = "sp-color", root = document.documentElement;
  var SPRITE = /*ICONS_SPRITE*/"", NAMES = /*ICON_NAMES*/[];
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function safeGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function safeSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  var reduce = function () { return global.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches; };

  /* ---------- icons (Lucide, ISC licence, inlined sprite) ---------- */
  function icon(name, cls) { return '<svg class="sp-icon' + (cls ? " " + cls : "") + '" aria-hidden="true" focusable="false"><use href="#sp-i-' + name + '"/></svg>'; }
  function mountIcons(scope) { (scope || document).querySelectorAll("[data-icon]").forEach(function (n) { var nm = n.getAttribute("data-icon"); n.removeAttribute("data-icon"); n.insertAdjacentHTML("afterbegin", icon(nm, n.getAttribute("data-icon-class") || "")); }); }
  function injectSprite() { if (document.getElementById("sp-sprite")) return; var h = el("div", null, SPRITE); h.id = "sp-sprite"; h.style.display = "none"; document.body.insertBefore(h, document.body.firstChild); mountIcons(); }
  var STATUS_ICON = { success: "circle-check", error: "circle-alert", danger: "circle-alert", warning: "triangle-alert", info: "info" };

  /* ---------- enable / disable (the reversible switch) ---------- */
  function enable() { root.setAttribute("data-theme-pack", "soft-paper"); safeSet(KEY, "1"); applyColor(safeGet(CKEY) || "system"); }
  function disable() { root.removeAttribute("data-theme-pack"); root.removeAttribute("data-color"); safeSet(KEY, "0"); }
  function toggle() { root.hasAttribute("data-theme-pack") ? disable() : enable(); }
  function applyColor(c) { if (c === "light" || c === "dark") root.setAttribute("data-color", c); else root.removeAttribute("data-color"); }
  function setColor(c) { safeSet(CKEY, c); applyColor(c); }

  /* ---------- toasts: max 3 visible, duplicates collapse (x2), pause on hover, progress line ---------- */
  var toastBox, MAX_TOASTS = 3, live = [];
  function toasts() { if (!toastBox || !toastBox.isConnected) { toastBox = el("div", "sp-toasts"); toastBox.setAttribute("role", "region"); toastBox.setAttribute("aria-live", "polite"); toastBox.setAttribute("aria-label", "Notifications"); document.body.appendChild(toastBox); } return toastBox; }
  function toast(msg, o) {
    o = o || {}; var type = o.type || "info", dur = o.duration == null ? (type === "error" || type === "warning" ? 6000 : 3500) : o.duration, key = type + "|" + msg;
    var dup = live.filter(function (t) { return t.key === key; })[0];
    if (dup) { dup.n++; dup.badge.textContent = "×" + dup.n; dup.badge.hidden = false; dup.restart(); bump(dup.el); return dup; }
    while (live.length >= MAX_TOASTS) live[0].close();
    var t = el("div", "sp-toast is-" + type + (o.soft ? " is-soft" : "")); t.setAttribute("role", type === "error" ? "alert" : "status");
    t.innerHTML = icon(STATUS_ICON[type] || "info") + '<span class="sp-toast-msg">' + esc(msg) + '</span><span class="sp-toast-n" hidden></span>';
    var badge = t.querySelector(".sp-toast-n"), timer, h = { el: t, key: key, n: 1, badge: badge, close: close, restart: restart };
    if (o.action) { var b = el("button", "sp-toast-action", esc(o.action)); b.onclick = function (e) { e.stopPropagation(); close(); o.onAction && o.onAction(); }; t.appendChild(b); }
    var bar = el("span", "sp-toast-bar"); t.appendChild(bar);
    toasts().appendChild(t); requestAnimationFrame(function () { t.classList.add("is-open"); });
    function restart() { clearTimeout(timer); bar.style.animation = "none"; void bar.offsetWidth; if (dur) { bar.style.animation = "sp-bar " + dur + "ms linear forwards"; timer = setTimeout(close, dur); } }
    function close() { clearTimeout(timer); live = live.filter(function (x) { return x !== h; }); t.classList.remove("is-open"); setTimeout(function () { t.remove(); }, 260); }
    t.addEventListener("mouseenter", function () { clearTimeout(timer); bar.style.animationPlayState = "paused"; });
    t.addEventListener("mouseleave", function () { if (dur) restart(); });
    t.addEventListener("click", function (e) { if (!e.target.closest(".sp-toast-action")) close(); });
    live.push(h); restart(); return h;
  }
  ["success", "error", "warning", "info"].forEach(function (k) { toast[k] = function (m, o) { o = o || {}; o.type = k; return toast(m, o); }; });

  /* ---------- modal core (alert / confirm / prompt / custom) ---------- */
  function openModal(build) {
    return new Promise(function (resolve) {
      var lastFocus = document.activeElement, scrim = el("div", "sp-scrim"), wrap = el("div", "sp-modal-wrap"), box = el("div", "sp-modal");
      box.setAttribute("role", "dialog"); box.setAttribute("aria-modal", "true"); wrap.appendChild(box);
      document.body.append(scrim, wrap); document.body.classList.add("sp-locked");
      function done(v) {
        box.classList.remove("is-open"); scrim.classList.remove("is-open"); document.removeEventListener("keydown", key, true);
        setTimeout(function () { scrim.remove(); wrap.remove(); if (!document.querySelector(".sp-modal,.sp-sheet,.sp-sidebar.is-open")) document.body.classList.remove("sp-locked"); lastFocus && lastFocus.focus && lastFocus.focus(); }, 240); resolve(v);
      }
      function key(e) {
        if (e.key === "Escape") { e.preventDefault(); done(box._cancel); }
        if (e.key === "Tab") { var f = box.querySelectorAll("button,input,textarea,select,a[href]"); if (!f.length) return; var a = f[0], z = f[f.length - 1];
          if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); } else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); } }
      }
      document.addEventListener("keydown", key, true);
      scrim.addEventListener("click", function () { if (!box._lock) done(box._cancel); });
      build(box, done);
      requestAnimationFrame(function () { scrim.classList.add("is-open"); box.classList.add("is-open"); mountIcons(box); var f = box.querySelector("[data-autofocus]") || box.querySelector("button:last-child"); f && f.focus(); });
    });
  }
  function head(box, o, defType) {
    var type = o.type || defType;
    if (type) box.appendChild(el("div", "sp-modal-icon is-" + type, icon(STATUS_ICON[type] || "info", "sp-icon-lg")));
    if (o.title) box.appendChild(el("h3", null, esc(o.title)));
    if (o.message) { var p = el("p", "sp-muted"); p.textContent = o.message; box.appendChild(p); }
  }
  function normalize(a, b) { return typeof a === "object" && a ? a : Object.assign({}, b || {}, { message: a }); }
  function alertM(msg, o) {
    o = normalize(msg, o); return openModal(function (box, done) {
      box._cancel = undefined; head(box, o, o.type || null);
      var act = el("div", "sp-modal-actions"), ok = el("button", null, esc(o.okText || "OK")); ok.setAttribute("data-autofocus", ""); ok.onclick = function () { done(undefined); };
      act.appendChild(ok); box.appendChild(act);
    });
  }
  function confirmM(msg, o) {
    o = normalize(msg, o); return openModal(function (box, done) {
      box._cancel = false; head(box, o, o.danger ? "danger" : "warning");
      var act = el("div", "sp-modal-actions"), no = el("button", "sp-btn-secondary", esc(o.cancelText || "Cancel")), ok = el("button", o.danger ? "sp-btn-danger" : "", esc(o.okText || "Confirm"));
      no.onclick = function () { done(false); }; ok.onclick = function () { done(true); }; (o.danger ? no : ok).setAttribute("data-autofocus", ""); act.append(no, ok); box.appendChild(act);
    });
  }
  function promptM(msg, def, o) {
    o = normalize(msg, o); if (typeof msg !== "object") o.defaultValue = def; return openModal(function (box, done) {
      box._cancel = null; head(box, o, null);
      var f = el("div", "sp-field"), inp = o.multiline ? el("textarea") : el("input"); if (!o.multiline) inp.type = o.inputType || "text";
      inp.value = o.defaultValue || ""; inp.placeholder = o.placeholder || ""; inp.setAttribute("data-autofocus", ""); f.appendChild(inp); box.appendChild(f);
      var act = el("div", "sp-modal-actions"), no = el("button", "sp-btn-secondary", esc(o.cancelText || "Cancel")), ok = el("button", null, esc(o.okText || "OK"));
      no.onclick = function () { done(null); }; ok.onclick = function () { done(inp.value); }; inp.addEventListener("keydown", function (e) { if (e.key === "Enter" && !o.multiline) done(inp.value); });
      act.append(no, ok); box.appendChild(act);
    });
  }
  function custom(o) { return openModal(function (box, done) { box._cancel = undefined; if (o.large) box.classList.add("sp-modal-lg"); head(box, o, null);
    if (o.html) { var d = el("div"); d.innerHTML = o.html; box.appendChild(d); } box._done = done; if (o.onOpen) o.onOpen(box, done); }); }

  /* ---------- bottom sheet ---------- */
  function sheet(o) {
    o = o || {}; var prev = document.activeElement, scrim = el("div", "sp-scrim"), s = el("div", "sp-sheet"); s.setAttribute("role", "dialog"); s.setAttribute("aria-modal", "true");
    s.innerHTML = '<div class="sp-sheet-handle"></div><div class="sp-sheet-head"><button class="sp-btn-icon sp-btn-bare" aria-label="Close">' + icon("x") + "</button><h3>" + esc(o.title || "") + "</h3><span></span></div>";
    var body = el("div"); if (typeof o.content === "string") body.innerHTML = o.content; else if (o.content) body.appendChild(o.content); s.appendChild(body);
    document.body.append(scrim, s); document.body.classList.add("sp-locked"); mountIcons(s);
    function close() { s.classList.remove("is-open"); scrim.classList.remove("is-open"); setTimeout(function () { s.remove(); scrim.remove(); document.body.classList.remove("sp-locked"); prev && prev.focus && prev.focus(); }, 380); document.removeEventListener("keydown", k); o.onClose && o.onClose(); }
    function k(e) { if (e.key === "Escape") close(); }
    document.addEventListener("keydown", k); scrim.onclick = close; s.querySelector(".sp-sheet-head button").onclick = close;
    requestAnimationFrame(function () { scrim.classList.add("is-open"); s.classList.add("is-open"); s.querySelector("button").focus(); }); return { close: close, el: s };
  }

  /* ---------- popup menu (arrow keys, Escape, focus restore) ---------- */
  function menu(anchor, items) {
    var m = el("div", "sp-menu"); m.setAttribute("role", "menu");
    items.forEach(function (it) { if (it === "-") return m.appendChild(el("div", "sp-menu-sep")); var b = el("button", "sp-menu-item" + (it.danger ? " is-danger" : ""), (it.icon ? icon(it.icon) : "") + "<span>" + esc(it.label) + "</span>"); b.setAttribute("role", "menuitem"); b.onclick = function () { close(); it.onClick && it.onClick(); }; m.appendChild(b); });
    var r = anchor.getBoundingClientRect(); m.style.top = (window.scrollY + r.bottom + 6) + "px"; m.style.left = Math.max(8, window.scrollX + r.right - 220) + "px"; document.body.appendChild(m);
    requestAnimationFrame(function () { m.classList.add("is-open"); var f = m.querySelector("button"); f && f.focus(); });
    function close() { m.classList.remove("is-open"); setTimeout(function () { m.remove(); }, 160); document.removeEventListener("pointerdown", out, true); document.removeEventListener("keydown", k); anchor.focus && anchor.focus(); }
    function out(e) { if (!m.contains(e.target)) close(); }
    function k(e) { if (e.key === "Escape") close(); if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); var b = Array.prototype.slice.call(m.querySelectorAll("button")), i = b.indexOf(document.activeElement); b[(i + (e.key === "ArrowDown" ? 1 : -1) + b.length) % b.length].focus(); } }
    setTimeout(function () { document.addEventListener("pointerdown", out, true); document.addEventListener("keydown", k); }, 0); return { close: close };
  }

  /* ---------- full-screen loader ---------- */
  var loader;
  function loading(on, text) {
    if (on === false) { loader && loader.remove(); loader = null; return; } if (loader) return;
    loader = el("div", "sp-loader-overlay", '<div class="sp-loader-card"><span class="sp-mark-spin">✺</span><span>' + esc(text || "Loading…") + "</span></div>"); loader.setAttribute("role", "status"); document.body.appendChild(loader);
  }

  /* ---------- sidebar: desktop = collapse to icon rail, phone = slide-in drawer with scrim ---------- */
  function sidebar(o) {
    var shell = o.shell, tg = o.toggle, sb = shell.querySelector(".sp-sidebar"), scrim = null, mq = matchMedia("(max-width: 800px)");
    function sync() { var open = mq.matches ? sb.classList.contains("is-open") : !shell.classList.contains("is-collapsed"); tg.setAttribute("aria-expanded", open); tg.setAttribute("aria-label", open ? "Close sidebar" : "Open sidebar"); tg.innerHTML = icon(open ? "panel-left-close" : "panel-left-open"); }
    function openD() { sb.classList.add("is-open"); scrim = el("div", "sp-scrim is-open"); scrim.onclick = closeD; document.body.appendChild(scrim); document.body.classList.add("sp-locked"); sync(); var f = sb.querySelector("a,button"); f && f.focus(); }
    function closeD() { sb.classList.remove("is-open"); if (scrim) { scrim.classList.remove("is-open"); var s = scrim; setTimeout(function () { s.remove(); }, 220); scrim = null; } document.body.classList.remove("sp-locked"); sync(); tg.focus(); }
    tg.addEventListener("click", function () { if (mq.matches) { sb.classList.contains("is-open") ? closeD() : openD(); } else { shell.classList.toggle("is-collapsed"); safeSet("sp-sb-collapsed", shell.classList.contains("is-collapsed") ? "1" : "0"); sync(); } });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && sb.classList.contains("is-open")) closeD(); });
    if (mq.addEventListener) mq.addEventListener("change", function () { if (scrim) closeD(); sync(); });
    if (!mq.matches && safeGet("sp-sb-collapsed") === "1") shell.classList.add("is-collapsed"); sync();
    return { open: openD, close: closeD };
  }

  /* ---------- sliding indicator for tabs / segmented controls ---------- */
  function slider(box, itemSel, activeSel, cls, attr) {
    var ink = box.querySelector("." + cls) || box.appendChild(el("span", cls)); box.classList.add("has-ink");
    function move() { var a = box.querySelector(activeSel); if (!a) { ink.style.opacity = 0; return; } ink.style.opacity = 1; ink.style.width = a.offsetWidth + "px"; ink.style.transform = "translateX(" + a.offsetLeft + "px)"; }
    box.addEventListener("click", function (e) { var it = e.target.closest(itemSel); if (!it || it.parentNode !== box) return; Array.prototype.forEach.call(box.children, function (n) { if (n !== ink) n.removeAttribute(attr); }); it.setAttribute(attr, "true"); move(); });
    window.addEventListener("resize", move); ink.style.transition = "none"; move(); requestAnimationFrame(function () { ink.style.transition = ""; }); return { update: move };
  }
  function tabs(box) { return slider(box, "button,a", '[aria-selected="true"]', "sp-tab-ink", "aria-selected"); }
  function segmented(box) { return slider(box, "button", '[aria-pressed="true"]', "sp-seg-thumb", "aria-pressed"); }

  /* ---------- screen transitions (fade + 12px rise; focus + scroll handled) ---------- */
  function transition(update, o) {
    o = o || {}; var main = document.querySelector(o.target || "[data-sp-main], main");
    function after() { if (!main) return; window.scrollTo(0, 0); var h = main.querySelector("h1,h2") || main; if (!h.hasAttribute("tabindex")) h.setAttribute("tabindex", "-1"); h.focus({ preventScroll: true }); main.classList.remove("sp-enter"); void main.offsetWidth; if (!reduce()) main.classList.add("sp-enter"); }
    return Promise.resolve(update()).then(after);
  }
  function bump(n) { n.classList.remove("sp-bump"); void n.offsetWidth; n.classList.add("sp-bump"); }

  /* ---------- async button: locks width, spinner, success/error flash. Never claims success before fn resolves ---------- */
  function asyncButton(btn, fn, o) {
    o = o || {}; if (btn.getAttribute("aria-busy") === "true") return Promise.resolve();
    var html = btn.innerHTML, w = btn.offsetWidth; btn.style.width = w + "px"; btn.setAttribute("aria-busy", "true"); btn.setAttribute("aria-label", o.loadingText || "Working");
    function reset() { btn.removeAttribute("aria-busy"); btn.removeAttribute("aria-label"); btn.classList.remove("is-success-flash", "is-error-flash"); btn.innerHTML = html; btn.style.width = ""; }
    function flash(cls, label) { btn.removeAttribute("aria-busy"); btn.removeAttribute("aria-label"); btn.classList.add(cls); btn.innerHTML = icon(cls === "is-success-flash" ? "check" : "circle-alert") + "<span>" + esc(label) + "</span>"; setTimeout(reset, 1400); }
    return Promise.resolve().then(fn).then(function (v) { flash("is-success-flash", o.successText || "Done"); return v; }, function (e) { flash("is-error-flash", o.errorText || "Failed"); throw e; });
  }

  /* ---------- status card: explicit async state machine (payments, downloads, uploads) ----------
     States: idle | submitting | awaiting | pending | success | failure.
     This library never sets 'success' by itself: call set('success') only after the SERVER confirmed. */
  var STATE = { idle: ["", "info"], submitting: ["spin", "info"], awaiting: ["spin", "info"], pending: ["triangle-alert", "warning"], success: ["circle-check", "success"], failure: ["circle-alert", "error"] };
  function status(box) {
    box.classList.add("sp-status"); box.setAttribute("role", "status"); box.setAttribute("aria-live", "polite");
    function set(state, c) {
      c = c || {}; var d = STATE[state] || STATE.idle; box.className = "sp-status is-" + d[1] + " is-" + state; box.setAttribute("data-state", state);
      box.innerHTML = '<span class="sp-status-ic">' + (d[0] === "spin" ? '<span class="sp-spinner"></span>' : d[0] ? icon(d[0], "sp-icon-lg") : "") + '</span><div class="sp-status-body"><div class="sp-status-title">' + esc(c.title || "") + '</div><div class="sp-muted">' + esc(c.text || "") + "</div></div>";
      if (c.actions) { var a = el("div", "sp-status-actions"); c.actions.forEach(function (x) { var b = el("button", x.primary ? "" : "sp-btn-secondary sp-btn-sm", esc(x.label)); b.onclick = x.onClick; a.appendChild(b); }); box.appendChild(a); }
      box.classList.remove("sp-enter"); void box.offsetWidth; if (!reduce()) box.classList.add("sp-enter");
    }
    return { set: set };
  }

  /* ---------- offline banner ---------- */
  var offBar;
  function offlineBanner(on) {
    function show() { if (offBar) return; offBar = el("div", "sp-banner is-warning sp-banner-sticky", icon("wifi-off") + '<div class="sp-banner-body"><span class="sp-banner-title">You\'re offline.</span> Some actions may not work.</div>'); offBar.setAttribute("role", "status"); document.body.insertBefore(offBar, document.body.firstChild); }
    function hide() { if (offBar) { offBar.remove(); offBar = null; toast.success("Back online"); } }
    if (on === false) { window.removeEventListener("offline", show); window.removeEventListener("online", hide); return; }
    window.addEventListener("offline", show); window.addEventListener("online", hide); if (!navigator.onLine) show();
  }

  /* ---------- delegated behaviours: ripple, haptic, tooltip, textbox helpers ---------- */
  document.addEventListener("pointerdown", function (e) {
    if (!root.hasAttribute("data-theme-pack")) return; var b = e.target.closest("button,.sp-btn"); if (!b || b.disabled || reduce()) return;
    var r = b.getBoundingClientRect(), d = Math.max(r.width, r.height) * 1.2, dot = el("span", "sp-ripple-dot");
    dot.style.cssText = "width:" + d + "px;height:" + d + "px;left:" + (e.clientX - r.left - d / 2) + "px;top:" + (e.clientY - r.top - d / 2) + "px"; b.appendChild(dot); setTimeout(function () { dot.remove(); }, 560);
    if (navigator.vibrate && b.dataset.haptic !== "off") try { navigator.vibrate(8); } catch (x) {}
  }, { passive: true });
  document.addEventListener("scroll", function () { var t = document.querySelector(".sp-topbar,.sp-navbar"); t && t.classList.toggle("is-scrolled", window.scrollY > 4); }, { passive: true });
  document.addEventListener("click", function (e) {
    var c = e.target.closest("[data-sp-clear]"); if (c) { var i = c.closest(".sp-textbox").querySelector("input,textarea"); i.value = ""; i.dispatchEvent(new Event("input", { bubbles: true })); i.focus(); }
    var p = e.target.closest("[data-sp-password]"); if (p) { var f = p.closest(".sp-textbox").querySelector("input"), show = f.type === "password"; f.type = show ? "text" : "password"; p.setAttribute("aria-label", show ? "Hide password" : "Show password"); p.innerHTML = icon(show ? "eye-off" : "eye"); }
  });
  document.addEventListener("input", function (e) {
    var t = e.target; if (t.matches && t.matches("textarea[data-sp-autogrow]")) { t.style.height = "auto"; t.style.height = Math.min(t.scrollHeight, parseInt(t.getAttribute("data-sp-autogrow")) || 240) + "px"; }
    var tb = t.closest && t.closest(".sp-textbox"); if (tb) { tb.classList.toggle("has-value", !!t.value); var ct = tb.querySelector("[data-sp-counter]") || (tb.parentElement && tb.parentElement.querySelector("[data-sp-counter]")); if (ct) { var mx = t.maxLength > 0 ? t.maxLength : ""; ct.textContent = t.value.length + (mx ? " / " + mx : ""); ct.classList.toggle("is-over", !!mx && t.value.length >= mx); } }
  });

  /* OTP boxes (auto-advance, backspace, paste) and number stepper */
  document.addEventListener("input", function (e) { var i = e.target; if (!i.closest) return; var o = i.closest(".sp-otp"); if (!o) return; var all = Array.prototype.slice.call(o.querySelectorAll("input")), ix = all.indexOf(i);
    if (i.value.length > 1) { var v = i.value.replace(/\D/g, "").split(""); all.forEach(function (n, k) { if (k >= ix && v[k - ix]) n.value = v[k - ix]; }); (all[Math.min(all.length - 1, ix + v.length)] || i).focus(); } else if (i.value && all[ix + 1]) all[ix + 1].focus(); });
  document.addEventListener("keydown", function (e) { var i = e.target; if (e.key === "Backspace" && i.closest && i.closest(".sp-otp") && !i.value) { var p = i.previousElementSibling; p && p.focus(); } });
  document.addEventListener("click", function (e) { var b = e.target.closest("[data-sp-step]"); if (!b) return; var i = b.closest(".sp-numstep").querySelector("input"), d = parseInt(b.getAttribute("data-sp-step")), mn = i.min !== "" ? +i.min : -Infinity, mx = i.max !== "" ? +i.max : Infinity; i.value = Math.min(mx, Math.max(mn, (+i.value || 0) + d)); i.dispatchEvent(new Event("input", { bubbles: true })); bump(i); });
  var tip;
  function hideTip() { if (tip) { tip.remove(); tip = null; } }
  function showTip(t) { var txt = t.getAttribute("data-tip"); if (!txt || !matchMedia("(hover:hover)").matches) return; hideTip(); tip = el("div", "sp-tooltip", esc(txt)); tip.setAttribute("role", "tooltip"); document.body.appendChild(tip); var r = t.getBoundingClientRect(); tip.style.left = Math.max(8, window.scrollX + r.left + r.width / 2 - tip.offsetWidth / 2) + "px"; tip.style.top = (window.scrollY + r.bottom + 8) + "px"; requestAnimationFrame(function () { tip && tip.classList.add("is-open"); }); }
  document.addEventListener("mouseover", function (e) { var t = e.target.closest && e.target.closest("[data-tip]"); t ? showTip(t) : hideTip(); });
  document.addEventListener("focusin", function (e) { var t = e.target.closest && e.target.closest("[data-tip]"); t && showTip(t); }); document.addEventListener("focusout", hideTip);
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") hideTip(); });

  /* ---------- replace native alert / confirm / prompt ---------- */
  var native = { alert: global.alert, confirm: global.confirm, prompt: global.prompt };
  function takeOverNativeDialogs() {
    global.alert = function (m) { alertM(m); };
    global.confirm = function (m) { console.warn("SoftPaper: confirm() cannot block. Use `await SoftPaper.confirm(...)`."); confirmM(m); return false; };
    global.prompt = function (m, d) { console.warn("SoftPaper: prompt() cannot block. Use `await SoftPaper.prompt(...)`."); promptM(m, d); return null; };
  }
  function restoreNativeDialogs() { global.alert = native.alert; global.confirm = native.confirm; global.prompt = native.prompt; }

  global.SoftPaper = { enable: enable, disable: disable, toggle: toggle, setColor: setColor, toast: toast, alert: alertM, confirm: confirmM, prompt: promptM, modal: custom, sheet: sheet, menu: menu, loading: loading,
    sidebar: sidebar, tabs: tabs, segmented: segmented, transition: transition, bump: bump, asyncButton: asyncButton, status: status, offlineBanner: offlineBanner,
    icon: icon, mountIcons: mountIcons, iconNames: NAMES, takeOverNativeDialogs: takeOverNativeDialogs, restoreNativeDialogs: restoreNativeDialogs };
  function boot() { injectSprite(); new MutationObserver(function () { mountIcons(); }).observe(document.body, { childList: true, subtree: true }); }
  if (document.body) boot(); else document.addEventListener("DOMContentLoaded", boot);
  if (safeGet(KEY) !== "0" && !root.hasAttribute("data-theme-pack-manual")) enable();
})(window);
