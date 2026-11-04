import asyncio,json,os
from playwright.async_api import async_playwright
errs=[];seed=json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)),'seed.json')))
J=lambda pg:pg.evaluate("(()=>{const P=JSON.parse(localStorage.getItem('shtab.v1'));for(const k in P)for(const m of (P[k].memos||[]))if(m.title==='Мысли')return m;return null})()")
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch()
    pg=await b.new_page(viewport={'width':1400,'height':900});pg.on('pageerror',lambda e:errs.append(str(e)));pg.on('console',lambda m: m.type=='error' and 'ERR_TUNNEL' not in m.text and errs.append(m.text))
    await pg.goto('http://localhost:8765/index.html')
    await pg.evaluate("""s=>{localStorage.clear();localStorage.setItem('shtab.v1',JSON.stringify(s.p));localStorage.setItem('shtab.v1.map',JSON.stringify(s.m));localStorage.setItem('shtab.v1.ui',JSON.stringify({screen:'projects',skin:'night',v2:1}))}""",seed)
    await pg.reload();await pg.wait_for_timeout(500)
    # open existing memo
    await pg.click('.nl-i[data-memo] >> nth=0');await pg.wait_for_timeout(300)
    print('existing memo blocks',await pg.locator('#ed .blk').count(),await pg.locator('.mp-title').input_value())
    await pg.screenshot(path='/tmp/shtab-e0.png')
    # new memo in project page
    await pg.click('#side .sn-proj >> nth=0');await pg.wait_for_timeout(200)
    await pg.fill('#newMemo','Мысли');await pg.keyboard.press('Enter');await pg.wait_for_timeout(400)
    print('screen memo?',await pg.locator('#ed').count(), 'focus',await pg.evaluate("document.activeElement.className"))
    k=pg.keyboard
    await k.type('# Идея нового месторождения');await k.press('Enter')
    await k.type('Обычный абзац с текстом');await k.press('Enter')
    await k.type('- первый пункт');await k.press('Enter');await k.type('второй пункт');await k.press('Enter');await k.press('Enter')
    await k.type('[] позвонить юристам');await k.press('Enter');await k.type('сверить запасы');await k.press('Enter');await k.press('Enter')
    await k.type('/цит');await pg.wait_for_timeout(150);print('slash menu',await pg.locator('.edm .edm-i').count());await k.press('Enter');await k.type('Цитата важная')
    await k.press('Enter');await k.type('/табл');await pg.wait_for_timeout(100);await k.press('Enter');await pg.wait_for_timeout(100);await k.type('A1')
    await pg.click('.ed-tail');await k.type('Ссылка на [[Инта');await pg.wait_for_timeout(150);print('link menu',await pg.locator('.edm .edm-i').all_text_contents());await k.press('Enter');await k.type('и всё')
    await k.press('Enter');await k.type('/выно');await pg.wait_for_timeout(100);await k.press('Enter');await k.type('Не забыть про НДПИ')
    await pg.wait_for_timeout(600)
    m=await J(pg);print('types',[x['t'] for x in m['blocks']]);print(m['body'])
    # bold via toolbar: select word in paragraph
    para=pg.locator('#ed .b-p .bc >> nth=0');await para.click();await pg.keyboard.press('End');await pg.keyboard.press('Shift+Home');await pg.wait_for_timeout(200);print('toolbar',await pg.locator('#edtb').count(),await pg.evaluate("(()=>{const s=getSelection();return s.toString()+'|'+s.isCollapsed+'|'+(s.anchorNode&&s.anchorNode.nodeName)+'|'+document.activeElement.className})()"))
    await pg.click('#edtb [data-fmt="bold"]');await pg.wait_for_timeout(500)
    # todo -> task
    await pg.locator('#ed .b-todo >> nth=0').hover();await pg.click('#ed .b-todo >> nth=0 >> .b2t');await pg.wait_for_timeout(300)
    await pg.click('#ed .b-todo >> nth=0 >> .bck');await pg.wait_for_timeout(300)
    # split/merge: click end of heading, Enter in middle
    h=pg.locator('#ed .b-h1 .bc');await h.click();await k.press('End');
    for i in range(14):await k.press('ArrowLeft')
    await k.press('Enter');await pg.wait_for_timeout(100);print('after split',await pg.locator('#ed .blk >> nth=1').text_content())
    await k.press('Backspace');await pg.wait_for_timeout(100);print('after merge',await pg.locator('#ed .blk >> nth=0').text_content(),await pg.locator('#ed .blk').count())
    await pg.wait_for_timeout(500);await pg.screenshot(path='/tmp/shtab-e1.png',full_page=True)
    m=await J(pg);print(m['body'])
    tasks=await pg.evaluate("Object.values(JSON.parse(localStorage.getItem('shtab.v1'))).flatMap(p=>p.tasks).filter(t=>t.title.includes('юрист')).map(t=>t.title+':'+t.status)");print('tasks',tasks)
    # reload persistence
    await pg.reload();await pg.wait_for_timeout(500);print('after reload screen title',await pg.locator('.mp-title').input_value(),await pg.locator('#ed .blk').count())
    # drag last block to top
    hs=pg.locator('#ed .bh');n=await hs.count();last=hs.nth(n-1);bb=await last.bounding_box();top=await pg.locator('#ed .blk >> nth=0').bounding_box()
    await pg.mouse.move(bb['x']+5,bb['y']+5);await pg.mouse.down();await pg.mouse.move(bb['x']+5,top['y']+3,steps=8);await pg.mouse.up();await pg.wait_for_timeout(200)
    print('first after drag',await pg.locator('#ed .blk >> nth=0').get_attribute('data-t'))
    # chip click -> map
    await pg.click('#ed .wl');await pg.wait_for_timeout(500);print('after chip screen',await pg.evaluate("document.querySelector('.tb-tab[aria-selected=true]').textContent"))
    await pg.click('#side [data-nav="graph"]');await pg.wait_for_timeout(3000);await pg.screenshot(path='/tmp/shtab-e2.png')
    await b.close()
asyncio.run(main());print('ERR',errs)
