const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const drafts = path.resolve(__dirname, '..');
const project = path.resolve(drafts, '..');
const sourceFiles = [
  'clothing-v1/衣装_カードと装飾_確認用.json',
  'hair-v1/髪_カードと装飾_確認用.json',
  'face-v1/完成版/顔の特徴.json',
  'face-v1/完成版/表情・視線.json',
  'body-accessory-quality-v1/完成版/体型.json',
  'body-accessory-quality-v1/完成版/装飾品.json',
  'body-accessory-quality-v1/完成版/品質.json',
  'background-pose-action-v1/完成版/背景.json',
  'background-pose-action-v1/完成版/ポーズ.json',
  'background-pose-action-v1/完成版/動作.json',
  'composition-v1/完成版/構図・画角・視点.json',
  '光・天候・季節・雰囲気/完成版/光の演出.json',
  '光・天候・季節・雰囲気/完成版/季節・時間・天候.json',
  '光・天候・季節・雰囲気/完成版/雰囲気.json',
  'シチュエーション・行事/完成版/シチュエーション・行事.json',
  '人物・家具・小物と身近な物/完成版/人物・肌・種族.json',
  '人物・家具・小物と身近な物/完成版/家具.json',
  '人物・家具・小物と身近な物/完成版/道具・小物.json',
  '人物・家具・小物と身近な物/完成版/食べ物・飲み物.json',
  '人物・家具・小物と身近な物/完成版/動物・植物.json',
  '人物・家具・小物と身近な物/完成版/乗り物.json',
];
const read = filename => JSON.parse(fs.readFileSync(filename, 'utf8'));
const normalize = value => value.trim().toLowerCase().replace(/\s+/g, ' ');
const data = { folders: [], words: [], templates: [], cards: [] };
const folders = new Map();
const words = new Map();
const prompts = new Map();
const templates = new Map();
const sourceSummary = [];
const duplicateSummary = [];

function addFolder(folder, source) {
  const old = folders.get(folder.id);
  if (old) {
    if (folder.id !== 'hg26_hair_v1_test') {
      assert.deepEqual(folder, old, `異なる内容のフォルダIDが重複: ${source}: ${folder.id}`);
    } else {
      // 人物の完成版で、髪カテゴリに置いた試験用フォルダを整理済み。
      Object.assign(old, folder);
    }
    return;
  }
  const copy = structuredClone(folder);
  data.folders.push(copy);
  folders.set(copy.id, copy);
}

function addTemplate(template, source) {
  const old = templates.get(template.id);
  if (old) {
    assert.deepEqual(template, old, `異なる内容の装飾IDが重複: ${source}: ${template.id}`);
    return;
  }
  const copy = structuredClone(template);
  data.templates.push(copy);
  templates.set(copy.id, copy);
}

function addWord(word, source) {
  const key = normalize(word.value_en);
  const sameId = words.get(word.id);
  const samePrompt = prompts.get(key);
  if (sameId || samePrompt) {
    assert(!sameId || normalize(sameId.value_en) === key, `同じIDで別の英語: ${source}: ${word.id}`);
    assert(!sameId || !samePrompt || sameId === samePrompt, `IDと英語の衝突: ${source}: ${word.id}`);
    const old = sameId || samePrompt;
    duplicateSummary.push({ source, prompt: word.value_en, retainedId: old.id });
    if (sameId && word.id.startsWith('hg26_hair_v1_w_test_')) {
      // 1girl/1boy は以前のIDを残し、後の人物カテゴリの分類とラベルを採用。
      old.folderId = word.folderId;
      old.label_jp = word.label_jp;
      old.note = word.note;
    }
    for (const id of word.templateIds || []) {
      old.templateIds ||= [];
      if (!old.templateIds.includes(id)) old.templateIds.push(id);
    }
    return old;
  }
  const copy = structuredClone(word);
  data.words.push(copy);
  words.set(copy.id, copy);
  prompts.set(key, copy);
  return copy;
}

for (const file of sourceFiles) {
  const source = path.join(drafts, file);
  const part = read(source);
  assert(Array.isArray(part.folders) && Array.isArray(part.words) && Array.isArray(part.templates));
  for (const folder of part.folders) addFolder(folder, file);
  for (const template of part.templates) addTemplate(template, file);
  for (const word of part.words) addWord(word, file);
  sourceSummary.push({ file: `data-drafts/${file}`, words: part.words.length, templates: part.templates.length });
}

