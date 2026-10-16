// Playwright CLIをスマートフォンのdevice指定で開いたテスト専用セッション向け。
async page => {
    const agree=page.getByRole('button',{name:'同意して利用',exact:true});
    if(await agree.isVisible())await agree.tap();
    await page.getByRole('button',{name:'フォルダー一覧を開く',exact:true}).tap();
    await page.getByRole('button',{name:'衣装',exact:true}).tap();
    const drawerClosed=!(await page.getByRole('dialog',{name:'フォルダー一覧'}).isVisible());
    await page.getByRole('searchbox').fill('シャツ');
    await page.locator('body').ariaSnapshot();
    const card=page.locator('.workspace-content').getByRole('heading',{name:'カード',exact:true}).locator('..').getByRole('button').first();
    await card.tap();
    await page.getByRole('button',{name:'展開',exact:true}).first().tap();
    const expanded=await page.getByRole('button',{name:'閉じる',exact:true}).last().isVisible();
    await page.getByRole('button',{name:'閉じる',exact:true}).last().tap();
    const result = {drawerClosed,expanded,viewport:await page.evaluate(()=>({width:innerWidth,height:innerHeight,dpr:devicePixelRatio,touchPoints:navigator.maxTouchPoints,overflow:document.querySelector('main').scrollWidth-innerWidth}))};
    if (!drawerClosed || !expanded || result.viewport.overflow || !result.viewport.touchPoints) throw new Error(JSON.stringify(result));
    return result;
}
