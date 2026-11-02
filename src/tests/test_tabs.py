import asyncio,os,os,json
from playwright.async_api import async_playwright
seed=json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)),'seed.json')))
errs=[]
U='http://localhost:8765/index.html'
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch()
    pg=await b.new_page(viewport={'width':1500,'height':900});pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.on('console',lambda m: m.type=='error' and errs.append('console:'+m.text))
    await pg.goto(U)
    await pg.evaluate("""s=>{localStorage.clear();localStorage.setItem('shtab.v1',JSON.stringify(s.p));localStorage.setItem('shtab.v1.map',JSON.stringify(s.m));
      localStorage.setItem('shtab.v1.ui',JSON.stringify({screen:'projects',mapView:'tree',skin:'night',v2:1}))}""",seed)
    await pg.reload();await pg.wait_for_timeout(600)
    print('tabs',await pg.locator('.tb-tab').count())
    await pg.click('[data-act="tabnew"]');await pg.wait_for_timeout(200)
    await pg.click('#side [data-nav="graph"]');await pg.wait_for_timeout(300)
    # ctrl-click project in sidebar
    await pg.click('#side [data-screen]:not([data-screen="projects"]) >> nth=0',modifiers=['Control']);await pg.wait_for_timeout(300)
    print('tabs',await pg.evaluate("[...document.querySelectorAll('.tb-tab')].map(t=>(t.getAttribute('aria-selected')=='true'?'*':'')+t.textContent).join(' | ')"))
    await pg.click('.tb-tab >> nth=0');await pg.wait_for_timeout(300);print('screen',await pg.evaluate("document.querySelector('#main').firstElementChild.className"))
    await pg.screenshot(path='/tmp/shtab-T-tabs.png')
    await pg.click('[data-act="split-v"]');await pg.wait_for_timeout(1500)
    fr=pg.frame_locator('#pane1 iframe')
    print('pane tabs',await fr.locator('.tb-tab').all_text_contents(),'side hidden',await fr.locator('#side').is_hidden())
    await pg.screenshot(path='/tmp/shtab-T-split-row.png')
    # focus pane1 then sidebar nav -> should go to pane1
    await fr.locator('#main').click(position={'x':5,'y':5});await pg.wait_for_timeout(200)
    await pg.click('#side [data-screen="projects"]');await pg.wait_for_timeout(500)
    print('after nav pane tabs',await fr.locator('.tb-tab[aria-selected="true"]').text_content(),' host',await pg.locator('.tb-tab[aria-selected="true"]').text_content())
    # edit in host -> pane sees it via storage
    names=await pg.evaluate("Object.values(JSON.parse(localStorage.getItem('shtab.v1'))).map(p=>p.name)")
    await pg.evaluate("()=>{}")
    await pg.click('[data-act="split-h"]');await pg.wait_for_timeout(1200)
    await pg.screenshot(path='/tmp/shtab-T-split-col.png')
    print('pane0 h',await pg.evaluate("document.querySelector('#pane0').clientHeight"),'pane1 h',await pg.evaluate("document.querySelector('#pane1').clientHeight"))
    # drag divider
    bb=await pg.locator('#pdiv').bounding_box();await pg.mouse.move(bb['x']+50,bb['y']+2);await pg.mouse.down();await pg.mouse.move(bb['x']+50,bb['y']-200,steps=5);await pg.mouse.up();await pg.wait_for_timeout(300)
    print('ratio',await pg.evaluate("JSON.parse(localStorage.getItem('shtab.v1.ui')).split"))
    await pg.reload();await pg.wait_for_timeout(1500)
    print('after reload split',await pg.locator('#pane1').count(),'tabs',await pg.locator('.tb-tab').count())
    # data sync: add a project in pane via storage path - modify host data and check pane
    await pg.evaluate("""()=>{const d=JSON.parse(localStorage.getItem('shtab.v1'));const k=Object.keys(d)[0];d[k].name='ПЕРЕИМЕНОВАН';d[k]._t=Date.now();localStorage.setItem('shtab.v1',JSON.stringify(d))}""")
    await pg.wait_for_timeout(300)
    fr=pg.frame_locator('#pane1 iframe')
    print('pane got rename (storage from host page counts only for other docs):',await fr.locator('text=ПЕРЕИМЕНОВАН').count())
    await pg.click('[data-act="split-off"]');await pg.wait_for_timeout(300);print('split off',await pg.locator('#pane1').count())
    await pg.close()
    m=await b.new_page(viewport={'width':390,'height':844});m.on('pageerror',lambda e:errs.append(str(e)))
    await m.goto(U);await m.wait_for_timeout(700);await m.screenshot(path='/tmp/shtab-T-mob.png')
    print('mob tabs',await m.locator('.tb-tab').count(),'split btn',await m.locator('[data-act="split-v"]').count())
    await b.close()
asyncio.run(main());print('ERRORS',errs)
