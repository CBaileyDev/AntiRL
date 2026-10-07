from pathlib import Path
import re
p=Path(__file__).resolve().parent/'COVERAGE.md'
s=p.read_text(encoding='utf-8')
parts=re.split(r'(`[^`]*`)',s)
fixed=''.join(t if i%2 else re.sub(r'([,;])(?=\S)',r'\1 ',t) for i,t in enumerate(parts))
assert re.findall(r'`([^`]*)`',s)==re.findall(r'`([^`]*)`',fixed)
p.write_text(fixed,encoding='utf-8')
print('Coverage punctuation spacing corrected; file/code spans preserved')
