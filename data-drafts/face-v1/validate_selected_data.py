from pathlib import Path
import json,re
b=Path('data-drafts/face-v1')
d=json.loads((b/'目・表情・視線_カードと装飾_確認用.json').read_text(encoding='utf-8-sig'))
ids=[x['id'] for group in ('folders','words','templates') for x in d[group]]
assert len(ids)==len(set(ids))
fs={f['id'] for f in d['folders']}|{'root'}
ts={t['id'] for t in d['templates']}
for f in d['folders']: assert f['parentId'] in fs
for w in d['words']:
 assert w['folderId'] in fs
 assert all(t in ts for t in w.get('templateIds',[]))
 assert len(w.get('templateIds',[]))==len(set(w.get('templateIds',[])))
assert len({w['value_en'].lower().strip() for w in d['words']})==len(d['words'])
for name in ['顔の特徴を追加.html','目・表情・視線を追加.html']:
 html=(b/name).read_text(encoding='utf-8-sig')
 payload=json.loads(re.search(r'^const payload=(.*);$',html,re.M).group(1))
 assert payload==d,name
delta=json.loads((b/'顔_選択データから補完_カード追加用.json').read_text(encoding='utf-8'))
assert len(delta['words'])==15
print('PASS: disk JSON, references, unique prompts, both HTML payloads, delta')
print('words',len(d['words']),'templates',len(d['templates']),'options',sum(len(t['options']) for t in d['templates']))

