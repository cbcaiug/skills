#!/usr/bin/env python3
"""tokens/tokens.json -> CSS variable blocks (light, dark-by-system, dark-forced) injected into assets/theme.src.css."""
import json,os,re
root=os.path.join(os.path.dirname(__file__),"..")
tok=json.load(open(os.path.join(root,"tokens","tokens.json")))
light=[];dark=[]
for k,v in tok["color"].items():
    light.append(f"--sp-{k}:{v['$value']};"); dark.append(f"--sp-{k}:{v['$extensions']['dark']};")
common=[f"--sp-{k}:{v['$value']};" for k,v in tok["common"].items()]
L="\n  ".join(light+common); D="\n    ".join(dark)
block=f"""/*TOKENS:START (generated from tokens/tokens.json - do not edit by hand)*/
@S{{
  color-scheme:light;
  {L}
}}
@media (prefers-color-scheme:dark){{
  @S:not([data-color="light"]){{
    color-scheme:dark;
    {D}
  }}
}}
@S[data-color="dark"]{{
  color-scheme:dark;
  {D}
}}
/*TOKENS:END*/"""
p=os.path.join(root,"assets","theme.src.css"); s=open(p).read()
s=re.sub(r"/\*TOKENS:START.*?TOKENS:END\*/",lambda m:block,s,flags=re.S); open(p,"w").write(s)
print("tokens injected:",len(tok["color"]),"colour tokens +",len(tok["common"]),"shared tokens")
