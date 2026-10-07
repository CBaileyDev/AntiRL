from pathlib import Path
import json,re,collections
root=Path(__file__).resolve().parent.parent
css=(root/'app/src/styles.css').read_text(encoding='utf8'); sources=list((root/'app/src').rglob('*.tsx'))+list((root/'app/src').rglob('*.ts'))
combined='\n'.join(p.read_text(encoding='utf8') for p in sources)
selectors=[]
for m in re.finditer(r'([^{}]+)\{',css):
    s=m[1].strip()
    if s.startswith('@') or '/*' in s:continue
    selectors.extend(s.split(','))
counter=collections.Counter(s.strip() for s in selectors)
classes=set(re.findall(r'\.([A-Za-z][\w-]*)',css))
possible_dead=sorted(c for c in classes if c not in combined)
def lum(hex):
    r=[int(hex[i:i+2],16)/255 for i in (1,3,5)]
    r=[v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in r]
    return sum(v*w for v,w in zip(r,[.2126,.7152,.0722]))
def contrast(a,b):return round((max(lum(a),lum(b))+.05)/(min(lum(a),lum(b))+.05),3)
facts={'styles_lines':len(css.splitlines()),'selector_redefinitions':{k:v for k,v in counter.items() if v>1},'distinct_font_size_values':sorted(set(re.findall(r'font-size:\s*([^;]+);',css))),'inline_style_openers':combined.count('style={{'),'possible_unused_classes':possible_dead,'literal_hex_colors_outside_root':len(re.findall(r'#[0-9A-Fa-f]{3,8}\b',css[css.index('}',css.index(':root'))+1:])), 'contrast':[{'fg':fg,'bg':bg,'ratio':contrast(fg,bg)} for fg in ['#64748b','#6366f1','#818cf8','#94a3b8','#a8b4c8','#a5b4fc','#f8fafc','#ffffff'] for bg in ['#080a0f','#121722','#182030','#6366f1','#4f46e5']], 'htmlFor_occurrences':combined.count('htmlFor'),'wrapped_labels_exist': '<label' in combined,'user_select_none_in_body':'user-select: none' in css}
(root/'review/design-census.json').write_text(json.dumps(facts,indent=2),encoding='utf8')
terms=re.compile(r'unavailable|legacy equal|legacy mean|not proven|not calibrated|uncalibrated|not a probability|not a verdict|not evidence|not proof|not a prediction|not predict|not establish|not automatically|not total|no reliable|no grade|grades and|rank forecasts|promotion estimate|does not predict|do not predict|no universal|decorative|inferred from|engineering limits|disabled pending|context dependent|unknown|unsupported|self.reported|insufficient|cannot|can.t|not implemented|descriptive|estimated|heuristic|provenance|coverage limit|await.*valid|proxy',re.I)
rows=[]
paths=list((root/'app/src').rglob('*.tsx'))+list((root/'app/src/data').glob('*.json'))
for p in paths:
    for i,line in enumerate(p.read_text(encoding='utf8').splitlines(),1):
        if terms.search(line):
            code_only= bool(re.match(r'\s*(import|interface|type|const|//|\*)',line)) or 'unavailable_reason' in line or '=== "unavailable"' in line or bool(re.match(r'\s*[\w]+\??:\s*(boolean|string|number|null|"unavailable")\b',line))
            classification='Code/type/status token (not automatically visible)' if code_only else ('Prompt policy, not UI copy' if p.name=='coach-prompts.json' else 'Visible or data-driven copy candidate')
            action='Keep in manifest/details; show only when it changes the decision'
            if any(x in line.lower() for x in ['no grade','grades and','promotion estimate','not proven waste','legacy equal','legacy means','not calibrated','uncalibrated','unavailable']):action='Move to methodology or Lab; replace main-flow paragraph with coverage/confidence + a next action'
            if 'disabled pending' in line.lower():action='Cut developer release status from product; actionable provider status belongs in Settings'
            if p.name=='coach-prompts.json':action='Keep backend policy out of user input; rewrite fallback as a coaching card'
            rows.append({'file':str(p.relative_to(root)).replace('\\','/'),'line':i,'text':line.strip(),'classification':classification,'action':action})
md=['# Disclaimer and hedge inventory','', 'Scope: every matching source line in app/src TSX and data JSON. This is an exhaustive lexical inventory for the stated term set, not a count of unique runtime messages. Code/status tokens and prompt policy are explicitly separated from rendered copy. Dynamic backend reasons can add messages at runtime. The long prompt lines are preserved as source references rather than reproduced here.','',f'Found {len(rows)} candidate lines; `unavailable` occurs {sum(len(re.findall("unavailable",r["text"],re.I)) for r in rows)} times in them. Source census: `review/design-census.json`.','', 'Policy: main coach answer gets one short confidence sentence or badge and at most one limitation that changes the next action. Evidence details retain denominator, missing coverage, source/model version and exact limitations. Lab can show scientific caveats because entering it is an explicit analytical choice. Consent, actual third-party endpoint and failure reasons are not hidden.','', '| Source | Class | Text / source excerpt | Disposition |','|---|---|---|---|']
for r in rows:
    text=r['text'][:260].replace('|','\\|').replace('\n',' ')
    md.append(f'| {r["file"]}:{r["line"]} | {r["classification"]} | `{text}` | {r["action"]} |')
(root/'review/DISCLAIMER_INVENTORY.md').write_text('\n'.join(md)+'\n',encoding='utf8')
print(json.dumps({'lines':facts['styles_lines'],'redefined_selectors':len(facts['selector_redefinitions']),'font_sizes':len(facts['distinct_font_size_values']),'inline_styles':facts['inline_style_openers'],'possible_dead':len(possible_dead),'color_literals':facts['literal_hex_colors_outside_root'],'disclaimer_candidate_lines':len(rows),'unavailable_occurrences':sum(len(re.findall('unavailable',r['text'],re.I)) for r in rows)}))
