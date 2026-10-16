// Playwright CLI: run-code --filename scripts/画面サイズ検証.js
// テスト専用のブラウザーセッションで実行する。既存データの消去・Import・公開は行わない。
async page => {
    page.setDefaultTimeout(5000);
    const errors = [];
    const browser = await page.evaluate(() => navigator.userAgent.includes('Edg/') ? 'Edge' : 'Chrome');
    page.on('pageerror', error => errors.push(error.message));
    const results = [];
    const check = async (name, scope = 'main') => {
        const result = await page.evaluate(({name,scope}) => {
            const root = document.querySelector(scope);
            const issues = [];
            if (!root) return { name, issues: ['検査対象が見つからない'] };
            if (document.documentElement.scrollWidth > innerWidth + 1) issues.push('ページが横にはみ出す');
            const rect = root.getBoundingClientRect();
            if (rect.left < -1 || rect.right > innerWidth + 1) issues.push('表示領域が画面幅を超える');
            for (const el of root.querySelectorAll('button,[role="button"],input,select,textarea,h3')) {
                const r = el.getBoundingClientRect();
                if (!r.width || !r.height) continue;
                if (r.left < -1 || r.right > innerWidth + 1) issues.push(`横にはみ出す: ${(el.textContent || el.getAttribute('placeholder') || el.tagName).trim().slice(0,40)}`);
            }
            if (scope === 'main') {
                for (const title of root.querySelectorAll('.prompt-section h3')) {
                    if (title.getBoundingClientRect().height > 26) issues.push('プロンプト見出しが縦に折れている');
                }
            }
            return {name, width:innerWidth, height:innerHeight, issues:[...new Set(issues)]};
        },{name,scope});
        results.push(result);
    };
    const openSidebar = async () => {
        const toggle = page.getByRole('button',{name:'フォルダー一覧を開く',exact:true});
        if (await toggle.isVisible()) await toggle.click();
    };
    const agree = page.getByRole('button',{name:'同意して利用',exact:true});
    if (await agree.isVisible()) {
        await page.getByRole('checkbox',{name:'次回以降表示しない'}).check();
        await agree.click();
    }
    const settingsClose = page.getByRole('button',{name:'設定を閉じる',exact:true});
    if (await settingsClose.isVisible()) await settingsClose.click();
    const cancel = page.getByRole('button',{name:'Cancel',exact:true});
    if (await cancel.isVisible()) await cancel.click();
    for (const [width,height] of [[3840,2160],[2560,1440],[1920,1080],[1536,864],[1366,768],[1280,720],[1093,614],[1024,768],[960,540],[768,1024],[390,844],[320,568],[844,390]]) {
        await page.setViewportSize({width,height});
        await check('メイン');
        if (width < 1024) {
            await openSidebar();
            await check('フォルダー一覧','#folder-sidebar');
            await page.keyboard.press('Escape');
            if (!(await page.getByRole('button',{name:'フォルダー一覧を開く',exact:true}).evaluate(el=>el===document.activeElement))) {
                results.push({name:'フォーカス復帰',width,height,issues:['Escape後に開くボタンへ戻らない']});
            }
        }
        await openSidebar();
        await page.getByRole('button',{name:'データ管理',exact:true}).click();
        for (const tab of ['全体の設定','カードデータのExport/Import','装飾の設定','Comfy JSON']) {
            await page.getByRole('button',{name:tab,exact:true}).click();
            await check(`設定・${tab}`,'.settings-panel');
        }
        await settingsClose.click();
        await openSidebar();
        await page.getByRole('button',{name:'使い方',exact:true}).click();
        await check('使い方','div.fixed.inset-0 > div');
        await page.getByRole('button',{name:'Close',exact:true}).click();
        for (const [name,button] of [['Comfy出力','Comfy指示JSON'],['プロンプト展開','展開'],['品質','品質'],['お気に入り読み込み','読み込み'],['履歴','履歴 0'],['お気に入り保存','保存']]) {
            await page.getByRole('button',{name:button,exact:true}).first().click();
            await check(name,'div.fixed.inset-0 > div');
            const close = page.getByRole('button',{name:'閉じる',exact:true});
            if (await close.count()) await close.last().click();
            else await page.getByRole('button',{name:'Cancel',exact:true}).last().click();
        }
        if (width === 390 || width === 1366) {
            await page.locator('main').evaluate(el=>el.scrollTo(0,0));
            await page.screenshot({path:`output/playwright/${browser}_確認済_${width}x${height}.png`});
        }
    }
    const result = { browser, states: results.length, failures: results.filter(result=>result.issues.length), pageErrors:errors };
    if (result.failures.length || errors.length) throw new Error(JSON.stringify(result));
    return result;
}
