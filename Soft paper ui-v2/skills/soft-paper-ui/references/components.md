# Components cheat sheet

## Tokens (all `--sp-*`)
Surfaces: `bg` (paper), `surface` (white card), `surface-2`, `chip`, `border`, `border-strong`, `divider`.
Text: `text`, `text-2`, `text-3`. Actions: `primary`, `blue`, `blue-control`, `accent`, `link-purple`.
Status: `amber`, `success`, `danger`, `info` (+ `-tint`, `-line`). Overlays: `hover`, `press`, `scrim`.
Shape: `r-xs 6`, `r-sm 10`, `r-md 14`, `r-lg 20`, `r-xl 28`, `r-pill`. Space: `s1..s7` = 4,8,12,16,24,32,48 px.

## Buttons
`<button>` primary (default) · `sp-btn-secondary` · `sp-btn-tonal` · `sp-btn-ghost` · `sp-btn-text` · `sp-btn-accent` · `sp-btn-danger` · `sp-btn-danger-quiet` · `sp-btn-success`
Sizes `sp-btn-sm` `sp-btn-lg` · `sp-btn-block` · icon `sp-btn-icon` (+`sp-btn-bare`) · `sp-btn-send` (round) · `sp-btn-fab` · group `sp-btn-group` · loading `aria-busy="true"`.
States: hover lightens/darkens, press scales .97 + ripple, focus ring blue 2px, disabled 45%.

## Form
Wrap in `.sp-field` with `<label>`; `<input> <select> <textarea>` are styled globally. Invalid: `aria-invalid="true"` + `.sp-error-text`. Help: `.sp-help`.
`input type=checkbox/radio`, switch = `<input type="checkbox" class="sp-switch">`, `input[type=range]`, `<progress>`, `.sp-segmented`, `input[type=file]`, `.sp-input-group`, chat box `.sp-composer`.

## Badges / chips
`sp-badge` (+ `-solid -blue -amber -success -danger -accent`) · `sp-chip` (`aria-pressed` selected) · `sp-avatar` · `sp-count` · `sp-dot`.

## Surfaces
`sp-card` (+`-flat -interactive -promo`) · `sp-list` > `sp-list-item` (`sp-list-body/title/sub/end`, `is-selected`, `is-danger`) · `<table>` (wrap in `.sp-table-wrap`) · `<details>` accordion · `.sp-empty` empty state.

## Navigation
`sp-topbar` · `sp-bottomnav` (items: `<a><span class="sp-nav-pill">icon</span>Label</a>`, `aria-current="page"`) · `sp-sidebar` · `sp-tabs` (`aria-selected`) · `sp-breadcrumb` · `sp-pagination` · `sp-stepper`.

## JS API
```js
SoftPaper.toast('Saved', {type:'success'})        // types: success error warning info; also SoftPaper.toast.error('x')
SoftPaper.toast('Archived', {action:'Undo', onAction(){...}})
await SoftPaper.alert({title, message, type:'warning'})
const ok = await SoftPaper.confirm({title, message, danger:true, okText:'Delete'})   // true | false
const v  = await SoftPaper.prompt({title, defaultValue, placeholder, multiline})     // string | null
SoftPaper.modal({title, html, large:true, onOpen(box, close){...}})
SoftPaper.sheet({title, content:'<html or element>'})   // bottom sheet, desktop = centered
SoftPaper.menu(buttonEl, [{label, onClick, danger}, '-', ...])
SoftPaper.loading(true,'Generating…'); SoftPaper.loading(false)
SoftPaper.setColor('system'|'light'|'dark'); SoftPaper.enable(); SoftPaper.disable()
SoftPaper.takeOverNativeDialogs()   // makes plain alert() use the styled modal (confirm/prompt cannot block; use the Promise versions)
```
## Motion
120ms for hover/press, 220ms for overlays, 360ms for sheets. Easing `--sp-ease`. All motion disabled under reduced-motion.

## Added in v2
**Icons:** `<span data-icon="search"></span>` or `SoftPaper.icon('search','sp-icon-lg')` (sizes `sp-icon-sm/lg/xl`). 91 icons, list in `SoftPaper.iconNames`.
**Navbar:** `sp-navbar` > `sp-navbar-brand`, `sp-navbar-links` > `sp-nav-link[aria-current=page]`, `sp-navbar-spacer`, icon buttons, search `sp-textbox is-pill`. Hides links on phones.
**App shell:** `<div class="sp-shell"><aside class="sp-sidebar">…</aside><div>…</div></div>` + `SoftPaper.sidebar({shell, toggle})`. Sidebar link = `<a><span data-icon="house"></span><span class="sp-nav-text">Home</span></a>`; add `data-tip="Home"` so the collapsed rail shows names on hover.
**Text boxes:** `.sp-textbox` (+ `is-pill`, `is-multiline`, `is-invalid`, `is-valid`, `is-disabled`). Clear: `<button data-sp-clear>`. Password: `<button data-sp-password>`. Auto-grow: `<textarea data-sp-autogrow="200">`. Counter: `<div class="sp-counter" data-sp-counter>`. OTP: `.sp-otp` with inputs. Stepper: `.sp-numstep` with `data-sp-step="-1|1"` buttons.
**Tooltips:** add `data-tip="Text"` to any element (mouse devices only).
**Status card:** `SoftPaper.status(el).set('pending', {title, text, actions:[{label,primary,onClick}]})`. States: idle submitting awaiting pending success failure.
**Async button:** `SoftPaper.asyncButton(btn, () => promise, {successText, errorText})`.
**Motion helpers:** `sp-enter`, `sp-enter-stagger`, `sp-bump`, `sp-pop`, `sp-fade-in`, `sp-hover-lift`, `SoftPaper.transition(fn)`, `SoftPaper.tabs(el)`, `SoftPaper.segmented(el)`, `SoftPaper.offlineBanner()`.
