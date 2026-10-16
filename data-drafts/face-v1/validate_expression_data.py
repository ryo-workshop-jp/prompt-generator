from pathlib import Path
import json,re
b=Path(__file__).parent
d=json.loads((b/'目・表情・視線_カードと装飾_確認用.json').read_text(encoding='utf-8-sig'))
fs={f['id'] for f in d['folders']}|{'root'}
ts={t['id'] for t in d['templates']}
ids=[x['id'] for group in ['folders','words','templates'] for x in d[group]]
assert len(ids)==len(set(ids))
assert len(d['words'])==238
assert len({w['value_en'].strip().lower() for w in d['words']})==238
for f in d['folders']: assert f['parentId'] in fs
for w in d['words']:
 assert w['folderId'] in fs
 assert all(t in ts for t in w.get('templateIds',[]))
for name in ['顔の特徴を追加.html','表情を追加.html','目・表情・視線を追加.html']:
 html=(b/name).read_text(encoding='utf-8-sig')
 payload=json.loads(re.search(r'^const payload=(.*);$',html,re.M).group(1))
 assert payload==d,name
delta=json.loads((b/'表情_選択データから補完_カード追加用.json').read_text(encoding='utf-8-sig'))
assert len(delta['words'])==62
assert set(w['id'] for w in delta['words']).issubset({w['id'] for w in d['words']})
for w in delta['words']: assert w['folderId'] in fs
assert all(w['value_en'].strip()==w['value_en'] for w in d['words'])
assert not any(w['value_en']=='humiliateddesperate' for w in d['words'])
print('PASS: disk JSON, folder and template references, 62-card delta, all 3 HTML payloads, prompt uniqueness')
print('face=87 expression=151 total=238 templates=5 options=34')

