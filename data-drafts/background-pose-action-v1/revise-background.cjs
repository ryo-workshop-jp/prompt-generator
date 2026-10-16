const fs=require('fs'),path=require('path');
const dir=path.join(__dirname,'完成版'),file=path.join(dir,'背景.json'),d=JSON.parse(fs.readFileSync(file,'utf8')),prefix='lg26_background_v1_t_';
const before=new Map(d.words.map(w=>[w.id,JSON.stringify(w.templateIds||[])]));
function template(key,name,opts){const id=prefix+key;if(!d.templates.some(t=>t.id===id))d.templates.push({id,name,folderId:'背景 / '+name,position:'after',spaceEnabled:false,allowFree:true,options:opts.map(([label,value],i)=>({id:id+'_o_'+i,label,value:', '+value}))});}
template('lighting','室内の照明',[['明るい照明','bright lighting'],['薄暗い照明','dim lighting'],['暖色の照明','warm lighting'],['寒色の照明','cool lighting'],['蛍光灯','fluorescent lighting'],['ろうそくの光','candlelight']]);
template('windowweather','窓の外の天気',[['窓の外が晴れ','clear sky outside window'],['窓の外が曇り','overcast sky outside window'],['窓の外に雨','rain outside window'],['窓の外に雪','falling snow outside window'],['窓の外に霧','fog outside window']]);
template('occupancy','室内の人の多さ',[['人のいない室内','unoccupied interior'],['背景に人がいる','people in background'],['人で混んだ室内','crowded interior']]);
const set=s=>new Set(s.split('|'));
const outdoors=set('balcony|terrace|engawa|ship deck|empty street|busy street');
const ambiguous=set('temple|church|train station|hotel');
const nonroom=set('balcony|terrace|engawa');
const underground=set('cave|ice cave|basement|dungeon');
const fantasyIndoor=set('castle hall|throne room|magical library|space station interior');
const styleFixed=set('tatami room|cute room|monochrome room|minimalist room|retro room');
const tidyFixed=set('messy room|cluttered room|empty room');
const lightFixed=set('sunlit room|bright room|dark room');
const noOccupancy=set('closet interior|cockpit');
const noWindows=set('closet interior|basement|windowless room|spaceship interior|space station interior|dungeon|cave|ice cave|school gym storage room|movie theater|theater|karaoke room|manga cafe private room|warehouse|attic');
const transportStyle=set('train interior|car interior|bus interior|airplane cabin|ship interior|sleeper train interior|ferris wheel gondola interior');
function add(w,keys){w.templateIds=[...new Set([...(w.templateIds||[]),...keys.map(k=>prefix+k)])];}
for(const w of d.words){const v=w.value_en,g=w.folderId.split('_f_')[1];
 if(outdoors.has(v)){add(w,['time','weather','season']);continue;}
 if(v==='snowfield')add(w,['weather']);
 if(ambiguous.has(v))add(w,['time']);
 const indoor=(g==='school'&&!['schoolyard','school rooftop'].includes(v))||(g==='commercial'&&!['hotel','amusement park','zoo'].includes(v))||(g==='home'&&!nonroom.has(v))||(g==='transport'&&v!=='ship deck')||fantasyIndoor.has(v)||underground.has(v);
 if(indoor){if(!['spaceship interior','space station interior','dungeon','cave','ice cave','sunlit room'].includes(v))add(w,['time']);if(!lightFixed.has(v))add(w,['lighting']);
 if(!underground.has(v)&&!['spaceship interior','space station interior','cockpit'].includes(v)&&!noWindows.has(v))add(w,['windowweather']);
 if(!noOccupancy.has(v))add(w,['occupancy']);
 if(!styleFixed.has(v)&&!underground.has(v)&&!['spaceship interior','space station interior','cockpit','closet interior'].includes(v))add(w,['roomstyle']);
 if(!tidyFixed.has(v)&&!['cave','ice cave','dungeon'].includes(v))add(w,['tidiness']);
 }
 if(g==='pattern')add(w,['color']);
 if(['gradient background','abstract background'].includes(v))add(w,['color']);
}
fs.writeFileSync(file,JSON.stringify(d,null,2)+'\n');
let html=fs.readFileSync(path.join(dir,'背景・ポーズ・動作を追加.html'),'utf8');
const cats=['背景','ポーズ','動作'].map(n=>[n,JSON.parse(fs.readFileSync(path.join(dir,n+'.json'),'utf8'))]);
html=html.replace(/const categories=.*;/,'const categories='+JSON.stringify(cats)+';').replace('197カード・7装飾群','197カード・10装飾群');
html=html.replace('skipId:0,skipPrompt:0','skipId:0,skipPrompt:0,links:0');
const old="if(maps[key].has(item.id)){if(key==='words')counts.skipId++;continue;}";
const fix="if(maps[key].has(item.id)){if(key==='words'){counts.skipId++;const existing=maps.words.get(item.id);if(norm(existing.value_en)===norm(item.value_en)&&existing.folderId===item.folderId){const oldIds=existing.templateIds||[];const added=(item.templateIds||[]).filter(t=>!oldIds.includes(t));if(added.length){existing.templateIds=[...oldIds,...added];counts.links+=added.length;}}}continue;}";
html=html.replace(old,fix).replace('既存カードの内容や装飾の紐付けは変更しません。','同じID・英語・フォルダのカードには不足する装飾の紐付けを補います。既存の文章や設定は保持します。').replace("+'カード\\n追加後：'","+'カード\\n補った装飾の紐付け：'+merged.counts.links+'件\\n追加後：'");
fs.writeFileSync(path.join(dir,'背景・ポーズ・動作を追加.html'),html);
const esc=s=>String(s||'').replace(/\|/g,'\\|').replace(/\n/g,' '),tm=new Map(d.templates.map(t=>[t.id,t.name]));
let md='# 背景：完成版の収録一覧\n\n197枚、装飾10群・61選択肢。短い英語と見た目・用途の注釈で整理しています。画像生成結果は未検証です。\n';
for(const f of d.folders.filter(f=>f.parentId!=='root')){md+='\n## '+f.name+'\n\n| カード名 | 英語 | 注釈 | 装飾 |\n|---|---|---|---|\n';for(const w of d.words.filter(w=>w.folderId===f.id))md+='| '+[w.label_jp,w.value_en,w.note,(w.templateIds||[]).map(t=>tm.get(t)).join('／')].map(esc).join(' | ')+' |\n';}
for(const t of d.templates){md+='\n## 装飾：'+t.name+'\n\n';md+=t.options.map(o=>'- '+o.label+'：`'+o.value+'`').join('\n')+'\n';}
fs.writeFileSync(path.join(dir,'背景_収録一覧.md'),md);
let readme=fs.readFileSync(path.join(dir,'README.md'),'utf8');readme=readme.replace('|背景|197|7|47|','|背景|197|10|61|').replace('|合計|615|18|111|','|合計|615|21|125|').replace('省略された既存カードに装飾を追加する処理はありません。','同じID・英語・フォルダの既存カードには、不足している装飾の紐付けだけを補います。既存の装飾は残します。修正前の背景を読み込み済みでも、このページで現在の全データを処理すれば反映できます。').replace('座る場所・脚の形・持つ物・楽器・抱きしめ方などを装飾で選べます。','学校内・店舗・住居・乗り物内などにも、時間帯・照明・内装・片付き方・人の多さを紐付けました。窓の外の天気は適した室内に限定しています。\n- 座る場所・脚の形・持つ物・楽器・抱きしめ方などを装飾で選べます。');fs.writeFileSync(path.join(dir,'README.md'),readme);
console.log(JSON.stringify({changedCards:d.words.filter(w=>before.get(w.id)!==JSON.stringify(w.templateIds||[])).length,templates:d.templates.length,options:d.templates.reduce((a,t)=>a+t.options.length,0),school:d.words.filter(w=>w.folderId.endsWith('_school')).map(w=>({name:w.label_jp,templates:w.templateIds}))},null,2));
