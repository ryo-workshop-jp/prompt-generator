import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareDeckImport } from '../src/utils/デッキ読込.ts';
import { validateImport } from '../src/utils/インポート検証.ts';
import { normalizeComfyPresetConfig } from '../src/constants/comfyPresets.ts';

const deck = {id:'deck',name:'デッキ',folderId:'child',type:'positive',nsfw:false,words:[{wordId:'external',label_jp:'花',value_en:'flower',repeat:3,strength:1.2}]};
test('デッキの保存先と親フォルダーを復元し、既存の同一IDは置き換えない',()=>{
    const existing=[{id:'parent',name:'既存',parentId:'root'}];
    const incoming=[{id:'parent',name:'別名',parentId:'root'},{id:'child',name:'子',parentId:'parent'}];
    const before=structuredClone({existing,incoming,deck});
    const next=prepareDeckImport(existing,incoming,[deck]);
    assert.deepEqual(next.folders,[existing[0],incoming[1]]);
    assert.deepEqual(next.cards,[deck]);
    assert.equal(next.movedToRoot,0);
    assert.deepEqual({existing,incoming,deck},before);
});
test('古いデッキ単体JSONで保存先がない場合、rootへ配置する',()=>{
    const next=prepareDeckImport([],[],[deck]);
    assert.equal(next.cards[0].folderId,'root');
    assert.equal(next.movedToRoot,1);
    assert.deepEqual(next.cards[0].words,deck.words);
});
test('親が欠けた追加フォルダーも見える位置に補正し、既存フォルダーは維持する',()=>{
    const existing=[{id:'existing',name:'既存',parentId:'outside'}];
    const next=prepareDeckImport(existing,[{id:'child',name:'子',parentId:'missing'}],[deck]);
    assert.equal(next.folders.find(folder=>folder.id==='child').parentId,'root');
    assert.deepEqual(next.folders[0],existing[0]);
    assert.equal(next.reparentedFolders,1);
});
test('デッキImportに同梱したフォルダーの型と結合後の循環を検査する',()=>{
    assert.throws(()=>validateImport({cards:[deck],folders:[null]},'cards'));
    assert.throws(()=>validateImport({cards:[deck],folders:[{id:'b',name:'B',parentId:'a'}]},'cards',[{id:'a',name:'A',parentId:'b'}]));
    assert.throws(()=>validateImport({cards:[deck],folders:[{id:'a',name:'A',parentId:'a'}]},'cards'));
    validateImport({cards:[deck],folders:[{id:'child',name:'子',parentId:'root'}]},'cards');
});
test('Comfy設定は範囲外・非有限数を補正し、CFGの0と独自プリセットを保持する',()=>{
    const result=normalizeComfyPresetConfig({mine:{label:'  独自  ',width:10000,height:1,steps:Infinity,cfgScale:0,sampler:'euler',scheduler:'normal'}});
    assert.equal(result.mine.label,'独自');
    assert.equal(result.mine.width,4096);
    assert.equal(result.mine.height,64);
    assert.equal(result.mine.steps,28);
    assert.equal(result.mine.cfgScale,0);
    assert.equal(result.mine.sampler,'euler');
    assert.equal(result.mine.scheduler,'normal');
});
