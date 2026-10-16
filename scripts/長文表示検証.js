// ローカルのテスト専用セッションで実行する。セッション内の保存データをテストデータへ置換する。
async page => {
    const url = new URL(page.url());
    if (url.hostname !== '127.0.0.1' || url.port !== '5186') throw new Error('テスト用ローカルサーバー以外では実行できません。');
    page.setDefaultTimeout(5000);
    const errors=[];
    const consoleErrors=[];
    page.on('pageerror',error=>errors.push(error.message));
    page.on('console',message=>{if(message.type()==='error')consoleErrors.push(message.text().slice(0,180));});
    const label = '長文テスト' + 'LongUnbrokenLabel'.repeat(25);
    await page.evaluate(({label})=>{
        const words=Array.from({length:12},(_,i)=>({id:`layout-word-${i}`,folderId:'layout-test',label_jp:`${label}${i}`,value_en:`word${i}_`+'unbroken'.repeat(50),nsfw:false,note:'長い注釈の表示を確認するための文章。'.repeat(20)}));
        localStorage.setItem('promptgen:data',JSON.stringify({folders:[{id:'layout-test',name:'画面テスト',parentId:'root'}],words,templates:[],cards:[]}));
        localStorage.setItem('promptgen:notice-dismissed','1');
        localStorage.setItem('promptgen:quality-templates',JSON.stringify([{id:'quality-long',name:'品質名'.repeat(40),type:'positive',words:[],nsfw:false}]));
        localStorage.setItem('promptgen:quality-selection',JSON.stringify({positive:'quality-long',negative:null}));
    },{label});
    await page.reload();
    await page.getByRole('button',{name:'フォルダ 画面テスト',exact:true}).click();
    for(let i=0;i<5;i++) await page.locator('.workspace-content').getByText(`${label}${i}`,{exact:true}).click();
    await page.locator('.workspace-content').getByText(`${label}5`,{exact:true}).click({modifiers:['Shift']});
    const results=[];
    for(const [width,height] of [[1920,1080],[1366,768],[1024,600],[768,1024],[390,844],[320,568],[844,390]]){
        await page.setViewportSize({width,height});
        results.push(await page.evaluate(()=>({width:innerWidth,height:innerHeight,
            overflow:document.querySelector('main').scrollWidth-document.querySelector('main').clientWidth,
            clipped:[...document.querySelectorAll('main button')].filter(el=>{const r=el.getBoundingClientRect();return r.width&&(r.right>innerWidth+1||r.left< -1)}).map(el=>el.textContent.trim().slice(0,30))
        })));
    }
    await page.setViewportSize({width:390,height:844});
    await page.locator('.prompt-output').scrollIntoViewIfNeeded();
    await page.screenshot({path:'output/playwright/長文選択_390.png'});
    await page.getByRole('button',{name:'展開',exact:true}).first().click();
    results.push(await page.evaluate(()=>({name:'長文プロンプト展開',overflow:document.documentElement.scrollWidth-innerWidth,
        clipped:[...document.querySelectorAll('div.fixed.inset-0 button')].filter(el=>el.getBoundingClientRect().right>innerWidth+1).map(el=>el.textContent.trim().slice(0,30))})));
    await page.getByRole('button',{name:'閉じる',exact:true}).last().click();
    const result = {results,pageErrors:errors,consoleErrors};
    if (results.some(entry=>entry.overflow || entry.clipped.length) || errors.length || consoleErrors.length) throw new Error(JSON.stringify(result));
    return result;
}
