import asyncio,os,json
from playwright.async_api import async_playwright
seed=json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)),'seed.json')));errs=[]
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch()
    for scheme in ['dark']:
      pg=await b.new_page(viewport={'width':1400,'height':860},color_scheme=scheme);pg.on('pageerror',lambda e:errs.append(str(e)))
      await pg.goto('http://localhost:8765/index.html')
      await pg.evaluate("""s=>{localStorage.clear();localStorage.setItem('shtab.v1',JSON.stringify(s.p));localStorage.setItem('shtab.v1.map',JSON.stringify(s.m));localStorage.setItem('shtab.v1.ui',JSON.stringify({screen:'projects',mapView:'graph',skin:'night',v2:1}))}""",seed)
      await pg.reload();await pg.wait_for_timeout(500)
      await pg.click('#skinBtn');await pg.wait_for_timeout(300);await pg.screenshot(path='/tmp/shtab-D-picker.png')
      await pg.click('[data-skin-pick="day"]');await pg.wait_for_timeout(300);await pg.keyboard.press('Escape');await pg.evaluate("document.querySelector('#layer .scrim')?.remove()")
      await pg.screenshot(path='/tmp/shtab-D-proj.png')
      await pg.click('#side [data-nav="graph"]');await pg.wait_for_timeout(4000);await pg.screenshot(path='/tmp/shtab-D-graph.png')
      await pg.click('#side [data-nav="tree"]');await pg.wait_for_timeout(600);await pg.screenshot(path='/tmp/shtab-D-tree.png')
      await pg.click('#side .sn-proj >> nth=0');await pg.wait_for_timeout(400);await pg.screenshot(path='/tmp/shtab-D-page.png')
    await b.close()
asyncio.run(main());print('ERRORS',errs)
