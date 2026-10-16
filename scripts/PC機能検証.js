// Playwright CLIのテスト専用セッションで実行する。セッション内の保存データを置換する。
// クリップボードはテスト用実装に差し替え、OSのクリップボードを変更しない。
async page => {
    const url = new URL(page.url());
    if (url.hostname !== '127.0.0.1' || url.port !== '5186') throw new Error('テスト用ローカルサーバー以外では実行できません。');
    page.setDefaultTimeout(6000);
    await page.setViewportSize({width:1366,height:768});
    const errors=[];
    const consoleErrors=[];
    const expectedErrors=[];
    let rejectingInvalidImport=false;
    const downloads=[];
    page.on('pageerror',error=>errors.push(error.message));
    page.on('console',message=>{
        if(message.type()!=='error')return;
        const target=rejectingInvalidImport&&message.text().startsWith('Failed to import data')?expectedErrors:consoleErrors;
        target.push(message.text().slice(0,180));
    });
    page.on('download',download=>downloads.push(download.suggestedFilename()));
    await page.addInitScript(()=>{
        window.__pcTest={alerts:[],confirms:[],clipboardFails:false,writes:[],blobs:[]};
        window.alert=message=>window.__pcTest.alerts.push(String(message));
        window.confirm=message=>{window.__pcTest.confirms.push(String(message));return true;};
        Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{
            if(window.__pcTest.clipboardFails)throw new DOMException('検証用の拒否','NotAllowedError');
            window.__pcTest.writes.push(text);
        }}});
        const create=URL.createObjectURL.bind(URL);
        URL.createObjectURL=blob=>{window.__pcTest.blobs.push(blob);return create(blob);};
        const nativeClick=HTMLInputElement.prototype.click;
        HTMLInputElement.prototype.click=function(){if(this.type!=='file')nativeClick.call(this);};
    });
    const word=(id,label,value,extra={})=>({id,folderId:'test-folder',label_jp:label,value_en:value,nsfw:false,...extra});
    const fixture={folders:[{id:'test-folder',name:'検証用',parentId:'root',nsfw:false}],words:[word('sky','青い空','blue sky'),word('blur','ぼかし','blurry')],templates:[],cards:[]};
    const preset={label:'標準検証',description:'検証用',width:896,height:1152,steps:24,cfgScale:5.5,sampler:'euler',scheduler:'normal'};
    const quality=[{id:'q-positive',name:'品質確認',type:'positive',nsfw:false,words:[{...word('q-word','高品質','high quality'),type:'positive',strength:1}]}];
    const results=[];
    const assert=(value,message)=>{if(!value)throw new Error(message);};
    const seed=async(data=fixture)=>{
        await page.evaluate(({data,preset,quality})=>{
            for(const key of Object.keys(localStorage))if(key.startsWith('promptgen:'))localStorage.removeItem(key);
            localStorage.setItem('promptgen:data',JSON.stringify(data));
            localStorage.setItem('promptgen:notice-dismissed','1');
            localStorage.setItem('promptgen:comfy-presets',JSON.stringify({standard:preset,custom:{...preset,label:'任意サイズ'}}));
            localStorage.setItem('promptgen:quality-templates',JSON.stringify(quality));
        },{data,preset,quality});
        await page.reload();
        await page.locator('body').ariaSnapshot();
    };
    const stored=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('promptgen:data')));
    const waitStored=async predicate=>{
        await page.waitForFunction(predicate);
        return stored();
    };
    const check=async(name,fn)=>{
        try{await fn();results.push({name,passed:true});}
        catch(error){results.push({name,passed:false,error:String(error.message)});}
    };
    const modal=()=>page.locator('div.fixed.inset-0').last();
    const positive=()=>page.locator('.prompt-section').first();
    const settings=async()=>{
        await page.getByRole('button',{name:'データ管理',exact:true}).click();
        await page.getByRole('button',{name:'カードデータのExport/Import',exact:true}).click();
    };
    const row=name=>page.getByText(name,{exact:true}).locator('..').locator('..');
    const importJSON=async(name,payload)=>{
        await row(name).getByRole('button',{name:'Import',exact:true}).click();
        await page.locator('input[type=file]').setInputFiles({name:'機能検証.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(payload))});
    };
    const exportJSON=async(name)=>{
        const count=await page.evaluate(()=>window.__pcTest.blobs.length);
        await row(name).getByRole('button',{name:'Export',exact:true}).click();
        await page.waitForFunction(count=>window.__pcTest.blobs.length>count,count);
        return page.evaluate(async()=>JSON.parse(await window.__pcTest.blobs.at(-1).text()));
    };
    const enterFolder=()=>page.getByRole('button',{name:'フォルダ 検証用',exact:true}).click();
    const chooseSky=()=>page.locator('.workspace-content').getByRole('button',{name:'青い空',exact:true}).click();

    await check('空の保存データを再読込しても初期データが復活しない',async()=>{
        await seed({folders:[],words:[],templates:[],cards:[]});
        assert(!(await page.getByRole('button',{name:'衣装',exact:true}).isVisible()),'初期データが復活した');
        assert(await page.getByText('フォルダがありません。',{exact:true}).isVisible(),'空の表示がない');
    });
    await check('フォルダー追加・元に戻す・カード追加編集・再読込',async()=>{
        await seed();
        await page.getByRole('button',{name:'フォルダを追加',exact:true}).click();
        await page.getByPlaceholder('例: マイフォルダ').fill('追加フォルダー');
        await page.getByPlaceholder('未入力の場合は自動生成').fill('created-folder');
        await modal().getByRole('button',{name:'追加',exact:true}).click();
        await waitStored(()=>JSON.parse(localStorage.getItem('promptgen:data')).folders.some(folder=>folder.id==='created-folder'));
        await page.locator('main header').getByRole('button',{name:'元に戻す',exact:true}).click();
        await waitStored(()=>!JSON.parse(localStorage.getItem('promptgen:data')).folders.some(folder=>folder.id==='created-folder'));
        await enterFolder();
        await page.locator('.workspace-content').getByRole('button',{name:'追加',exact:true}).click();
        await page.getByPlaceholder('例: 黒髪').fill('追加確認');
        await page.getByPlaceholder('例: black hair').fill('added prompt');
        await modal().getByRole('button',{name:'追加',exact:true}).click();
        await waitStored(()=>JSON.parse(localStorage.getItem('promptgen:data')).words.some(word=>word.label_jp==='追加確認'));
        await page.locator('main header').getByRole('button',{name:'編集',exact:true}).click();
        assert(await page.locator('button button').count()===0,'ボタンが入れ子になっている');
        await page.getByRole('button',{name:'追加確認',exact:true}).getByRole('button',{name:'編集',exact:true}).click();
        await modal().locator('input[type=text]').nth(0).fill('編集確認');
        await modal().locator('input[type=text]').nth(1).fill('edited prompt');
        await modal().getByRole('button',{name:'保存',exact:true}).click();
        await waitStored(()=>JSON.parse(localStorage.getItem('promptgen:data')).words.some(word=>word.value_en==='edited prompt'));
        await page.reload();
        await enterFolder();
        assert(await page.getByRole('button',{name:'編集確認',exact:true}).isVisible(),'編集結果が保存されていない');
        await page.locator('main header').getByRole('button',{name:'編集',exact:true}).click();
        await page.getByRole('button',{name:'編集確認',exact:true}).getByRole('button',{name:'削除',exact:true}).click();
        await waitStored(()=>!JSON.parse(localStorage.getItem('promptgen:data')).words.some(word=>word.label_jp==='編集確認'));
        await page.locator('main header').getByRole('button',{name:'元に戻す',exact:true}).click();
        await waitStored(()=>JSON.parse(localStorage.getItem('promptgen:data')).words.some(word=>word.label_jp==='編集確認'));
    });
    await check('コピー失敗を成功扱いせず、成功時だけ履歴を保存する',async()=>{
        await seed();await enterFolder();await chooseSky();
        await page.evaluate(()=>{window.__pcTest.clipboardFails=true;});
        await positive().getByRole('button',{name:'コピー',exact:true}).click();
        await page.waitForFunction(()=>window.__pcTest.alerts.length>0);
        assert(await page.evaluate(()=>!localStorage.getItem('promptgen:copy-history')),'失敗が履歴に残った');
        assert(!(await page.getByText('コピーしました',{exact:true}).isVisible()),'失敗時に完了表示した');
        await page.evaluate(()=>{window.__pcTest.clipboardFails=false;});
        await positive().getByRole('button',{name:'コピー',exact:true}).click();
        await page.waitForFunction(()=>JSON.parse(localStorage.getItem('promptgen:copy-history')||'[]').length===1);
        assert(await page.evaluate(()=>window.__pcTest.writes[0]==='blue sky'),'コピー内容が異なる');
    });
    await check('履歴からの復元と復元の取り消し',async()=>{
        await seed();await enterFolder();await chooseSky();
        await positive().getByRole('button',{name:'コピー',exact:true}).click();
        await positive().getByRole('button',{name:'クリア',exact:true}).click();
        await positive().getByRole('button',{name:/^履歴/}).click();
        await modal().locator('button.text-left').first().click();
        assert(await positive().getByText('青い空',{exact:true}).isVisible(),'履歴が復元されない');
        await page.getByRole('button',{name:'元に戻す',exact:true}).last().click();
        assert(await positive().getByText('カードを選択...',{exact:true}).isVisible(),'復元を取り消せない');
    });
    await check('お気に入りの保存・読み込みと品質テンプレートの反映',async()=>{
        await seed();await enterFolder();await chooseSky();
        await positive().getByRole('button',{name:'保存',exact:true}).click();
        await page.getByPlaceholder('(未入力の場合は自動生成)').fill('保存確認');
        await modal().getByRole('button',{name:'Save',exact:true}).click();
        await page.waitForFunction(()=>JSON.parse(localStorage.getItem('promptgen:favorites')||'[]').some(item=>item.name==='保存確認'));
        await positive().getByRole('button',{name:'クリア',exact:true}).click();
        await positive().getByRole('button',{name:'読み込み',exact:true}).click();
        await modal().getByText('保存確認',{exact:true}).click();
        assert(await positive().getByText('青い空',{exact:true}).isVisible(),'お気に入りが反映されない');
        await positive().getByRole('button',{name:'品質',exact:true}).click();
        await modal().getByText('品質確認',{exact:true}).click();
        await positive().getByRole('button',{name:'コピー',exact:true}).click();
        assert(await page.evaluate(()=>window.__pcTest.writes.at(-1).includes('high quality')),'品質プロンプトがコピーへ反映されない');
        await page.reload();
        assert(await page.evaluate(()=>JSON.parse(localStorage.getItem('promptgen:favorites'))[0].name==='保存確認'),'お気に入りが保存されていない');
    });
    await check('デッキImportで保存先と親を復元し、通常Exportにも同梱する',async()=>{
        await seed();await settings();
        const payload={folders:[{id:'parent',name:'デッキ親',parentId:'root'},{id:'child',name:'保存先',parentId:'parent'}],cards:[{id:'deck',name:'読込デッキ',folderId:'child',type:'positive',nsfw:false,words:[{wordId:'external',label_jp:'赤い花',value_en:'red flower',repeat:2,strength:1.2}]}]};
        await importJSON('デッキデータのみ',payload);
        await waitStored(()=>JSON.parse(localStorage.getItem('promptgen:data')).cards.some(card=>card.id==='deck'));
        const output=await exportJSON('デッキデータのみ');
        assert(output.folders.some(folder=>folder.id==='parent')&&output.folders.some(folder=>folder.id==='child'),'保存先がExportに含まれない');
        await page.getByRole('button',{name:'設定を閉じる',exact:true}).click();
        await page.getByRole('button',{name:'フォルダ デッキ親',exact:true}).click();
        await page.getByRole('button',{name:'フォルダ 保存先',exact:true}).click();
        await page.getByText('読込デッキ',{exact:true}).click();
        assert((await positive().innerText()).includes('red flower'),'デッキが反映されない');
        assert((await positive().innerText()).includes('1.2'),'強度が失われた');
        await positive().getByRole('button',{name:'コピー',exact:true}).click();
        assert(await page.evaluate(()=>(window.__pcTest.writes.at(-1).match(/red flower/g)||[]).length===2),'デッキの繰り返しが失われた');
    });
    await check('古いデッキ単体Importで保存先がなければrootへ配置する',async()=>{
        await seed();await settings();
        await importJSON('デッキデータのみ',[{id:'legacy',name:'旧デッキ',folderId:'missing',type:'positive',nsfw:false,words:[{wordId:'sky',value_en:'blue sky'}]}]);
        await waitStored(()=>JSON.parse(localStorage.getItem('promptgen:data')).cards.some(card=>card.id==='legacy'));
        const data=await stored();assert(data.cards[0].folderId==='root','見えない保存先のまま');
        assert(await page.evaluate(()=>window.__pcTest.confirms.at(-1).includes('root')),'配置先の説明がない');
    });
    await check('カードImportの追加は同一IDを維持し、上書きは置換する',async()=>{
        await seed();await settings();
        const incoming={folders:fixture.folders,words:[{...fixture.words[0],value_en:'changed sky'},word('new','新規','new prompt')]};
        await importJSON('カードデータのみ',incoming);
        await modal().getByRole('button',{name:'追加',exact:true}).click();
        await waitStored(()=>JSON.parse(localStorage.getItem('promptgen:data')).words.length===3);
        assert((await stored()).words.find(word=>word.id==='sky').value_en==='blue sky','既存カードが置換された');
        await importJSON('カードデータのみ',incoming);
        await modal().getByRole('button',{name:'上書き',exact:true}).click();
        await waitStored(()=>JSON.parse(localStorage.getItem('promptgen:data')).words.length===2);
        assert((await stored()).words.find(word=>word.id==='sky').value_en==='changed sky','上書きが反映されない');
    });
    await check('不正なImportを拒否して既存データを保持する',async()=>{
        await seed();await settings();
        rejectingInvalidImport=true;
        await importJSON('全データ',{folders:[],words:[null]});
        await page.waitForFunction(()=>window.__pcTest.alerts.length>0);
        rejectingInvalidImport=false;
        const data=await stored();assert(data.words[0].id==='sky','不正なデータで書き換わった');
        assert(await page.evaluate(()=>window.__pcTest.alerts.at(-1).includes('Importできません')),'拒否の説明がない');
    });
    await check('全データExport/Importでカード・装飾・お気に入り・Comfy設定を保持する',async()=>{
        await seed();await settings();
        const payload={...fixture,templates:[{id:'t',name:'装飾',options:[{id:'o',label:'赤',value:'red'}]}],cards:[{id:'d',name:'保存デッキ',folderId:'test-folder',type:'positive',nsfw:false,words:[{wordId:'sky',repeat:2}]}],favorites:quality,qualityTemplates:quality,comfyPresets:{standard:{...preset,steps:31,cfgScale:0}}};
        await importJSON('全データ',payload);
        await waitStored(()=>JSON.parse(localStorage.getItem('promptgen:data')).cards.length===1);
        const output=await exportJSON('全データ');
        assert(output.templates[0].id==='t'&&output.cards[0].words[0].repeat===2,'装飾かデッキが変わった');
        assert(output.favorites[0].id==='q-positive'&&output.qualityTemplates[0].id==='q-positive','保存プロンプトが変わった');
        assert(output.comfyPresets.standard.steps===31&&output.comfyPresets.standard.cfgScale===0,'Comfy設定が失われた');
    });
    await check('Comfyプリセットの変更が出力へ即時反映される',async()=>{
        await seed();await enterFolder();await chooseSky();
        await page.getByRole('button',{name:'データ管理',exact:true}).click();
        await page.getByRole('button',{name:'Comfy JSON',exact:true}).click();
        await page.getByPlaceholder('steps',{exact:true}).first().fill('37');
        await page.getByPlaceholder('cfg',{exact:true}).first().fill('7.2');
        await page.getByRole('button',{name:'設定を閉じる',exact:true}).click();
        await page.getByRole('button',{name:'Comfy指示JSON',exact:true}).click();
        assert(await modal().getByPlaceholder('steps',{exact:true}).inputValue()==='37','stepsが反映されない');
        assert(await modal().getByPlaceholder('cfg',{exact:true}).inputValue()==='7.2','cfgが反映されない');
        await modal().getByRole('button',{name:'ジョブ追加',exact:true}).click();
        await modal().getByRole('button',{name:'JSONを出力',exact:true}).click();
        const output=await page.evaluate(async()=>JSON.parse(await window.__pcTest.blobs.at(-1).text()));
        assert(output.generation.steps===37&&output.generation.cfgScale===7.2,'出力設定が一致しない');
    });
    await check('Comfyの複数ジョブ・枚数・任意サイズ・CFG=0と上下限',async()=>{
        await seed();await enterFolder();await chooseSky();
        await page.locator('.workspace-content').getByRole('button',{name:'ぼかし',exact:true}).click({modifiers:['Shift']});
        await page.getByRole('button',{name:'Comfy指示JSON',exact:true}).click();
        await modal().getByRole('combobox').selectOption('custom');
        await modal().getByPlaceholder('幅',{exact:true}).fill('5000');
        await modal().getByPlaceholder('高さ',{exact:true}).fill('1');
        await modal().getByPlaceholder('steps',{exact:true}).fill('999');
        await modal().getByPlaceholder('cfg',{exact:true}).fill('0');
        const count=modal().getByText('新規ジョブの枚数 (追加時)',{exact:true}).locator('..').getByRole('spinbutton');
        await count.fill('3');await modal().getByRole('button',{name:'ジョブ追加',exact:true}).click();
        await count.fill('2');await modal().getByRole('button',{name:'ジョブ追加',exact:true}).click();
        await modal().getByRole('button',{name:'JSONを出力',exact:true}).click();
        const output=await page.evaluate(async()=>JSON.parse(await window.__pcTest.blobs.at(-1).text()));
        assert(output.schema==='promptgen.comfy.batch/v1','schemaが異なる');
        assert(output.jobs.length===2&&output.batch.jobCount===2&&output.batch.totalCount===5,'ジョブ数・枚数が異なる');
        assert(output.generation.width===4096&&output.generation.height===64&&output.generation.steps===200&&output.generation.cfgScale===0,'上下限またはCFG=0の処理が異なる');
        assert(output.jobs.every(job=>job.prompt.positive==='blue sky'&&job.prompt.negative==='blurry'),'プロンプトが異なる');
        assert(new Set(output.jobs.map(job=>job.id)).size===2,'ジョブIDが重複した');
    });
    await check('空のComfyジョブを出力せず、理由を表示する',async()=>{
        await seed();await page.getByRole('button',{name:'Comfy指示JSON',exact:true}).click();
        await modal().getByRole('button',{name:'JSONを出力',exact:true}).click();
        assert(await page.evaluate(()=>window.__pcTest.blobs.length===0),'空のJSONを出力した');
        assert(await page.evaluate(()=>window.__pcTest.alerts.at(-1).includes('ジョブ')),'出力できない理由がない');
    });
    await check('装飾の選択結果がコピー内容へ反映される',async()=>{
        const decorated={...fixture,words:[...fixture.words,word('flower','花','flower',{templateIds:['color']})],templates:[{id:'color',name:'色',position:'before',spaceEnabled:true,options:[{id:'red',label:'赤',value:'red'}]}]};
        await seed(decorated);await enterFolder();
        await page.getByRole('button',{name:'花',exact:true}).getByRole('button',{name:'装飾',exact:true}).click();
        await modal().getByRole('button',{name:/赤/}).click();
        await modal().getByRole('button',{name:'選択した装飾を追加',exact:true}).click();
        await positive().getByRole('button',{name:'コピー',exact:true}).click();
        assert(await page.evaluate(()=>window.__pcTest.writes.at(-1)==='red flower'),'装飾が反映されない');
    });
    await check('カードと子ボタンをキーボードで操作し、誤って親を実行しない',async()=>{
        await seed();
        await page.getByRole('button',{name:'フォルダ 検証用',exact:true}).focus();
        await page.keyboard.press('Enter');
        const sky=page.locator('.workspace-content').getByRole('button',{name:'青い空',exact:true});
        await sky.getByRole('button',{name:'お気に入り追加',exact:true}).press('Enter');
        assert(await positive().getByText('カードを選択...',{exact:true}).isVisible(),'子ボタンでカードを選んでしまった');
        await waitStored(()=>JSON.parse(localStorage.getItem('promptgen:data')).words.find(word=>word.id==='sky').favorite===true);
        await sky.focus();await page.keyboard.press('Enter');
        assert(await positive().getByText('青い空',{exact:true}).isVisible(),'Enterで選択できない');
        await sky.focus();await page.keyboard.press('Shift+Enter');
        assert(await page.locator('.prompt-section').last().getByText('青い空',{exact:true}).isVisible(),'Shift+Enterでネガティブへ移せない');
    });
    const result={checks:results.length,passed:results.filter(item=>item.passed).length,failures:results.filter(item=>!item.passed),pageErrors:errors,consoleErrors,expectedRejectedImports:expectedErrors.length,downloads};
    if(result.failures.length||errors.length||consoleErrors.length)throw new Error(JSON.stringify(result));
    return result;
}
