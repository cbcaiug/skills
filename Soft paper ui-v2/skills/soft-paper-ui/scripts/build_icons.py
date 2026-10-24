#!/usr/bin/env python3
"""Builds an SVG sprite from Lucide icons (ISC licence) and injects it into assets/theme.js.
Add an icon: put its Lucide name in ICONS below, run scripts/build.sh. Requires `npm i lucide-static` once (set LUCIDE_DIR)."""
import os,re,json,sys
root=os.path.join(os.path.dirname(__file__),"..")
LUCIDE=os.environ.get("LUCIDE_DIR","/tmp/lu/node_modules/lucide-static/icons")
ICONS="""menu x panel-left panel-left-open panel-left-close panel-right chevron-left chevron-right chevron-up chevron-down chevrons-up-down
arrow-left arrow-right arrow-up arrow-down search plus minus check trash-2 pencil settings user users house download upload share-2 copy
bell funnel eye eye-off info triangle-alert circle-alert circle-check circle-x ellipsis ellipsis-vertical send mic paperclip sun moon
log-out log-in external-link refresh-cw star heart bookmark lock mail phone calendar clock file-text folder image camera shopping-cart
credit-card wifi-off loader-circle sliders-horizontal layout-grid list book-open graduation-cap circle-help message-square save undo-2 link
sparkles ghost plus-circle layout-dashboard bar-chart-3 clipboard-list school notebook-pen wallet smartphone globe shield-check
square-pen messages-square archive history""".split()
have=set(f[:-4] for f in os.listdir(LUCIDE))
alias={"plus-circle":"circle-plus","bar-chart-3":"chart-column"}
syms=[];miss=[];names=[]
for n in ICONS:
    n=alias.get(n,n)
    if n not in have: miss.append(n); continue
    s=open(os.path.join(LUCIDE,n+".svg")).read()
    inner=re.search(r"<svg[^>]*>(.*)</svg>",s,re.S).group(1).strip()
    inner=re.sub(r"\s+"," ",inner)
    syms.append(f'<symbol id="sp-i-{n}" viewBox="0 0 24 24">{inner}</symbol>'); names.append(n)
sprite='<svg xmlns="http://www.w3.org/2000/svg" style="display:none" aria-hidden="true">'+"".join(syms)+"</svg>"
src=open(os.path.join(root,"assets","theme.src.js")).read()
js=src.replace("/*ICONS_SPRITE*/\"\"",json.dumps(sprite)).replace("/*ICON_NAMES*/[]",json.dumps(names))
open(os.path.join(root,"assets","theme.js"),"w").write(js)
print("icons:",len(names),"missing:",miss)