const shoeSource = read(path.join(project, '靴_差分プロンプトデータ.json'));
assert.equal(shoeSource.words.length, 54);
const shoeFolder = 'cg26_clothing_v1_f_shoes';
assert(folders.has(shoeFolder));
let newShoes = 0;
for (const original of shoeSource.words) {
  const word = structuredClone(original);
  word.folderId = shoeFolder;
  if (!prompts.has(normalize(word.value_en))) {
    // 靴の追加カードにも既存の衣装用装飾を使用できるようにする。
    word.templateIds = ['cg26_clothing_v1_t_color'];
    if (!/^leather shoes$/i.test(word.value_en)) word.templateIds.push('cg26_clothing_v1_t_shoe_material');
    addWord(word, '靴_差分プロンプトデータ.json');
    newShoes++;
  } else {
    duplicateSummary.push({ source: '靴_差分プロンプトデータ.json', prompt: word.value_en, retainedId: prompts.get(normalize(word.value_en)).id });
  }
}
sourceSummary.push({ file: '靴_差分プロンプトデータ.json', words: 54, added: newShoes });

const hidingSource = read(path.join(project, '動作_隠す_差分プロンプトデータ.json'));
assert.equal(hidingSource.words.length, 34);
const hidingParent = 'mg26_action_v1_f_hide';
assert(folders.has(hidingParent));
for (const original of hidingSource.folders) {
  const folder = structuredClone(original);
  folder.parentId = hidingParent;
  addFolder(folder, '動作_隠す_差分プロンプトデータ.json');
}
let newHiding = 0;
let reclassified = 0;
for (const original of hidingSource.words) {
  const existing = prompts.get(normalize(original.value_en));
  if (existing) {
    // この差分には、既存カードを「隠す」の小分類へ移す指定も含まれていた。
    assert(folders.has(original.folderId));
    existing.folderId = original.folderId;
    existing.nsfw = Boolean(existing.nsfw || original.nsfw);
    reclassified++;
    duplicateSummary.push({ source: '動作_隠す_差分プロンプトデータ.json', prompt: original.value_en, retainedId: existing.id });
  } else {
    addWord(original, '動作_隠す_差分プロンプトデータ.json');
    newHiding++;
  }
}
sourceSummary.push({ file: '動作_隠す_差分プロンプトデータ.json', words: 34, added: newHiding, reclassified });

// 旧稿や統合前の控えは最新の完成版と重なるため、出典にはしない。
assert.equal(newShoes, 39);
assert.equal(newHiding, 19);
assert.equal(reclassified, 15);
assert.equal(data.words.length, 2770);
assert.equal(words.size, data.words.length);
assert.equal(prompts.size, data.words.length);
for (const folder of data.folders) {
  let current = folder.id;
  const seen = new Set();
  while (current !== 'root') {
    assert(!seen.has(current), `フォルダ階層が循環: ${folder.id}`);
    seen.add(current);
    const item = folders.get(current);
    assert(item, `フォルダ参照がない: ${folder.id} -> ${current}`);
    current = item.parentId;
  }
}
for (const word of data.words) {
  assert(folders.has(word.folderId), `カードのフォルダ参照がない: ${word.id}`);
  assert(word.label_jp && word.value_en && typeof word.nsfw === 'boolean');
  for (const id of word.templateIds || []) assert(templates.has(id), `カードの装飾参照がない: ${word.id} -> ${id}`);
}
for (const template of data.templates) {
  assert(Array.isArray(template.options));
  assert.equal(new Set(template.options.map(o => o.id)).size, template.options.length);
}
assert.equal(data.cards.length, 0);
const output = path.join(__dirname, 'これまでのプロンプト_統合版.json');
const serialized = JSON.stringify(data, null, 2) + '\n';
fs.writeFileSync(output, serialized);
// 統合版をPromptGeneratorの初期データとして使用する。再生成時も同期させる。
fs.writeFileSync(path.join(project, '初期データ.json'), serialized);
const report = {
  files: sourceSummary,
  totals: { folders: data.folders.length, words: data.words.length, templates: data.templates.length, decorationOptions: data.templates.reduce((n, t) => n + t.options.length, 0), cards: data.cards.length },
  decisions: { reusedPersonTestCards: 2, shoeWordsAdded: newShoes, hidingWordsAdded: newHiding, hidingWordsReclassified: reclassified },
  duplicates: duplicateSummary,
};
fs.writeFileSync(path.join(__dirname, '統合検証結果.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ output, totals: report.totals, decisions: report.decisions, duplicates: duplicateSummary.length }, null, 2));
