import asyncio,json
from playwright.async_api import async_playwright
seed=json.load(open('/home/claude/shtab/src/tests/seed.json'))
errs=[]
async def drag(pg,src,dst,steps=12,shot=None):
  a=await pg.locator(src).first.bounding_box();b=await pg.locator(dst).first.bounding_box()
  await pg.mouse.move(a['x']+a['width']/3,a['y']+a['height']/2);await pg.mouse.down()
  await pg.mouse.move(b['x']+b['width']/3,b['y']+b['height']/2,steps=steps);await pg.wait_for_timeout(100)
  if shot:await pg.screenshot(path=shot)
  await pg.mouse.up();await pg.wait_for_timeout(300)
def tree(pg):return pg.evaluate("""(()=>{const P=JSON.parse(localStorage.getItem('shtab.v1')),M=JSON.parse(localStorage.getItem('shtab.v1.map'));const out=[];
  const w=(id,d)=>{const n=M[id];if(!n)return;if(n.project){const p=P[n.project];out.push('  '.repeat(d)+p.name+' ['+p.tasks.map(t=>t.title).join(', ')+'] {'+(p.memos||[]).map(m=>m.title).join(',')+'}')}else out.push('  '.repeat(d)+'·'+n.text);for(const c of n.children)w(c,d+1)};w('root',0);return out.join('\\n')})()""")
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch();pg=await b.new_page(viewport={'width':1400,'height':900});pg.on('pageerror',lambda e:errs.append(str(e)+' '+(e.stack or '')[:600]))
    await pg.goto('http://localhost:8765/index.html')
    await pg.evaluate("""s=>{localStorage.clear();localStorage.setItem('shtab.v1',JSON.stringify(s.p));localStorage.setItem('shtab.v1.map',JSON.stringify(s.m));localStorage.setItem('shtab.v1.ui',JSON.stringify({screen:'projects',skin:'night',v2:1}))}""",seed)
    await pg.reload();await pg.wait_for_timeout(500)
    print(await tree(pg));print('---')
    # 1: task 'Сверить запасы' -> project 'Новый офис' (in list)
    await drag(pg,'.nl-i[data-task]:has-text("Сверить запасы")','.nl-g:has-text("Новый офис")',shot='/tmp/shtab-dnd1.png')
    # 2: subproject Переговоры -> sidebar project Новый офис
    await drag(pg,'.nl-s:has-text("Переговоры")','#side .sn-proj:has-text("Новый офис")')
    # 3: memo -> Инта газ
    await drag(pg,'.nl-i[data-memo]:has-text("Позиция")','.nl-s:has-text("Инта газ")')
    print(await tree(pg));print('---')
    # 4: cycle: Новый офис -> its subproject Ремонт (should be refused)
    await drag(pg,'#side .sn-proj:has-text("Новый офис")','#side .sn-proj:has-text("Ремонт")')
    # undo last ok op: move Ремонт to root then undo
    await drag(pg,'#side .sn-proj:has-text("Ремонт")','#side .sn-root')
    t=await tree(pg);print('after Ремонт->root top level:', [l for l in t.split('\n') if not l.startswith('  ')][:8])
    await pg.click('.toast button');await pg.wait_for_timeout(300);print('undo ok:', 'Ремонт' in [l.strip().split(' [')[0] for l in (await tree(pg)).split('\n') if l.startswith('    ')])
    # 5: tree map: drag idea node Геология onto Инта газ
    await pg.click('#side [data-nav="tree"]');await pg.wait_for_timeout(600)
    await drag(pg,'#tg [data-node]:has-text("Геология")','#tg .node.proj:has-text("Инта газ")',shot='/tmp/shtab-dnd2.png')
    await drag(pg,'#tg [data-node]:has-text("NDA")','#tg .node.proj:has-text("Новый офис")')
    print(await tree(pg))
    await b.close()
asyncio.run(main());print(errs)
