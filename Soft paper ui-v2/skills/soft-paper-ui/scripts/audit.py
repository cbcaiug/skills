"""Contrast + state audit: every variant x state x scheme. Flags text/background contrast below threshold."""
import sys, json
from playwright.sync_api import sync_playwright
import os
CSS = sys.argv[1] if len(sys.argv)>1 else os.path.abspath(os.path.join(os.path.dirname(__file__),"..","assets","theme.css"))
THRESH = 3.0   # large/bold UI text minimum (WCAG 1.4.3 large text); we also report <4.5 as 'warn'
HTML = """<!doctype html><html data-theme-pack="soft-paper" data-color="%s"><head><meta charset=utf-8>
<link rel=stylesheet href="file://%s"></head><body style="padding:20px"><div id=root>
<button data-k="primary">Primary</button>
<button class=sp-btn-secondary data-k="secondary">Secondary</button>
<button class=sp-btn-tonal data-k="tonal">Tonal</button>
<button class=sp-btn-ghost data-k="ghost">Ghost</button>
<button class=sp-btn-text data-k="text">Text</button>
<button class=sp-btn-accent data-k="accent">Accent</button>
<button class=sp-btn-danger data-k="danger">Delete</button>
<button class=sp-btn-danger-quiet data-k="danger-quiet">Remove</button>
<button class=sp-btn-success data-k="success">Done</button>
<button class=sp-btn-icon data-k="icon">X</button>
<button class="sp-btn-icon sp-btn-bare" data-k="icon-bare">X</button>
<button class=sp-btn-send data-k="send">&gt;</button>
<a class=sp-btn href="#" data-k="a.sp-btn">Link btn</a>
<a class="sp-btn sp-btn-danger" href="#" data-k="a.danger">Link danger</a>
<div class=sp-btn-group><button data-k="group-a">A</button><button data-k="group-b" aria-pressed=true>B</button></div>
<div class=sp-segmented><button data-k="seg-a">A</button><button data-k="seg-b" aria-pressed=true>B</button></div>
<button class=sp-chip data-k="chip">Chip</button><button class=sp-chip aria-pressed=true data-k="chip-on">Chip</button>
<div class=sp-tabs><button data-k="tab">Tab</button><button aria-selected=true data-k="tab-on">Tab</button></div>
<div class=sp-menu is-open style="position:static;opacity:1"><button class=sp-menu-item data-k="menu-item">Item</button><button class=sp-menu-item data-k="menu-item-danger" style="color:var(--sp-danger)">Del</button></div>
<div class=sp-toast style="opacity:1;transform:none"><span>Msg</span><button class=sp-toast-action data-k="toast-action">Undo</button></div>
<button class=sp-btn-danger sp-btn-sm data-k="danger-sm">x</button>
<button disabled data-k="disabled-primary">Disabled</button>
<span class="sp-badge" data-k="badge">b</span><span class="sp-badge sp-badge-blue" data-k="badge-blue">b</span><span class="sp-badge sp-badge-amber" data-k="badge-amber">b</span><span class="sp-badge sp-badge-success" data-k="badge-success">b</span><span class="sp-badge sp-badge-danger" data-k="badge-danger">b</span><span class="sp-badge sp-badge-solid" data-k="badge-solid">b</span><span class="sp-badge sp-badge-accent" data-k="badge-accent">b</span>
<div class="sp-banner is-warning"><div class=sp-banner-title data-k="banner-warning-title">T</div></div>
<div class="sp-banner is-error"><div class=sp-banner-title data-k="banner-error-title">T</div></div>
<div class="sp-banner is-success"><div class=sp-banner-title data-k="banner-success-title">T</div></div>
<div class="sp-banner is-info"><div class=sp-banner-title data-k="banner-info-title">T</div></div>
<ul class=sp-list><li class=sp-list-item data-k="list">Row</li><li class="sp-list-item is-selected" data-k="list-selected">Row</li><li class="sp-list-item is-danger" data-k="list-danger">Row</li></ul>
</div></body></html>"""
def lum(c):
    def f(v):
        v/=255; return v/12.92 if v<=0.03928 else ((v+0.055)/1.055)**2.4
    return 0.2126*f(c[0])+0.7152*f(c[1])+0.0722*f(c[2])
def ratio(a,b):
    la,lb=lum(a),lum(b); hi,lo=max(la,lb),min(la,lb); return (hi+0.05)/(lo+0.05)
JS = """(el)=>{
 function parse(s){const m=s.match(/rgba?\\(([^)]+)\\)/); if(!m) return [0,0,0,0]; const p=m[1].split(/[ ,\\/]+/).filter(Boolean).map(Number); return [p[0],p[1],p[2],p.length>3?p[3]:1];}
 function bg(e){ let layers=[]; let n=e; while(n){const c=parse(getComputedStyle(n).backgroundColor); if(c[3]>0) layers.push(c); if(c[3]>=1) break; n=n.parentElement;}
   let base=[255,255,255]; if(!layers.length||layers[layers.length-1][3]<1){ base=parse(getComputedStyle(document.body).backgroundColor).slice(0,3);}
   let out=base.slice(); for(let i=layers.length-1;i>=0;i--){const c=layers[i]; out=[0,1,2].map(j=>c[j]*c[3]+out[j]*(1-c[3]));} return out;}
 const cs=getComputedStyle(el); const fg=parse(cs.color); const b=bg(el);
 const f=[0,1,2].map(j=>fg[j]*fg[3]+b[j]*(1-fg[3]));
 return {fg:f,bg:b,op:parseFloat(cs.opacity)};}"""
rows=[]; fails=[]
with sync_playwright() as p:
    br=p.chromium.launch()
    for scheme in ["light","dark"]:
        pg=br.new_context(viewport={"width":900,"height":900}).new_page()
        open(f"/tmp/audit_{scheme}.html","w").write(HTML % (scheme, CSS)); pg.goto(f"file:///tmp/audit_{scheme}.html"); pg.wait_for_timeout(300)
        pg.add_style_tag(content="*{transition:none!important;animation:none!important}")
        keys=pg.eval_on_selector_all("[data-k]","els=>els.map(e=>e.dataset.k)")
        for k in keys:
            sel=f'[data-k="{k}"]'; interactive = not k.startswith(("badge","banner"))
            states=["rest"]+(["hover","active"] if interactive and not k.startswith("disabled") else [])
            for st in states:
                pg.mouse.move(0,0); pg.mouse.up()
                if st=="hover": pg.hover(sel)
                if st=="active": pg.hover(sel); pg.mouse.down()
                pg.wait_for_timeout(30)
                r=pg.eval_on_selector(sel,JS)
                cr=ratio(r["fg"],r["bg"])
                rows.append((scheme,k,st,round(cr,2)))
                if cr<THRESH and not k.startswith("disabled"): fails.append((scheme,k,st,round(cr,2)))
                pg.mouse.up()
    br.close()
print("checked",len(rows),"state combinations")
print("FAILURES (contrast < %.1f):"%THRESH, len(fails))
for f in fails: print("  ",f)
warn=[r for r in rows if THRESH<=r[3]<4.5 and not r[1].startswith("disabled")]
print("WARN (3.0-4.5, ok for bold/large UI text only):",len(warn))
for w in warn: print("  ",w)
sys.exit(1 if fails else 0)
