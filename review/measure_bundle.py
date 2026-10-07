from auditlib import ROOT,REVIEW
import json,gzip
dist=ROOT/'app/dist';files=[p for p in dist.rglob('*') if p.is_file()]
js=sorted([p for p in files if p.suffix=='.js'],key=lambda p:p.stat().st_size,reverse=True)
ranks=list((dist/'ranks').glob('*.png'))
data={'dist_bytes':sum(p.stat().st_size for p in files),'dist_files':len(files),'js_bytes':sum(p.stat().st_size for p in js),'largest_js':{'path':str(js[0].relative_to(ROOT)).replace('\\','/'),'bytes':js[0].stat().st_size,'gzip_bytes':len(gzip.compress(js[0].read_bytes(),mtime=0))},'rank_png_bytes':sum(p.stat().st_size for p in ranks),'rank_png_count':len(ranks),'rank_png_largest':max((p.stat().st_size for p in ranks),default=0)}
(REVIEW/'measurements-bundle.json').write_text(json.dumps(data,indent=2),encoding='utf-8')
print(json.dumps(data,indent=2))
