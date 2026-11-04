import asyncio,json
from playwright.async_api import async_playwright
errs=[]
U='http://localhost:8765/site/index.html'
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch();ctx=await b.new_context(viewport={'width':1300,'height':860},accept_downloads=True)
    A=await ctx.new_page();A.on('pageerror',lambda e:errs.append('A:'+str(e)))
    await A.goto(U);await A.evaluate("localStorage.clear()");await A.reload();await A.wait_for_timeout(600)
    await A.click('[data-act="auth-signup"]');await A.fill('#aEmail','r@x.ru');await A.fill('#aPass','secret12');await A.fill('#aPass2','secret12');await A.click('#authF button[type=submit]')
    await A.wait_for_timeout(800)
    # create a project with plaintext first
    await A.click('#side [data-act="newproj"] >> nth=0');await A.wait_for_timeout(200);await A.fill('#projName','Секретный проект');await A.keyboard.press('Enter')
    await A.fill('#newTask','Тайная задача');await A.keyboard.press('Enter');await A.wait_for_timeout(1500)
    db=await A.evaluate("localStorage.getItem('__mockdb')");print('plaintext before:', 'Секретный' in db)
    await A.wait_for_timeout(3500);print('setup shown',await A.locator('#cryptF[data-mode="setup"]').count())
    await A.screenshot(path='/tmp/shtab-enc-setup.png')
    await A.click('[data-act="e2e-gen"]');ph=await A.input_value('#cPass');print('phrase',ph,len(ph))
    await A.check('#cAgree');await A.click('#cryptF button[type=submit]');await A.wait_for_timeout(4000)
    db=await A.evaluate("localStorage.getItem('__mockdb')");print('plaintext after:', 'Секретный' in db or 'Тайная' in db,'enc rows',db.count('"enc":1'))
    print('sync',await A.locator('#sync').text_content(),'acct',(await A.locator('#acct').text_content())[:40])
    await A.fill('#newTask','Ещё задача');await A.keyboard.press('Enter');await A.wait_for_timeout(1500)
    db=await A.evaluate("localStorage.getItem('__mockdb')");print('new task plaintext?', 'Ещё задача' in db)
    # encrypted backup
    await A.click('#side [data-screen="projects"]');await A.wait_for_timeout(300)
    async with A.expect_download() as dl: await A.click('[data-act="backup-enc"]')
    d=await dl.value;path=await d.path();txt=open(path).read();print('backup encrypted:', '"enc"' in txt and 'Секретный' not in txt)
    # device B: same mock db/auth, wipe app data
    B=await ctx.new_page();B.on('pageerror',lambda e:errs.append('B:'+str(e)))
    await B.goto(U);await B.evaluate("for(const k of Object.keys(localStorage))if(k.startsWith('shtab.v1'))localStorage.removeItem(k)");await B.reload();await B.wait_for_timeout(2500)
    print('B unlock shown',await B.locator('#cryptF[data-mode="unlock"]').count(),'B sync',await B.locator('#sync').text_content(),'B projects',await B.locator('#side .sn-proj').count())
    await B.fill('#cPass','wrongpass');await B.click('#cryptF button[type=submit]');await B.wait_for_timeout(2500);print('wrong:',await B.locator('#authErr').text_content())
    await B.fill('#cPass',ph);await B.click('#cryptF button[type=submit]');await B.wait_for_timeout(3500)
    print('B after unlock projects',await B.locator('#side .sn-proj').all_text_contents())
    # realtime: A adds task, B sees
    await A.click('#side .sn-proj >> nth=0');await A.fill('#newTask','Онлайн задача');await A.keyboard.press('Enter');await A.wait_for_timeout(2500)
    await B.click('#side .sn-proj >> nth=0');await B.wait_for_timeout(500);print('B sees new task',await B.locator('text=Онлайн задача').count())
    # restore encrypted backup on B
    await B.click('#side [data-screen="projects"]');await B.wait_for_timeout(300)
    await B.set_input_files('#restoreFile',path);await B.wait_for_timeout(500);print('restore asks phrase',await B.locator('#cryptF[data-mode="restore"]').count())
    await B.fill('#cPass',ph);await B.click('#cryptF button[type=submit]');await B.wait_for_timeout(3000);print('restore confirm',await B.locator('.bask').count())
    # change phrase on A, B must lock
    await A.click('[data-act="e2e-menu"]');await A.click('[data-act="e2e-change"]');await A.click('[data-act="e2e-gen"]');ph2=await A.input_value('#cPass');await A.check('#cAgree');await A.click('#cryptF button[type=submit]');await A.wait_for_timeout(4000)
    print('A after change',await A.locator('#sync').text_content());await B.wait_for_timeout(2000);print('B locked',await B.locator('#cryptF[data-mode="unlock"]').count())
    await B.fill('#cPass',ph2);await B.click('#cryptF button[type=submit]');await B.wait_for_timeout(3500);print('B ok',await B.locator('#side .sn-proj').count(),await B.locator('#sync').text_content())
    # turn off
    await A.click('[data-act="e2e-menu"]');await A.click('[data-act="e2e-off"]');await A.click('#cryptF button[type=submit]');await A.wait_for_timeout(3000)
    db=await A.evaluate("localStorage.getItem('__mockdb')");print('after off plaintext',('Секретный' in db),'crypt row', '/crypt"' in db)
    await b.close()
asyncio.run(main());print('ERR',errs)
