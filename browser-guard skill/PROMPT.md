# Task: Implement "Browser Guard" across this entire web app

You are working inside an existing repository (open in the editor / already
attached to this session). Implement the three systems described below,
**site-wide** — every page/route the user can land on, not just one screen —
in a single pass. Do not ask clarifying questions unless you genuinely cannot
find any HTML entry point or app shell in the repo; otherwise make the
reasonable default choices called out below and proceed.

## What you're building

**1. Browser / in-app-webview support check.**
On load, show a "We're verifying your browser" overlay with a spinner. Run a
check in the background. If the browser is fine, flip the spinner to a green
checkmark for a moment, then reveal the app. If the browser is unsupported
(an in-app browser like Facebook/Instagram/TikTok/etc., an ancient/embedded
Android WebView, or a very outdated browser), blur the entire app behind a
banner that names what was detected and offers real ways to escape it:
Android → buttons that deep-link into Chrome/Firefox/Edge/Opera/Brave via
`intent://` (falling back to that browser's Play Store listing if it isn't
installed); iOS → instructions to use the share-sheet's "Open in Safari";
Desktop → real download links for Chrome/Firefox/Edge. Always also offer a
"copy this link" fallback.

**2. Connectivity check.**
Poll connectivity (and listen for `online`/`offline` events). Go offline →
blur the whole app and show a blocking "You're offline" card until the
connection returns. Come back online → show a brief "Back online" toast,
then unblur. Detect slow connections (via the Network Information API where
available, otherwise via request latency) and show a small **non-blocking**
toast — a slow connection must never lock the user out of the app the way
"offline" does.

