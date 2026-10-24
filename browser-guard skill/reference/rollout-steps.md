# Rollout steps

## 1. Place the files

Add `browser-guard.css` and `browser-guard.js` verbatim to wherever this
repo already keeps shared static assets (e.g. `public/browser-guard/`,
`static/browser-guard/`) — match the existing convention in the repo rather
than inventing a new one.

## 2. Wire into every page — find the ONE shared entry point first

| App shape | Where to add it |
|---|---|
| Static multi-page site (plain `.html` files) | A shared `<head>`/`<footer>` include/partial if one exists (Jinja/Nunjucks/EJS/Handlebars layout, PHP include, SSG layout). If none exists, add to **every** `.html` file. |
| React / Next.js | `app/layout.tsx` (App Router) or `pages/_document.tsx` (Pages Router) |
| Vue / Nuxt | `nuxt.config` `app.head`, or root `App.vue` |
| Angular | `index.html` (single entry by default) |
| SvelteKit | `src/app.html` |
| Plain SPA (single `index.html` + bundler) | that `index.html` |
| Server-rendered app (Django/Rails/Laravel/etc.) | the base/master layout every view extends |

Add before `</head>` (or before `</body>` if the framework restricts head
injection):

```html
<link rel="stylesheet" href="/browser-guard/browser-guard.css">
<script src="/browser-guard/browser-guard.js" defer></script>
```

If it's a true static multi-page site with no shared layout, search the
whole tree for `.html` files, list them, and add the snippet to each.

## 3. Configure (optional)

```html
<script>
  window.BrowserGuardConfig = {
    connectivityCheckUrl: "/health", // point at a real health endpoint if one exists
    showSlowToast: true
  };
</script>
```

Every option is documented under `DEFAULTS` at the top of
`browser-guard.js` — check there before writing custom detection logic.

## 4. Hook real sign-in/download buttons into the pop-up test (if applicable)

```javascript
signInButton.addEventListener("click", function (e) {
  if (!window.BrowserGuard.testPopupBlocked()) {
    return; // banner now showing; don't also fire the real popup into a wall
  }
  // ... open the real OAuth popup / trigger the real download
});
```

This runs inside the actual user gesture, which is more reliable than the
passive first-tap test alone.

## 5. Verification checklist

- [ ] Every page/route the user can land on directly loads the CSS/JS —
      confirmed by checking every HTML entry point / route definition, not
      just clicking through the nav.
- [ ] Verifying overlay appears momentarily on a normal browser, resolves
      to a green check, disappears.
- [ ] Spoofed old UA / real in-app browser (Instagram, etc.) shows the
      blocked banner, blurs the app, buttons/links are correct per platform.
- [ ] Devtools "offline" shows the blocking offline card; back online shows
      the toast and unblurs.
- [ ] Throttled/slow connection shows the slow toast **without** blocking
      interaction.
- [ ] Blocked pop-ups + a tap anywhere shows the dismissible banner;
      dismissing works and it doesn't reappear uninvited.
- [ ] No z-index/visual collisions with the app's own modals/toasts/navbars.

Report back which files were created, which layout/entry-point file(s) were
edited (or the full list of `.html` files touched for a static site with no
shared layout), and any config set in step 3.
