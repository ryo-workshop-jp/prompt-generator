from pathlib import Path
import json,re
b=Path(__file__).parent
d=json.loads((b/'目・表情・視線_カードと装飾_確認用.json').read_text(encoding='utf-8-sig'))
h=b/'目・表情・視線を追加.html'
text=h.read_text(encoding='utf-8-sig')
text=re.sub(r'^const payload=.*?;$',lambda m:'const payload='+json.dumps(d,ensure_ascii=False,separators=(',',':'))+';',text,flags=re.M)
text=re.sub(r'<h1>.*?</h1>','<h1>顔の特徴・表情'+str(len(d['words']))+'枚と装飾5群</h1>',text,count=1)
h.write_text(text,encoding='utf-8')
for name in ['README.md','顔の特徴_追加手順.md']:
 p=b/name
 old=p.read_text(encoding='utf-8-sig') if p.exists() else ''
 banner='## 最新版：表情の補完\n\n顔の特徴87枚・表情と視線151枚、合計238枚です。装飾5群・34候補。表情62枚を追加しました。\n\n採用の理由は「表情_選択データ_採用判断.md」、表情全体は「表情・視線_最新版の収録一覧.md」を確認してください。追加には「表情を追加.html」、カードだけなら「表情_選択データから補完_カード追加用.json」の追加Importを使います。\n\n---\n\n'
 if not old.startswith(banner): p.write_text(banner+old,encoding='utf-8')
print('legacy helper and instructions updated')