**3. Pop-up-blocked detection.**
Some browsers block pop-ups by default, which silently breaks things like
"Sign in with Google" or auto-opened download tabs. Test this on the user's
first tap/click anywhere on the page (a synthetic `window.open()` test only
works inside a real user gesture, so it can't run on page load). If blocked,
show a small, **dismissible**, non-blocking banner telling them to enable
pop-ups. Also expose a small public function so the app's actual sign-in /
download buttons can run the same test synchronously, right before they open
their real pop-up — that's more reliable than the generic first-tap test.

## Why this is built the way it is (read before you start editing)

- **Everything is created at runtime via JavaScript**, not by copy-pasting
  HTML into every page. That's what makes "implement this on every page" a
  two-line change per page instead of a markup-surgery job.
- **All icons are inline SVG strings baked into the JS.** Nothing is loaded
  from `/icons/whatever.svg`. This avoids 404s, avoids guessing where your
  static assets live, and means the offline-detection UI still works when
  there genuinely is no network to fetch an icon from.
- **Everything is CSS-namespaced** (`bg-guard-` prefix) and z-indexed above
  everything else, so it can't silently collide with the host app's own
  class names or stacking context.
- **The three systems are independent.** You can ship just one or two of
  them if that's all the app needs — they don't depend on each other.

## Step 1 — Add the two files

Create these two files **verbatim** at a sensible shared location in the
repo (e.g. `public/browser-guard/`, `static/browser-guard/`, or wherever
this app already keeps shared static assets — match the existing convention
you find in the repo).

### `browser-guard.css`

```css
/* ==========================================================================
   Browser Guard — styles
   Namespaced with `bg-guard-` so it can be dropped into ANY existing app
   without colliding with the host site's CSS. Colors/sizes are exposed as
   CSS custom properties on :root so the host app can re-theme without
   touching this file.
   ========================================================================== */

:root {
  --bg-guard-accent: #075e54;
  --bg-guard-warn-bg: #fff3cd;
  --bg-guard-warn-border: #ffc107;
  --bg-guard-danger: #dc3545;
  --bg-guard-success: #28a745;
  --bg-guard-text: #1f2937;
  --bg-guard-radius: 12px;
  --bg-guard-z: 999999; /* sits above everything in the host app */
}

.bg-guard-hidden {
  display: none !important;
}

/* ---- Verifying overlay (shown for a beat on load while we check) ---- */
.bg-guard-verifying {
  position: fixed;
  inset: 0;
  z-index: var(--bg-guard-z);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: #1a1a1a;
  color: #fff;
  transition: opacity 0.25s ease;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}

.bg-guard-spinner {
  width: 36px;
  height: 36px;
  border: 4px solid rgba(255, 255, 255, 0.15);
  border-left-color: #fff;
  border-radius: 50%;
  animation: bg-guard-spin 1s linear infinite;
  margin-bottom: 14px;
}

@keyframes bg-guard-spin {
  to { transform: rotate(360deg); }
}

.bg-guard-check svg {
  width: 36px;
  height: 36px;
  margin-bottom: 14px;
  color: var(--bg-guard-success);
}

/* ---- Unsupported-browser banner + full-screen blur/lock ---- */
.bg-guard-blur > *:not(.bg-guard-banner):not(.bg-guard-offline):not(.bg-guard-toast):not(.bg-guard-popup) {
  filter: blur(6px);
  pointer-events: none;
  user-select: none;
}

.bg-guard-banner {
  position: fixed;
  inset: 0;
  z-index: var(--bg-guard-z);
  background: var(--bg-guard-warn-bg);
  border-bottom: 2px solid var(--bg-guard-warn-border);
  overflow-y: auto;
  padding: 20px 16px;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}

.bg-guard-banner-inner {
  max-width: 600px;
  margin: 0 auto;
}

.bg-guard-banner-head {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 14px;
}

.bg-guard-banner-icon {
  font-size: 26px;
  flex-shrink: 0;
}

.bg-guard-banner-title {
  display: block;
  font-size: 16px;
  font-weight: 700;
  color: var(--bg-guard-text);
  margin-bottom: 4px;
}

.bg-guard-banner-sub {
  margin: 0;
  color: #555;
  font-size: 13px;
  line-height: 1.4;
}

.bg-guard-detected {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  font-size: 13px;
  margin-bottom: 12px;
  color: var(--bg-guard-text);
}

.bg-guard-detected svg {
  width: 20px;
  height: 20px;
}

.bg-guard-buttons {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
  margin-bottom: 12px;
}

@media (min-width: 480px) {
  .bg-guard-buttons {
    grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  }
}

.bg-guard-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 10px 8px;
  background: #fff;
  color: var(--bg-guard-text);
  text-decoration: none;
  border-radius: 10px;
  border: 1.5px solid #e2e2e2;
  font-size: 13px;
  font-weight: 600;
  line-height: 1.2;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
  transition: border-color 0.15s, transform 0.1s;
  cursor: pointer;
}

.bg-guard-btn:active { transform: scale(0.97); }
.bg-guard-btn svg { width: 18px; height: 18px; flex-shrink: 0; }

.bg-guard-fallback {
  text-align: center;
  font-size: 12px;
  color: #666;
  border-top: 1px solid #ffeeba;
  padding-top: 10px;
}

.bg-guard-fallback .bg-guard-store-hint {
  margin-top: 8px;
  font-style: italic;
  color: #888;
}

.bg-guard-copy-btn {
  background: none;
  border: 1px solid #007bff;
  color: #007bff;
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 12px;
  cursor: pointer;
}

/* ---- Offline overlay ---- */
.bg-guard-offline {
  position: fixed;
  inset: 0;
  z-index: var(--bg-guard-z);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  text-align: center;
  background: rgba(240, 242, 245, 0.65);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}

.bg-guard-offline-card {
  max-width: 300px;
  background: #fff;
  border-radius: var(--bg-guard-radius);
  padding: 26px 20px;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.15);
}

.bg-guard-offline-card svg {
  width: 38px;
  height: 38px;
  margin: 0 auto 10px;
  color: var(--bg-guard-danger);
  display: block;
}

.bg-guard-offline-card h2 {
  margin: 6px 0;
  font-size: 17px;
  color: var(--bg-guard-text);
}

.bg-guard-offline-card p {
  font-size: 13px;
  color: #555;
  line-height: 1.4;
  margin: 0;
}

/* ---- Toasts (online / slow connection) ---- */
.bg-guard-toast {
  position: fixed;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  background: var(--bg-guard-success);
  color: #fff;
  padding: 10px 18px;
  border-radius: 8px;
  font-size: 13px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.18);
  z-index: var(--bg-guard-z);
  display: flex;
  align-items: center;
  gap: 8px;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}

.bg-guard-toast svg { width: 18px; height: 18px; }
.bg-guard-toast.bg-guard-slow { background: #b8860b; }

/* ---- Pop-up blocked banner (non-blocking, dismissible) ---- */
.bg-guard-popup {
  position: fixed;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  max-width: 92%;
  display: flex;
  align-items: center;
  gap: 10px;
  background: var(--bg-guard-warn-bg);
  border: 1px solid var(--bg-guard-warn-border);
  color: var(--bg-guard-text);
  padding: 10px 14px;
  border-radius: 10px;
  font-size: 13px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  z-index: var(--bg-guard-z);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}

.bg-guard-popup svg { width: 20px; height: 20px; flex-shrink: 0; }

.bg-guard-popup-close {
  margin-left: 4px;
  background: none;
  border: none;
  font-size: 15px;
  line-height: 1;
  cursor: pointer;
  color: #777;
  padding: 2px 4px;
}

@media (max-width: 480px) {
  .bg-guard-banner-head { flex-direction: column; }
}
```

### `browser-guard.js`

```javascript
/* ==========================================================================
   Browser Guard — one script, three jobs, works on ANY page of ANY web app.

   1. Browser / in-app-webview support check  → verifying overlay → green
      check, OR a full-screen blocking banner with "open in a real browser"
      buttons (Android intent://, iOS share-sheet instructions, desktop
      download links).
   2. Connectivity check                       → offline overlay (blocking)
      + online/slow toasts (non-blocking).
   3. Pop-up-blocked detection                  → small dismissible banner,
      tested on the user's first tap so it never needs a fake gesture.

   INTEGRATION (do this once per page, or once in your shared layout/head):
     <link rel="stylesheet" href="/browser-guard/browser-guard.css">
     <script src="/browser-guard/browser-guard.js" defer></script>

   Everything else — all markup, all icons — is created at runtime, so you
   never have to copy HTML into every page. Configure by defining
   `window.BrowserGuardConfig = {...}` in a small inline <script> BEFORE
   this file loads (see CONFIG DEFAULTS below for every option).
   ========================================================================== */
(function () {
  "use strict";

  // ------------------------------------------------------------------ //
  // CONFIG DEFAULTS — override any of these via window.BrowserGuardConfig
  // ------------------------------------------------------------------ //
  var DEFAULTS = {
    // Chrome auto-updates; a real install is never this many majors behind.
    // A UA below this is a dead/embedded/spoofed WebView.
    outdatedChromeMajor: 70,

    // Android browsers offered in the "open in..." banner.
    // `pkg` = Play Store package id, used to build the intent:// deep link.
    androidBrowsers: [
      { name: "Chrome", pkg: "com.android.chrome", key: "chrome" },
      { name: "Firefox", pkg: "org.mozilla.firefox", key: "firefox" },
      { name: "Edge", pkg: "com.microsoft.emmx", key: "edge" },
      { name: "Opera", pkg: "com.opera.browser", key: "opera" },
      { name: "Brave", pkg: "com.brave.browser", key: "brave" }
    ],

    // Desktop fallback: real download links shown as plain buttons.
    desktopBrowsers: [
      { name: "Chrome", url: "https://www.google.com/chrome/", key: "chrome" },
      { name: "Firefox", url: "https://www.mozilla.org/firefox/new/", key: "firefox" },
      { name: "Edge", url: "https://www.microsoft.com/edge", key: "edge" }
    ],

    // Named in-app browsers we can positively identify by UA token.
    inAppSignatures: [
      { app: "Facebook", key: "facebook", test: /FBAN|FBAV|FB_IAB/i },
      { app: "Instagram", key: "instagram", test: /Instagram/i },
      { app: "Messenger", key: "messenger", test: /\bMessenger\b/i },
      { app: "LINE", key: "line", test: /\bLine\//i },
      { app: "WeChat", key: "wechat", test: /MicroMessenger/i },
      { app: "TikTok", key: "tiktok", test: /BytedanceWebview|musical_ly/i },
      { app: "KakaoTalk", key: "kakaotalk", test: /KAKAOTALK/i },
      { app: "Threads", key: "threads", test: /Barcelona/i },
      { app: "Google app", key: "googlego", test: /NSTNWV|GSA\// i }
    ],

    // Connectivity
    connectivityCheckUrl: null, // null => re-HEAD the current page. Point this
                                 // at a tiny same-origin health endpoint if you have one.
    connectivityTimeoutMs: 5000,
    connectivityPollMs: 15000,
    slowLatencyThresholdMs: 2500,

    // Misc
    verifiedHoldMs: 700,        // how long the green check stays up before hiding
    popupFallbackTimeoutMs: 2000,
    showSlowToast: true,        // set false to silently ignore slow connections
    onlyRunVerifyingOverlayOnce: true // skip the "verifying" flash on SPA route changes
  };

  var CFG = Object.assign({}, DEFAULTS, window.BrowserGuardConfig || {});
  // Shallow-merge nested arrays only if the caller actually overrode them.
  ["androidBrowsers", "desktopBrowsers", "inAppSignatures"].forEach(function (k) {
    if (window.BrowserGuardConfig && window.BrowserGuardConfig[k]) {
      CFG[k] = window.BrowserGuardConfig[k];
    }
  });

  // ------------------------------------------------------------------ //
  // Inline SVG icon set — everything is inline so nothing 404s and
  // nothing depends on a network request that might itself be blocked.
  // ------------------------------------------------------------------ //
  var ICONS = {
    online: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 10a12 12 0 0 1 16 0"/><path d="M7.5 13.5a7 7 0 0 1 9 0"/><path d="M11 17a3 3 0 0 1 2 0"/><circle cx="12" cy="20" r="1" fill="currentColor" stroke="none"/></svg>',
    offline: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 10a12 12 0 0 1 16 0"/><path d="M7.5 13.5a7 7 0 0 1 9 0"/><path d="M11 17a3 3 0 0 1 2 0"/><circle cx="12" cy="20" r="1" fill="currentColor" stroke="none"/><line x1="2" y1="2" x2="22" y2="22"/></svg>',
    slow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2"/><path d="M9 2h6"/></svg>',
    popup: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 9h18"/><line x1="8" y1="14" x2="12" y2="14"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 12.5l2.5 2.5L16 9"/></svg>',
    warning: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    // Generic per-brand badge: a colored circle + first letter. Deliberately
    // simplified (not a pixel copy of any brand's logo) so this file has
    // zero external asset dependencies and no trademarked artwork baked in.
    badge: function (letter, bg) {
      return '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="12" fill="' + bg + '"/>' +
        '<text x="12" y="16.5" text-anchor="middle" font-size="12" font-family="Arial, sans-serif" font-weight="700" fill="#fff">' + letter + '</text></svg>';
    }
  };

  var BRAND_COLORS = {
    chrome: "#4285F4", firefox: "#FF7139", edge: "#0078D7", opera: "#FF1B2D",
    brave: "#FB542B", facebook: "#4460A0", instagram: "#C13584", messenger: "#0084FF",
    line: "#06C755", wechat: "#07C160", tiktok: "#000000", kakaotalk: "#FFCD00",
    threads: "#000000", googlego: "#4285F4"
  };

  function brandIcon(key, name) {
    var color = BRAND_COLORS[key] || "#6b7280";
    return ICONS.badge((name || key).charAt(0).toUpperCase(), color);
  }

  // ------------------------------------------------------------------ //
  // DOM helpers
  // ------------------------------------------------------------------ //
  function el(tag, className, html) {
    var e = document.createElement(tag);
    if (className) e.className = className;
    if (html !== undefined) e.innerHTML = html;
    return e;
  }

  var root; // container we append everything into

  function ensureRoot() {
    if (!root) {
      root = el("div", "bg-guard-root");
      document.body.appendChild(root);
    }
    return root;
  }

  // ------------------------------------------------------------------ //
  // 1) BROWSER / WEBVIEW DETECTION
  // ------------------------------------------------------------------ //
  function detectEnvironment() {
    var ua = navigator.userAgent || "";
    var isAndroid = /Android/i.test(ua);
    var isIOS = /iPhone|iPad|iPod/i.test(ua);
    var platform = isAndroid ? "android" : (isIOS ? "ios" : "desktop");

    for (var i = 0; i < CFG.inAppSignatures.length; i++) {
      if (CFG.inAppSignatures[i].test.test(ua)) {
        return { blocked: true, platform: platform, app: CFG.inAppSignatures[i].app, key: CFG.inAppSignatures[i].key, reason: "named-app" };
      }
    }

    var chromeMajorMatch = ua.match(/Chrome\/(\d+)/);
    var chromeMajor = chromeMajorMatch ? parseInt(chromeMajorMatch[1], 10) : null;
    var hasLegacyVersionToken = /Version\/\d+(\.\d+)*\s+Chrome\/\d+/i.test(ua);

    if (chromeMajor !== null && chromeMajor < CFG.outdatedChromeMajor) {
      return { blocked: true, platform: platform, app: null, key: null, reason: "outdated-browser" };
    }
    if (isAndroid && hasLegacyVersionToken) {
      return { blocked: true, platform: platform, app: null, key: null, reason: "outdated-browser" };
    }
    if (isAndroid && /;\s?wv\)/i.test(ua)) {
      return { blocked: true, platform: platform, app: null, key: null, reason: "android-webview" };
    }
    // No generic iOS WebView check: WKWebView is indistinguishable from
    // Safari by UA alone, and iOS Chrome/Firefox are WebKit wrappers too.
    // Only named in-app signatures are trustworthy on iOS.

    return { blocked: false, platform: platform, app: null, key: null, reason: null };
  }

  function buildIntentUrl(pkg) {
    var currentUrl = window.location.href;
    var withoutProtocol = currentUrl.replace(/^https?:\/\//, "");
    var playStore = "https://play.google.com/store/search?q=" + encodeURIComponent(pkg) + "&c=apps";
    return "intent://" + withoutProtocol + "#Intent;scheme=https;package=" + pkg + ";S.browser_fallback_url=" + encodeURIComponent(playStore) + ";end";
  }

  function showVerifyingOverlay() {
    var overlay = el("div", "bg-guard-verifying", "");
    var spinner = el("div", "bg-guard-spinner");
    var check = el("div", "bg-guard-check bg-guard-hidden");
    var text = el("p", null, "We're verifying your browser");
    overlay.appendChild(spinner);
    overlay.appendChild(check);
    overlay.appendChild(text);
    ensureRoot().appendChild(overlay);
    return { overlay: overlay, spinner: spinner, check: check, text: text };
  }

  function resolveVerified(handles) {
    handles.spinner.classList.add("bg-guard-hidden");
    handles.check.innerHTML = ICONS.check;
    handles.check.classList.remove("bg-guard-hidden");
    handles.text.textContent = "Browser verified";
    setTimeout(function () {
      handles.overlay.remove();
    }, CFG.verifiedHoldMs);
  }

  function showUnsupportedBanner(info, handles) {
    handles.overlay.remove();
    document.body.classList.add("bg-guard-blur");

    var banner = el("div", "bg-guard-banner");
    var inner = el("div", "bg-guard-banner-inner");
    banner.appendChild(inner);

    var head = el("div", "bg-guard-banner-head");
    head.appendChild(el("span", "bg-guard-banner-icon", ICONS.warning));
    var textWrap = el("div");
    textWrap.appendChild(el("strong", "bg-guard-banner-title", "Unsupported Browser Detected"));
    textWrap.appendChild(el("p", "bg-guard-banner-sub", "Some features (like sign-in and downloads) may not work here. Please continue in one of the browsers below."));
    head.appendChild(textWrap);
    inner.appendChild(head);

    if (info.app) {
      var note = el("div", "bg-guard-detected", brandIcon(info.key, info.app));
      note.appendChild(document.createTextNode("Detected: " + info.app + "'s built-in browser"));
      inner.appendChild(note);
    } else if (info.reason === "outdated-browser" || info.reason === "android-webview") {
      var label = info.reason === "outdated-browser" ? "Detected: outdated / unsupported browser" : "Detected: embedded in-app browser";
      inner.appendChild(el("div", "bg-guard-detected", label));
    }

    var btnContainer = el("div", "bg-guard-buttons");
    inner.appendChild(btnContainer);
    var fallback = el("div", "bg-guard-fallback bg-guard-hidden");

    if (info.platform === "android") {
      CFG.androidBrowsers.forEach(function (b) {
        var btn = el("a", "bg-guard-btn", brandIcon(b.key, b.name) + "<span>Open in " + b.name + "</span>");
        btn.href = buildIntentUrl(b.pkg);
        btn.addEventListener("click", function () {
          setTimeout(function () {
            if (!document.hidden) fallback.classList.remove("bg-guard-hidden");
          }, CFG.popupFallbackTimeoutMs);
        });
        btnContainer.appendChild(btn);
      });
      document.addEventListener("visibilitychange", function () {
        if (document.hidden) fallback.classList.add("bg-guard-hidden");
      });
    } else if (info.platform === "ios") {
      btnContainer.appendChild(el("p", null, "Tap the <strong>•••</strong> or share icon in this app and choose <strong>\u201COpen in Safari\u201D</strong> (or \u201COpen in Browser\u201D)."));
      fallback.classList.remove("bg-guard-hidden");
    } else {
      CFG.desktopBrowsers.forEach(function (b) {
        var btn = el("a", "bg-guard-btn", brandIcon(b.key, b.name) + "<span>Get " + b.name + "</span>");
        btn.href = b.url;
        btn.target = "_blank";
        btn.rel = "noopener";
        btnContainer.appendChild(btn);
      });
    }

    fallback.innerHTML = "<p>Button not working? <button class='bg-guard-copy-btn' type='button'>Copy link</button> and paste it into your preferred browser.</p>" +
      "<p class='bg-guard-store-hint'>Don't have any of these? Search for <strong>Chrome</strong> or <strong>Firefox</strong> in your device's App Store.</p>";
    inner.appendChild(fallback);

    fallback.querySelector(".bg-guard-copy-btn").addEventListener("click", function (e) {
      var btn = e.currentTarget;
      var url = window.location.href;
      var done = function () {
        btn.textContent = "Copied!";
        setTimeout(function () { btn.textContent = "Copy link"; }, 2000);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(done);
      } else {
        var ta = document.createElement("textarea");
        ta.value = url;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        done();
      }
    });

    ensureRoot().appendChild(banner);
  }

  function runBrowserCheck() {
    var alreadyVerified = CFG.onlyRunVerifyingOverlayOnce && sessionStorage.getItem("bgGuardVerified") === "1";
    var info = detectEnvironment();

    if (alreadyVerified && !info.blocked) return; // skip the flash on subsequent SPA pages

    var handles = showVerifyingOverlay();
    if (info.blocked) {
      showUnsupportedBanner(info, handles);
    } else {
      resolveVerified(handles);
      try { sessionStorage.setItem("bgGuardVerified", "1"); } catch (e) { /* private mode, ignore */ }
    }
  }

  // ------------------------------------------------------------------ //
  // 2) CONNECTIVITY DETECTION
  // ------------------------------------------------------------------ //
  var isOffline = false;
  var isSlow = false;
  var offlineOverlayEl, onlineToastEl, slowToastEl;

  function ensureConnectivityDom() {
    if (!offlineOverlayEl) {
      offlineOverlayEl = el("div", "bg-guard-offline bg-guard-hidden");
      var card = el("div", "bg-guard-offline-card");
      card.innerHTML = ICONS.offline + "<h2>You're offline</h2><p>Check your internet connection — this app needs internet to work.</p>";
      offlineOverlayEl.appendChild(card);
      ensureRoot().appendChild(offlineOverlayEl);
    }
    if (!onlineToastEl) {
      onlineToastEl = el("div", "bg-guard-toast bg-guard-hidden", ICONS.online + " Back online");
      ensureRoot().appendChild(onlineToastEl);
    }
    if (!slowToastEl) {
      slowToastEl = el("div", "bg-guard-toast bg-guard-slow bg-guard-hidden", ICONS.slow + " Slow connection detected");
      ensureRoot().appendChild(slowToastEl);
    }
  }

  function showOfflineOverlay() { ensureConnectivityDom(); offlineOverlayEl.classList.remove("bg-guard-hidden"); }
  function hideOfflineOverlay() { if (offlineOverlayEl) offlineOverlayEl.classList.add("bg-guard-hidden"); }

  function showOnlineToast() {
    ensureConnectivityDom();
    onlineToastEl.classList.remove("bg-guard-hidden");
    setTimeout(function () { onlineToastEl.classList.add("bg-guard-hidden"); }, 3000);
  }

  function showSlowToast() {
    if (!CFG.showSlowToast) return;
    ensureConnectivityDom();
    slowToastEl.classList.remove("bg-guard-hidden");
    setTimeout(function () { slowToastEl.classList.add("bg-guard-hidden"); }, 4000);
    // Non-blocking by design: a slow connection should never stop the user
    // from continuing to use the app, only inform them.
  }

  function evaluateSpeed(latencyMs) {
    var slowNow = false;
    var conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (conn && conn.effectiveType) {
      slowNow = conn.effectiveType === "slow-2g" || conn.effectiveType === "2g";
    } else if (typeof latencyMs === "number") {
      slowNow = latencyMs > CFG.slowLatencyThresholdMs;
    }
    if (slowNow && !isSlow) { isSlow = true; showSlowToast(); }
    else if (!slowNow) { isSlow = false; }
  }

  function handleOffline() {
    if (!isOffline) {
      isOffline = true;
      ensureConnectivityDom();
      onlineToastEl.classList.add("bg-guard-hidden");
      slowToastEl.classList.add("bg-guard-hidden");
      showOfflineOverlay();
    }
  }

  function handleOnline(latencyMs) {
    if (isOffline) {
      isOffline = false;
      hideOfflineOverlay();
      showOnlineToast();
    }
    evaluateSpeed(latencyMs);
  }

  function checkConnectivity() {
    var url = CFG.connectivityCheckUrl || (window.location.pathname + "?_bgGuardPing=" + Date.now());
    var controller = ("AbortController" in window) ? new AbortController() : null;
    var timeoutId = controller ? setTimeout(function () { controller.abort(); }, CFG.connectivityTimeoutMs) : null;
    var started = performance.now();

    fetch(url, { method: "HEAD", cache: "no-store", signal: controller ? controller.signal : undefined })
      .then(function () {
        if (timeoutId) clearTimeout(timeoutId);
        handleOnline(performance.now() - started);
      })
      .catch(function () {
        if (timeoutId) clearTimeout(timeoutId);
        handleOffline();
      });
  }

  function startConnectivityMonitoring() {
    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", checkConnectivity);
    var conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (conn && conn.addEventListener) conn.addEventListener("change", function () { evaluateSpeed(); });
    checkConnectivity();
    setInterval(checkConnectivity, CFG.connectivityPollMs);
    if (!navigator.onLine) handleOffline();
  }

  // ------------------------------------------------------------------ //
  // 3) POP-UP BLOCKED DETECTION (non-blocking, dismissible)
  // ------------------------------------------------------------------ //
  var popupTestDone = false;
  var popupBannerEl;

  function showPopupBlockedBanner() {
    if (!popupBannerEl) {
      popupBannerEl = el("div", "bg-guard-popup bg-guard-hidden");
      popupBannerEl.innerHTML = ICONS.popup +
        "<span>Pop-ups are blocked in this browser. Enable them so sign-in and downloads work.</span>" +
        "<button class='bg-guard-popup-close' type='button' aria-label='Dismiss'>\u00D7</button>";
      ensureRoot().appendChild(popupBannerEl);
      popupBannerEl.querySelector(".bg-guard-popup-close").addEventListener("click", function () {
        popupBannerEl.classList.add("bg-guard-hidden");
      });
    }
    popupBannerEl.classList.remove("bg-guard-hidden");
  }

  // Exposed publicly so you can also call this synchronously right before
  // opening a real OAuth/download popup, which is more reliable than the
  // generic first-tap test below (same-gesture calls are what browsers
  // actually allow through).
  function testPopupBlocked() {
    popupTestDone = true;
    try {
      var testWin = window.open("about:blank", "_blank", "width=100,height=100");
      if (!testWin || testWin.closed || typeof testWin.closed === "undefined") {
        showPopupBlockedBanner();
        return false;
      }
      testWin.close();
      return true;
    } catch (e) {
      showPopupBlockedBanner();
      return false;
    }
  }

  function startPopupMonitoring() {
    var runOnce = function () {
      if (popupTestDone) return;
      testPopupBlocked();
    };
    document.addEventListener("click", runOnce, { once: true });
    document.addEventListener("touchstart", runOnce, { once: true });
  }

  // ------------------------------------------------------------------ //
  // INIT
  // ------------------------------------------------------------------ //
  function init() {
    ensureRoot();
    runBrowserCheck();
    startConnectivityMonitoring();
    startPopupMonitoring();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  // Public API — small, deliberate surface so host apps can hook in.
  window.BrowserGuard = {
    testPopupBlocked: testPopupBlocked,
    recheckConnectivity: checkConnectivity,
    recheckBrowser: runBrowserCheck
  };
})();
```

> If you were given `browser-guard.css` and `browser-guard.js` as separate
> attached files alongside this prompt, use those verbatim instead of
> retyping — they are identical to what belongs in the blocks above.

## Step 2 — Wire it into every page, in one place if possible

Before touching individual pages, **look for a single shared entry point**
this repo already has — that's almost always the right place to add this,
so it only has to be done once:

| App shape | Where to add it |
|---|---|
| Static multi-page site (plain `.html` files) | A shared `<head>`/`<footer>` include/partial if one exists (e.g. Jinja/Nunjucks/EJS/Handlebars layout, PHP include, SSG layout template). If no shared partial exists, add the snippet to **every** `.html` file in the repo. |
| React / Next.js | `app/layout.tsx` (App Router) or `pages/_document.tsx` / `pages/_app.tsx` (Pages Router) |
| Vue / Nuxt | `nuxt.config` `app.head`, or the root `App.vue` |
| Angular | `index.html` (Angular is single-entry by default) |
| SvelteKit | `src/app.html` |
| Plain SPA (one `index.html` + bundler) | that single `index.html` |
| Django / Rails / Laravel / other server-rendered app | the base/master layout template every view extends |

Add, right before the closing `</head>` (or right before `</body>` if the
framework's head is restrictive):

```html
<link rel="stylesheet" href="/browser-guard/browser-guard.css">
<script src="/browser-guard/browser-guard.js" defer></script>
```

Adjust the path to wherever you actually placed the files in Step 1.

**If no shared layout exists and this is a true static multi-page site**,
add that same two-line snippet to every `.html` file you find in the repo.
Search the whole project tree for `.html` files first and list them so you
(and the user) know what got touched.

## Step 3 — Configure it for this app (optional but recommended)

Directly above the `<script src="/browser-guard/browser-guard.js">` tag, you
can add a small inline config **before** the script loads:

```html
<script>
  window.BrowserGuardConfig = {
    // Point this at a real lightweight health-check endpoint if this app
    // has one — much cheaper than re-requesting the current page.
    connectivityCheckUrl: "/health",

    // Turn off the slow-connection toast entirely if you don't want it.
    showSlowToast: true
  };
</script>
<link rel="stylesheet" href="/browser-guard/browser-guard.css">
<script src="/browser-guard/browser-guard.js" defer></script>
```

Every configurable option (Android/desktop browser lists, in-app-browser
signatures, thresholds, timeouts) is documented at the top of
`browser-guard.js` under `DEFAULTS` — read it before assuming you need to
write custom detection logic; it's very likely already covered.

## Step 4 — Hook real sign-in/download buttons into the pop-up test (optional, do this if the app has Google/OAuth sign-in or triggers downloads via `window.open`)

Find the click handler for the app's actual sign-in or download button and
call the exposed test **synchronously, first, inside that same handler**:

```javascript
signInButton.addEventListener("click", function (e) {
  if (!window.BrowserGuard.testPopupBlocked()) {
    return; // banner is now showing; don't also fire the real popup into a wall
  }
  // ... proceed to open the real OAuth popup / trigger the real download
});
```

This is more reliable than the passive first-tap test because it runs
inside the exact user gesture the browser is checking for.

## Step 5 — Verify

Once wired up, confirm all of the following before calling it done:

- [ ] Every page/route the user can land on directly (including deep links,
      not just the homepage) loads the CSS/JS — check this by searching the
      repo for every HTML entry point / route definition, not just clicking
      through the nav.
- [ ] The verifying overlay appears momentarily on a normal browser, then
      resolves to a green check and disappears.
- [ ] Spoofing an old UA (or testing inside an actual in-app browser like
      Instagram) shows the blocked banner, blurs the app behind it, and the
      banner's buttons/links are real and correct for the platform.
- [ ] Toggling devtools "offline" shows the blocking offline card; toggling
      back online shows the toast and unblurs.
- [ ] Throttling to a slow connection (devtools network throttling) shows
      the slow toast **without** blocking interaction.
- [ ] Blocking pop-ups in browser settings and tapping anywhere shows the
      dismissible pop-up-blocked banner; dismissing it works and it doesn't
      come back uninvited.
- [ ] Nothing here collides visually or in z-index with the app's own
      modals/toasts/navbars.

Report back: which files you created, the exact layout/entry-point file(s)
you edited (or the full list of `.html` files touched, if this was a static
multi-page site with no shared layout), and any app-specific config you set
in Step 3.
