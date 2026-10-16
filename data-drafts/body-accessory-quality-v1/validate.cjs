const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const base=path.join(__dirname,'完成版');
const files=['体型.json','装飾品.json','品質.json'];
const datasets=files.map(file=>JSON.parse(fs.readFileSync(path.join(base,file),'utf8')));
const expected=[86,260,125];
const norm=x=>x.trim().toLowerCase().replace(/\s+/g,' ');
function validate(data){
 for(const key of ['folders','words','templates'])assert.equal(new Set(data[key].map(x=>x.id)).size,data[key].length,key+' IDs');
 const ids=new Map(data.folders.map(f=>[f.id,f])),ts=new Map(data.templates.map(t=>[t.id,t]));
 const reachable=new Set(['root']);let changed=true;
 while(changed){changed=false;for(const f of data.folders)if(reachable.has(f.parentId)&&!reachable.has(f.id)){reachable.add(f.id);changed=true;}}
 for(const f of data.folders){assert.ok(reachable.has(f.id),'folder must be visible from root '+f.id);assert.equal(typeof f.nsfw,'boolean');}
 for(const w of data.words){
  assert.ok(ids.has(w.folderId));assert.ok(reachable.has(w.folderId));
  assert.ok(w.label_jp&&w.value_en&&w.note);assert.equal(typeof w.nsfw,'boolean');
  assert.equal(w.value_en,w.value_en.trim());assert.ok(!/[\u3040-\u30ff\u3400-\u9fff]/.test(w.value_en),'English field');
  assert.equal(new Set(w.templateIds||[]).size,(w.templateIds||[]).length);
  for(const t of w.templateIds||[])assert.ok(ts.has(t),'template ref '+t);
 }
 assert.equal(new Set(data.words.map(w=>norm(w.value_en))).size,data.words.length,'unique prompt per dataset');
 for(const t of data.templates){
  assert.ok(['before','after'].includes(t.position));assert.equal(typeof t.spaceEnabled,'boolean');
  assert.equal(new Set(t.options.map(o=>o.id)).size,t.options.length);
  for(const o of t.options){assert.ok(o.id&&o.label&&o.value);if(t.position==='after'&&!t.spaceEnabled)assert.ok(o.value.startsWith(', '),'separator');}
 }
 assert.deepEqual(data.cards,[]);
}
datasets.forEach((d,i)=>{validate(d);assert.equal(d.words.length,expected[i]);});
const allNew=datasets.flatMap(d=>d.words);
assert.equal(new Set(allNew.map(w=>w.id)).size,471);
assert.equal(new Set(allNew.map(w=>norm(w.value_en))).size,471);
const html=fs.readFileSync(path.join(base,'体型・装飾品・品質を追加.html'),'utf8');
const scriptBody=html.match(/<script>([\s\S]*)<\/script>/)[1];
new Function(scriptBody);
const serialized=JSON.parse(scriptBody.match(/^const categories=(.*);$/m)[1]);
assert.deepEqual(serialized.map(x=>x[1]),datasets);
const mergeCode=scriptBody.slice(scriptBody.indexOf('function mergeCategories'),scriptBody.indexOf('let current=null'));
const merge=vm.runInNewContext(mergeCode+';mergeCategories');
const existingFiles=['../clothing-v1/衣装_カードと装飾_確認用.json','../hair-v1/髪_カードと装飾_確認用.json','../face-v1/完成版/顔の特徴.json','../face-v1/完成版/表情・視線.json'];
const current={folders:[],words:[],templates:[],cards:[{id:'sentinel-deck',name:'keep',words:[],folderId:'root',type:'positive',nsfw:false}],favorites:[{id:'sentinel-favorite'}],qualityTemplates:[{id:'sentinel-quality'}],comfyPresets:{sentinel:true},settings:{sentinel:true}};
for(const f of existingFiles){const old=JSON.parse(fs.readFileSync(path.resolve(__dirname,f),'utf8'));for(const key of ['folders','words','templates'])for(const item of old[key])if(!current[key].some(x=>x.id===item.id))current[key].push(item);}
const snapshot=JSON.stringify(current);
const merged=merge(current,datasets);
assert.equal(merged.counts.words,471);
assert.equal(merged.counts.templates,16);
assert.equal(merged.result.words.length,current.words.length+471);
assert.equal(JSON.stringify(current),snapshot,'input untouched');
for(const key of ['cards','favorites','qualityTemplates','comfyPresets','settings'])assert.equal(JSON.stringify(merged.result[key]),JSON.stringify(current[key]),'preserve '+key);
for(const key of ['folders','words','templates'])for(const item of current[key])assert.equal(JSON.stringify(merged.result[key].find(x=>x.id===item.id)),JSON.stringify(item),'preserve existing '+key);
const again=merge(merged.result,datasets);
assert.equal(again.counts.words,0);assert.equal(again.counts.templates,0);assert.equal(JSON.stringify(again.result),JSON.stringify(merged.result),'idempotence');
for(let i=0;i<datasets.length;i++){const single=merge(current,[datasets[i]]);assert.equal(single.counts.words,expected[i]);assert.equal(single.result.words.length,current.words.length+expected[i]);}
const semantic=JSON.parse(snapshot);semantic.words.push({id:'user-custom-slim',folderId:semantic.folders[0].id,label_jp:'keep',value_en:' SLIM   BODY ',note:'custom',nsfw:false});
const dedup=merge(semantic,[datasets[0]]);assert.equal(dedup.counts.skipPrompt,1);assert.equal(dedup.counts.words,85);
const invalid=JSON.parse(snapshot);invalid.words.push(invalid.words[0]);assert.throws(()=>merge(invalid,datasets),/ID/);
const folders=new Set(['root',...merged.result.folders.map(f=>f.id)]),templates=new Set(merged.result.templates.map(t=>t.id));
for(const w of merged.result.words){assert.ok(folders.has(w.folderId));for(const id of w.templateIds||[])assert.ok(templates.has(id),'global template '+id);}
for(const key of ['folders','words','templates'])assert.equal(new Set(merged.result[key].map(x=>x.id)).size,merged.result[key].length);
console.log(JSON.stringify({status:'PASS',counts:expected,newWords:471,newTemplates:16,existingWords:current.words.length,mergedWords:merged.result.words.length,folderVisibility:'PASS',schemaAndReferences:'PASS',htmlSyntaxAndPayload:'PASS',reimportAndCategorySelection:'PASS',existingDataAndSettings:'PASS',englishDedup:'PASS'}));

