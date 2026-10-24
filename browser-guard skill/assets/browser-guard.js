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
