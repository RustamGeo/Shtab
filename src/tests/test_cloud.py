import asyncio,os,json
from playwright.async_api import async_playwright
errs=[]
U='http://localhost:8765/site/index.html'
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch();pg=await b.new_page(viewport={'width':1500,'height':900});pg.on('pageerror',lambda e:errs.append(str(e)))
    await pg.goto(U);await pg.evaluate("localStorage.clear()");await pg.reload();await pg.wait_for_timeout(800)
    print('auth visible',await pg.locator('#auth').is_visible())
    await pg.click('[data-act="auth-signup"]');await pg.fill('#aEmail','a@b.ru');await pg.fill('#aPass','secret12');await pg.fill('#aPass2','secret12')
    await pg.click('#authF button[type=submit]');await pg.wait_for_timeout(1200)
    print('auth after',await pg.locator('#auth').is_visible(),'sync',await pg.locator('#sync').text_content())
    await pg.click('[data-act="split-v"]');await pg.wait_for_timeout(2000)
    fr=pg.frame_locator('#pane1 iframe')
    print('pane auth visible',await fr.locator('#auth').is_visible(),'pane sync',await fr.locator('#sync').text_content())
    await pg.screenshot(path='/tmp/shtab-T-cloud.png')
    # create project in host
    await pg.click('#side [data-screen="projects"]') if False else None
    await pg.locator('#pane0 #main').click(position={'x':3,'y':3});await pg.wait_for_timeout(100)
    await pg.click('#side [data-screen="projects"]');await pg.wait_for_timeout(300)
    await pg.evaluate("()=>{}")
    btn=pg.locator('#pane0 button:has-text("Новый проект")').first
    await btn.click();await pg.wait_for_timeout(300)
    await pg.keyboard.type('Тест облака');await pg.keyboard.press('Enter');await pg.wait_for_timeout(1500)
    await fr.locator('body').click(position={'x':5,'y':300});
    print('pane sees new project',await fr.locator('text=Тест облака').count())
    await pg.screenshot(path='/tmp/shtab-T-cloud2.png')
    await b.close()
asyncio.run(main());print('ERRORS',errs)
